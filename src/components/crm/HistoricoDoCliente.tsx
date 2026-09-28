"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, Marca, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { formatBRL, parseNumber } from "@/lib/format";
import {
  MOVIMENTO_AJUDA,
  MOVIMENTO_LABEL,
  MOVIMENTOS,
  NATUREZA_LABEL,
  NATUREZAS,
  RESULTADO_LABEL,
  RESULTADOS,
  type LinhaHistorico,
  type Movimento,
  type Natureza,
  type Resultado,
  type ResumoHistorico,
} from "@/lib/crm/historico";
import { SITUACAO_LABEL, type Negociacao } from "@/lib/crm/types";
import { estacaoLabel } from "@/lib/orcamentos/types";
import { statusPropostaLabel } from "@/lib/propostas/types";
import { buscarJson, enviarJson } from "./buscar";
import { dataCurta, diaLocal } from "./util";

interface Avulsa {
  id: string;
  referencia: string;
  cliente: string;
  servico: string;
  criadoEm: string;
}

const TOM_RESULTADO: Record<Resultado, "green" | "red" | "indigo"> = {
  fechado: "green",
  nao_fechado: "red",
  em_aberto: "indigo",
};

/** Onde a proposta está no operacional — a esteira, quando já entrou nela. */
function situacaoNoOperacional(l: LinhaHistorico): string {
  if (l.estacaoOrcamento) return `Esteira: ${estacaoLabel(l.estacaoOrcamento).toLowerCase()}`;
  if (l.statusProposta) return `Proposta ${statusPropostaLabel(l.statusProposta).toLowerCase()}`;
  return "";
}

/**
 * O histórico do cliente com a GTA: o que ele já pediu e o que aconteceu com
 * cada pedido.
 *
 * As propostas do operacional entram sozinhas, com serviço, valor e datas. O
 * que só o comercial sabe — quando apresentou, se fechou, se foi upsell ou
 * cross-sell, o que o cliente disse — se completa em "Editar". Pedido que
 * nunca virou proposta na plataforma entra em "+ Registrar pedido".
 */
export function HistoricoDoCliente({ clienteId, negociacoes, versao = 0 }: {
  clienteId: string;
  /** Só as deste cliente — para ligar um pedido avulso à negociação. */
  negociacoes: Negociacao[];
  /** Muda quando a ficha recarrega: o resultado automático pode ter mudado. */
  versao?: number;
}) {
  const [linhas, setLinhas] = useState<LinhaHistorico[]>([]);
  const [resumo, setResumo] = useState<ResumoHistorico | null>(null);
  const [avulsas, setAvulsas] = useState<Avulsa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const carregar = useCallback(async () => {
    const d = await buscarJson<{ linhas: LinhaHistorico[]; resumo: ResumoHistorico; avulsas: Avulsa[] }>(
      `/api/crm/historico?cliente=${encodeURIComponent(clienteId)}`,
    );
    setLinhas(d.linhas);
    setResumo(d.resumo);
    setAvulsas(d.avulsas);
  }, [clienteId]);

  useEffect(() => {
    carregar()
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o histórico."))
      .finally(() => setLoading(false));
  }, [carregar, versao]);

  async function recarregar() {
    try {
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao recarregar o histórico.");
    }
  }

  const fecharTudo = () => {
    setEditando(null);
    setCriando(false);
    setVinculando(false);
  };

  const formDe = (l: LinhaHistorico | null) => (
    <FormRegistro
      linha={l}
      clienteId={clienteId}
      negociacoes={negociacoes}
      onSalvo={() => { fecharTudo(); void recarregar(); }}
      onCancelar={fecharTudo}
    />
  );

  return (
    <SectionCard
      title="Histórico com a GTA"
      subtitle="Tudo o que o cliente já pediu. As propostas do operacional entram sozinhas; o resultado, as datas e o tipo de venda você completa."
      actions={
        !criando && !vinculando && (
          <div className="flex flex-wrap gap-2">
            {avulsas.length > 0 && (
              <button className="btn-ghost !py-1.5 text-sm" onClick={() => { fecharTudo(); setVinculando(true); }}>
                Vincular proposta
              </button>
            )}
            <button className="btn-secondary !py-1.5 text-sm" onClick={() => { fecharTudo(); setCriando(true); }}>
              + Registrar pedido
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {erro && <Alert tone="red">{erro}</Alert>}

        {resumo && (
          <KpiGrid>
            <Kpi destaque label="Pedidos" value={resumo.pedidos} />
            <Kpi
              tone={resumo.fechados > 0 ? "green" : undefined}
              label="Fechados"
              value={
                <>
                  {resumo.fechados}
                  {resumo.valorFechado > 0 && (
                    <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">{formatBRL(resumo.valorFechado)}</span>
                  )}
                </>
              }
            />
            <Kpi tone={resumo.naoFechados > 0 ? "red" : undefined} label="Não fechados" value={resumo.naoFechados} />
            <Kpi label="Cliente desde" value={resumo.desde ? dataCurta(resumo.desde) : "—"} />
          </KpiGrid>
        )}

        {criando && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <h3 className="field-label">Novo pedido</h3>
            <p className="hint mb-3">Para o que não passou pelos configuradores — o pedido de antes da plataforma, o combinado por telefone.</p>
            {formDe(null)}
          </div>
        )}

        {vinculando && (
          <VincularProposta
            clienteId={clienteId}
            avulsas={avulsas}
            onVinculada={() => { fecharTudo(); void recarregar(); }}
            onCancelar={fecharTudo}
          />
        )}

        {loading ? (
          <Loading>Carregando o histórico…</Loading>
        ) : linhas.length === 0 ? (
          <EmptyState>
            Nenhum pedido deste cliente ainda. As propostas geradas no operacional com o nome dele aparecem aqui
            sozinhas; o que veio antes da plataforma entra em <strong>+ Registrar pedido</strong>.
          </EmptyState>
        ) : (
          <>
            {/* Cartões no celular, tabela no desktop — o padrão das listas. */}
            <div className="space-y-3 md:hidden">
              {linhas.map((l) => (
                <div key={l.chave} className="card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-medium text-gta-navy dark:text-slate-100">{l.titulo}</span>
                      <span className="hint block">{[l.referencia, situacaoNoOperacional(l)].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Marca tone={TOM_RESULTADO[l.resultado]} className="shrink-0 text-xs">{RESULTADO_LABEL[l.resultado]}</Marca>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <Dado rotulo="Pedido em" valor={l.solicitadoEm ? dataCurta(l.solicitadoEm) : ""} />
                    <Dado rotulo="Valor" valor={l.valor > 0 ? formatBRL(l.valor) : ""} />
                    <Dado rotulo="Natureza" valor={l.natureza ? NATUREZA_LABEL[l.natureza] : ""} sugerido={l.naturezaAutomatica} />
                    <Dado rotulo="Apresentada em" valor={l.apresentadoEm ? dataCurta(l.apresentadoEm) : ""} />
                    <Dado rotulo="Decidido em" valor={l.decididoEm ? dataCurta(l.decididoEm) : ""} />
                    <Dado rotulo="Venda" valor={l.movimento ? MOVIMENTO_LABEL[l.movimento] : ""} />
                  </dl>
                  {l.observacoes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{l.observacoes}</p>}
                  {l.negociacao && (
                    <Link href={`/crm/negociacoes/${l.negociacao.id}`} className="btn-link mt-1 inline-block text-xs">
                      {l.negociacao.nome} · {SITUACAO_LABEL[l.negociacao.situacao]}
                    </Link>
                  )}
                  {editando === l.chave ? (
                    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700">{formDe(l)}</div>
                  ) : (
                    <button className="btn-secondary mt-2 !py-1 text-xs" onClick={() => { fecharTudo(); setEditando(l.chave); }}>
                      Editar
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pedido em</th>
                    <th>O que foi pedido</th>
                    <th>Natureza</th>
                    <th className="text-right">Valor</th>
                    <th>Apresentada</th>
                    <th>Resultado</th>
                    <th>Venda</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <LinhaTabela
                      key={l.chave}
                      l={l}
                      editando={editando === l.chave}
                      onEditar={() => { fecharTudo(); setEditando(l.chave); }}
                      form={formDe(l)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function Dado({ rotulo, valor, sugerido = false }: { rotulo: string; valor: string; sugerido?: boolean }) {
  return (
    <div>
      <dt className="text-slate-500 dark:text-slate-400">{rotulo}</dt>
      <dd className="text-slate-800 dark:text-slate-200">
        {valor || <span className="sem-valor">—</span>}
        {valor && sugerido && <span className="hint"> (sugerida)</span>}
      </dd>
    </div>
  );
}

function LinhaTabela({ l, editando, onEditar, form }: {
  l: LinhaHistorico;
  editando: boolean;
  onEditar: () => void;
  form: React.ReactNode;
}) {
  const nada = <span className="sem-valor">—</span>;
  return (
    <>
      <tr>
        <td className="px-4 py-2 align-top whitespace-nowrap">
          {l.solicitadoEm ? dataCurta(l.solicitadoEm) : nada}
          {l.propostaEm && l.propostaEm !== l.solicitadoEm && (
            <span className="hint block">proposta {dataCurta(l.propostaEm)}</span>
          )}
        </td>
        <td className="px-4 py-2 align-top">
          <span className="block font-medium text-gta-navy dark:text-slate-100">{l.titulo}</span>
          <span className="hint block">{[l.referencia, situacaoNoOperacional(l)].filter(Boolean).join(" · ") || "Pedido registrado à mão"}</span>
          {l.negociacao && (
            <Link href={`/crm/negociacoes/${l.negociacao.id}`} className="btn-link text-xs">
              {l.negociacao.nome} · {SITUACAO_LABEL[l.negociacao.situacao]}
            </Link>
          )}
          {l.observacoes && <p className="mt-1 max-w-md whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{l.observacoes}</p>}
        </td>
        <td className="px-4 py-2 align-top">
          {l.natureza ? NATUREZA_LABEL[l.natureza] : nada}
          {l.natureza && l.naturezaAutomatica && <span className="hint block">sugerida</span>}
        </td>
        <td className="px-4 py-2 align-top text-right tabular-nums">{l.valor > 0 ? formatBRL(l.valor) : nada}</td>
        <td className="px-4 py-2 align-top whitespace-nowrap">{l.apresentadoEm ? dataCurta(l.apresentadoEm) : nada}</td>
        <td className="px-4 py-2 align-top whitespace-nowrap">
          <Marca tone={TOM_RESULTADO[l.resultado]}>{RESULTADO_LABEL[l.resultado]}</Marca>
          {l.decididoEm && <span className="hint block">{dataCurta(l.decididoEm)}</span>}
        </td>
        <td className="px-4 py-2 align-top">{l.movimento ? MOVIMENTO_LABEL[l.movimento] : nada}</td>
        <td className="px-4 py-2 align-top text-right">
          {!editando && (
            <button className="btn-secondary !py-1 text-xs" onClick={onEditar}>
              Editar
            </button>
          )}
        </td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={8} className="px-4 pb-4">
            {form}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * O formulário do registro. Campo vazio = "automático": o que a plataforma já
 * sabe aparece como sugestão, sem ser gravado — se a negociação for ganha
 * amanhã, o resultado acompanha sozinho.
 */
function FormRegistro({ linha, clienteId, negociacoes, onSalvo, onCancelar }: {
  /** `null` = pedido avulso novo. */
  linha: LinhaHistorico | null;
  clienteId: string;
  negociacoes: Negociacao[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const r = linha?.registro ?? null;
  const daProposta = linha?.origem === "proposta";
  const auto = linha?.automatico;

  const [titulo, setTitulo] = useState(r?.titulo ?? "");
  const [natureza, setNatureza] = useState<Natureza | "">(r?.natureza ?? "");
  const [valor, setValor] = useState(r?.valor != null ? String(r.valor).replace(".", ",") : "");
  const [solicitadoEm, setSolicitadoEm] = useState(r?.solicitadoEm ?? "");
  const [apresentadoEm, setApresentadoEm] = useState(r?.apresentadoEm ?? "");
  const [resultado, setResultado] = useState<Resultado | "">(r?.resultado ?? "");
  const [decididoEm, setDecididoEm] = useState(r?.decididoEm ?? "");
  const [movimento, setMovimento] = useState<Movimento | "">(r?.movimento ?? "");
  const [observacoes, setObservacoes] = useState(r?.observacoes ?? "");
  const [negociacaoId, setNegociacaoId] = useState(r?.negociacaoId ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const edicao = useEdicaoPendente();

  const editar = <T,>(setter: (v: T) => void) => (v: T) => {
    edicao.marcarEditado();
    setter(v);
  };

  const resultadoEfetivo = resultado || auto?.resultado || "em_aberto";
  const rotuloAuto = (texto: string) => (texto ? `Automático — ${texto}` : "Automático");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!daProposta && !titulo.trim()) { setErro("Diga o que o cliente pediu."); return; }
    setErro(null);
    setSalvando(true);
    const campos = {
      titulo,
      natureza,
      // Vazio = volta ao valor da proposta; o número é lido à brasileira.
      valor: valor.trim() ? parseNumber(valor) : null,
      solicitadoEm,
      apresentadoEm,
      resultado,
      // Sem resultado escolhido, a data de decisão é a automática.
      decididoEm: resultado && resultado !== "em_aberto" ? decididoEm : "",
      movimento,
      observacoes,
      negociacaoId: daProposta ? "" : negociacaoId,
    };
    try {
      if (r) await enviarJson(`/api/crm/historico/${r.id}`, "PATCH", campos);
      else await enviarJson("/api/crm/historico", "POST", { ...campos, clienteId, propostaId: linha?.propostaId ?? "" });
      edicao.marcarSalvo();
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar.");
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!r) return;
    const pergunta = daProposta
      ? "Apagar o que foi escrito sobre esta proposta?\n\nA proposta continua no histórico, com os dados automáticos."
      : `Excluir o pedido "${r.titulo}" do histórico?\n\nNão há como desfazer.`;
    if (!window.confirm(pergunta)) return;
    try {
      await enviarJson(`/api/crm/historico/${r.id}`, "DELETE");
      edicao.marcarSalvo();
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao apagar.");
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3">
      {erro && <Alert tone="red">{erro}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Campo
          className="sm:col-span-3"
          label={daProposta ? "O que foi pedido" : "O que foi pedido *"}
          hint={daProposta ? <p className="hint mt-1">Em branco, vale o nome do serviço.</p> : undefined}
        >
          <input
            className="field-input"
            value={titulo}
            onChange={(e) => editar(setTitulo)(e.target.value)}
            placeholder={daProposta ? linha?.titulo : "Ex.: Consultoria tarifária"}
          />
        </Campo>
        <Campo className="sm:col-span-3" label="Natureza">
          <select className="field-input" value={natureza} onChange={(e) => editar(setNatureza)(e.target.value as Natureza | "")}>
            <option value="">{daProposta ? rotuloAuto(auto?.natureza ? NATUREZA_LABEL[auto.natureza] : "") : "—"}</option>
            {NATUREZAS.map((n) => <option key={n} value={n}>{NATUREZA_LABEL[n]}</option>)}
          </select>
        </Campo>
        <Campo
          className="sm:col-span-2"
          label="Valor (R$)"
          hint={daProposta ? <p className="hint mt-1">Em branco, vale o da proposta.</p> : undefined}
        >
          <input
            className="field-input tabular-nums"
            inputMode="decimal"
            value={valor}
            onChange={(e) => editar(setValor)(e.target.value)}
            placeholder={daProposta && auto?.valor ? formatBRL(auto.valor) : "0,00"}
          />
        </Campo>
        <Campo
          className="sm:col-span-2"
          label="Pedido em"
          hint={daProposta && auto?.solicitadoEm ? <p className="hint mt-1">Em branco: {dataCurta(auto.solicitadoEm)}, pela data da proposta.</p> : undefined}
        >
          <input type="date" className="field-input" value={solicitadoEm} onChange={(e) => editar(setSolicitadoEm)(e.target.value)} />
        </Campo>
        <Campo className="sm:col-span-2" label="Apresentada ao cliente em">
          <input type="date" className="field-input" value={apresentadoEm} onChange={(e) => editar(setApresentadoEm)(e.target.value)} />
        </Campo>
        <Campo
          className="sm:col-span-2"
          label="Resultado"
          hint={
            !resultado && linha?.negociacao ? (
              <p className="hint mt-1">Automático pela negociação &quot;{linha.negociacao.nome}&quot;.</p>
            ) : undefined
          }
        >
          <select className="field-input" value={resultado} onChange={(e) => editar(setResultado)(e.target.value as Resultado | "")}>
            <option value="">{rotuloAuto(RESULTADO_LABEL[auto?.resultado ?? "em_aberto"])}</option>
            {RESULTADOS.map((x) => <option key={x} value={x}>{RESULTADO_LABEL[x]}</option>)}
          </select>
        </Campo>
        {resultadoEfetivo !== "em_aberto" && (
          <Campo
            className="sm:col-span-2"
            label={resultadoEfetivo === "fechado" ? "Fechou em" : "Decidido em"}
            hint={!resultado && auto?.decididoEm ? <p className="hint mt-1">Automático: {dataCurta(auto.decididoEm)}.</p> : undefined}
          >
            <input
              type="date"
              className="field-input"
              value={resultado ? decididoEm : auto?.decididoEm ?? ""}
              onChange={(e) => editar(setDecididoEm)(e.target.value)}
              disabled={!resultado}
            />
          </Campo>
        )}
        <Campo
          className="sm:col-span-2"
          label="Tipo de venda"
          hint={movimento ? <p className="hint mt-1">{MOVIMENTO_AJUDA[movimento]}</p> : undefined}
        >
          <select className="field-input" value={movimento} onChange={(e) => editar(setMovimento)(e.target.value as Movimento | "")}>
            <option value="">—</option>
            {MOVIMENTOS.map((m) => <option key={m} value={m}>{MOVIMENTO_LABEL[m]}</option>)}
          </select>
        </Campo>
        {!daProposta && (
          <Campo className="sm:col-span-2" label="Negociação">
            <select className="field-input" value={negociacaoId} onChange={(e) => editar(setNegociacaoId)(e.target.value)}>
              <option value="">— Nenhuma —</option>
              {negociacoes.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </Campo>
        )}
      </div>
      <Campo label="Observações">
        <textarea
          className="field-input min-h-[70px]"
          value={observacoes}
          onChange={(e) => editar(setObservacoes)(e.target.value)}
          placeholder="Por que fechou ou não, o que o cliente achou, o que ficou para depois…"
        />
      </Campo>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {r && (
          <button type="button" className="btn-link-danger mr-auto text-sm" onClick={() => void apagar()}>
            {daProposta ? "Apagar o que foi escrito" : "Excluir pedido"}
          </button>
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            edicao.marcarSalvo();
            onCancelar();
          }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

/**
 * Vincular uma proposta cujo nome de cliente não bate com o cadastro.
 *
 * O cliente da proposta é digitado no configurador: "Faz. Rio Doce" não casa
 * com "Fazenda Rio Doce", e a proposta ficaria de fora do histórico para
 * sempre. A lista traz só as que não são de ninguém.
 */
function VincularProposta({ clienteId, avulsas, onVinculada, onCancelar }: {
  clienteId: string;
  avulsas: Avulsa[];
  onVinculada: () => void;
  onCancelar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return avulsas
      .filter((a) => !q || `${a.cliente} ${a.referencia} ${a.servico}`.toLowerCase().includes(q))
      .slice(0, 15);
  }, [avulsas, busca]);

  async function vincular(a: Avulsa) {
    setErro(null);
    setSalvando(a.id);
    try {
      await enviarJson("/api/crm/historico", "POST", { clienteId, propostaId: a.id });
      onVinculada();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao vincular.");
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Campo className="min-w-[220px] flex-1" label="Proposta do operacional sem cliente no cadastro">
          <input
            className="field-input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo cliente, referência ou serviço…"
          />
        </Campo>
        <button type="button" className="btn-secondary" onClick={onCancelar}>Fechar</button>
      </div>
      {erro && <Alert tone="red">{erro}</Alert>}
      {filtradas.length === 0 ? (
        <p className="subtitle">Nenhuma proposta encontrada.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {filtradas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gta-navy dark:text-slate-100">{a.cliente}</span>
                <span className="hint block truncate">
                  {[a.referencia, a.servico, diaLocal(a.criadoEm)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button className="btn-secondary !py-1 text-xs" disabled={salvando !== null} onClick={() => void vincular(a)}>
                {salvando === a.id ? "Vinculando…" : "Vincular a este cliente"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
