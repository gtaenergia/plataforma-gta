"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, BackLink, Kpi, KpiGrid, Loading, Marca, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { formatBRL, parseNumber } from "@/lib/format";
import type { Cliente } from "@/lib/clientes/types";
import { acoesDisponiveis, type AcaoNegociacao } from "@/lib/crm/machine";
import {
  SITUACAO_LABEL,
  SITUACAO_TONE,
  valorDaNegociacao,
  type Contato,
  type Funil,
  type ItemCatalogo,
  type Negociacao,
  type ProdutoCrm,
  type ProdutoNegociado,
} from "@/lib/crm/types";
import { PedirProposta } from "./PedirProposta";
import { TarefasDaNegociacao } from "./TarefasDaNegociacao";
import { dataCurta, dataHora } from "./util";

const ACAO_LABEL: Record<AcaoNegociacao, string> = {
  pausar: "Pausar",
  retomar: "Retomar",
  ganhar: "Marcar como ganha",
  perder: "Marcar como perdida",
  reabrir: "Reabrir",
};

interface UsuarioOpcao {
  email: string;
  name: string;
}

export function NegociacaoDetalhe({ id }: { id: string }) {
  const router = useRouter();
  const [n, setN] = useState<Negociacao | null>(null);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);
  const [fontes, setFontes] = useState<ItemCatalogo[]>([]);
  const [motivos, setMotivos] = useState<ItemCatalogo[]>([]);
  const [catalogo, setCatalogo] = useState<ProdutoCrm[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);

  // Perder pede motivo: o clique abre este mini-formulário em vez de fechar direto.
  const [perdendo, setPerdendo] = useState(false);
  const [motivoEscolhido, setMotivoEscolhido] = useState("");

  const [nota, setNota] = useState("");
  const [novoProduto, setNovoProduto] = useState("");
  const edicao = useEdicaoPendente();

  useEffect(() => {
    Promise.all([
      fetch(`/api/crm/negociacoes/${id}`).then((r) => r.json()),
      fetch("/api/crm/funis").then((r) => r.json()),
      fetch("/api/clientes").then((r) => r.json()),
      fetch("/api/crm/contatos").then((r) => r.json()),
      fetch("/api/usuarios").then((r) => r.json()),
      fetch("/api/crm/fontes").then((r) => r.json()),
      fetch("/api/crm/motivos-perda").then((r) => r.json()),
      fetch("/api/crm/produtos").then((r) => r.json()),
    ])
      .then(([neg, f, c, ct, u, fo, mo, pr]) => {
        if (!neg.negociacao) throw new Error(neg.error ?? "Negociação não encontrada.");
        setN(neg.negociacao);
        setFunis(f.funis ?? []);
        setClientes(c.clientes ?? []);
        setContatos(ct.contatos ?? []);
        setUsuarios(u.usuarios ?? []);
        setFontes(fo.fontes ?? []);
        setMotivos(mo.motivos ?? []);
        setCatalogo(pr.produtos ?? []);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
  }, [id]);

  const funil = useMemo(() => funis.find((f) => f.id === n?.funilId) ?? null, [funis, n?.funilId]);

  /** PATCH parcial: atualiza o estado com a resposta (que pode trazer histórico novo). */
  async function aplicar(patch: Record<string, unknown>): Promise<boolean> {
    setErro(null);
    try {
      const res = await fetch(`/api/crm/negociacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setN(data.negociacao as Negociacao);
      edicao.marcarSalvo();
      return true;
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
      return false;
    }
  }

  async function transicionar(acao: AcaoNegociacao, motivoPerdaId?: string) {
    setAgindo(true);
    setErro(null);
    try {
      const res = await fetch(`/api/crm/negociacoes/${id}/transicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivoPerdaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na ação.");
      setN(data.negociacao as Negociacao);
      setPerdendo(false);
      setMotivoEscolhido("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha na ação.");
    } finally {
      setAgindo(false);
    }
  }

  /** Recarrega a negociação — usado quando as tarefas gravam histórico no servidor. */
  async function recarregar() {
    try {
      const res = await fetch(`/api/crm/negociacoes/${id}`);
      const data = await res.json();
      if (res.ok && data.negociacao) setN(data.negociacao as Negociacao);
    } catch {
      /* melhor manter a ficha atual do que trocar por erro */
    }
  }

  async function registrarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    setErro(null);
    try {
      const res = await fetch(`/api/crm/negociacoes/${id}/anotacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: nota }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao registrar.");
      setN(data.negociacao as Negociacao);
      setNota("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao registrar.");
    }
  }

  async function excluir() {
    if (!n) return;
    if (!window.confirm(`Excluir a negociação "${n.nome}"? O histórico vai junto.`)) return;
    const res = await fetch(`/api/crm/negociacoes/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/crm/negociacoes");
    else setErro("Falha ao excluir.");
  }

  if (loading) return <Loading>Carregando negociação…</Loading>;
  /*
   * Sem a volta, isto era um beco: quem chegasse por um link de uma negociação
   * já excluída (o botão "Ver a negociação" da tarefa em Operações, por
   * exemplo) via um alerta vermelho e mais nada — sem menu, sem link, só o
   * botão de voltar do navegador.
   */
  if (!n) {
    return (
      <div className="space-y-4">
        <BackLink href="/crm/negociacoes">Negociações</BackLink>
        <Alert tone="red" titulo="Negociação não encontrada.">
          {erro ?? "Ela pode ter sido excluída por outra pessoa."}
        </Alert>
      </div>
    );
  }

  const aberta = n.situacao === "aberta" || n.situacao === "pausada";
  const acoes = acoesDisponiveis(n.situacao);

  return (
    <div className="space-y-4">
      <BackLink href="/crm/negociacoes">Negociações</BackLink>
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Situação + indicadores + ações da máquina */}
      <SectionCard
        title={
          <span className="flex flex-wrap items-center gap-2">
            {n.nome}
            <Marca tone={SITUACAO_TONE[n.situacao]}>{SITUACAO_LABEL[n.situacao]}</Marca>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {acoes.map((a) => {
              if (a === "perder") {
                return (
                  <button key={a} className="btn-danger !py-1.5 text-sm" disabled={agindo} onClick={() => setPerdendo((v) => !v)}>
                    {ACAO_LABEL[a]}
                  </button>
                );
              }
              const primaria = a === "ganhar";
              return (
                <button
                  key={a}
                  className={`${primaria ? "btn-primary" : "btn-secondary"} !py-1.5 text-sm`}
                  disabled={agindo}
                  onClick={() => {
                    // Ganhar fecha a negociação e trava a ficha inteira — é tão
                    // irreversível quanto perder, que já pedia o motivo. Um
                    // clique errado ao lado de "Pausar" custava um Reabrir e
                    // uma linha torta no relatório de conversão.
                    if (a === "ganhar" && !window.confirm(`Marcar "${n.nome}" como GANHA?\n\nA negociação sai do funil e a ficha fica travada para edição.`)) return;
                    void transicionar(a);
                  }}
                >
                  {ACAO_LABEL[a]}
                </button>
              );
            })}
          </div>
        }
      >
        {perdendo && (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-end dark:border-red-900 dark:bg-red-950/40">
            <Campo className="flex-1" label="Motivo da perda *">
              <select className="field-input" value={motivoEscolhido} onChange={(e) => setMotivoEscolhido(e.target.value)}>
                <option value="">Escolha…</option>
                {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </Campo>
            <button
              className="btn-danger"
              disabled={agindo || !motivoEscolhido}
              onClick={() => void transicionar("perder", motivoEscolhido)}
            >
              Confirmar perda
            </button>
          </div>
        )}
        {/* Fechada, TODOS os campos ficam cinzas e os botões somem. Sem esta
            faixa a pessoa acha que a tela quebrou — a regra só existia num
            comentário do código. */}
        {!aberta && (
          <Alert tone="indigo" className="mb-4" titulo={`Negociação ${SITUACAO_LABEL[n.situacao].toLowerCase()}.`}>
            Os campos ficam travados para o registro não mudar depois do fechamento. Use <strong>Reabrir</strong> para
            voltar a editar — a decisão anterior continua no histórico.
          </Alert>
        )}
        <KpiGrid>
          <Kpi destaque label="Valor da negociação" value={formatBRL(valorDaNegociacao(n))} />
          <Kpi label="Etapa" value={funil?.etapas.find((e) => e.id === n.etapaId)?.nome ?? "—"} />
          <Kpi label="Previsão" value={n.previsao ? dataCurta(n.previsao) : "—"} />
          {n.situacao === "perdida" ? (
            <Kpi tone="red" label="Motivo da perda" value={n.motivoPerdaNome || "—"} />
          ) : (
            <Kpi label="Responsável" value={n.responsavelNome || "—"} />
          )}
        </KpiGrid>
      </SectionCard>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Dados editáveis */}
          <SectionCard title="Dados da negociação">
            <FormDados
              n={n}
              funil={funil}
              clientes={clientes}
              usuarios={usuarios}
              fontes={fontes}
              aberta={aberta}
              onEditar={edicao.marcarEditado}
              aplicar={aplicar}
            />
          </SectionCard>

          {/* Produtos e serviços */}
          <SectionCard
            title="Produtos e serviços"
            subtitle="Com itens vinculados, o valor da negociação passa a ser a soma deles."
          >
            <ProdutosDaNegociacao
              n={n}
              catalogo={catalogo}
              aberta={aberta}
              novoProduto={novoProduto}
              setNovoProduto={setNovoProduto}
              aplicar={aplicar}
            />
          </SectionCard>

          {/* O elo com Operações: pedir a proposta a quem vai montá-la */}
          <PedirProposta
            negociacao={n}
            produtos={catalogo}
            usuarios={usuarios}
            aberta={aberta}
            onPedido={() => void recarregar()}
          />

          {/* Agenda da negociação */}
          <SectionCard title="Tarefas" subtitle="Os compromissos desta negociação — cada agendamento e conclusão entra no histórico.">
            <TarefasDaNegociacao negociacaoId={id} aberta={aberta} onHistoricoMudou={() => void recarregar()} />
          </SectionCard>

          {/* Histórico imutável */}
          <SectionCard title="Histórico" subtitle="Anotações não podem ser editadas nem excluídas — o registro é definitivo.">
            <form onSubmit={registrarNota} className="mb-4 space-y-2">
              <Campo label="Nova anotação">
                <textarea
                  className="field-input min-h-[70px]"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Ligação, reunião, retorno do cliente…"
                />
              </Campo>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={!nota.trim()}>Registrar</button>
              </div>
            </form>
            <ol className="space-y-3">
              {[...n.anotacoes].reverse().map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gta-navy dark:text-slate-100">{a.autorNome}</span>
                    <span className="hint flex items-center gap-2">
                      {a.tipo === "sistema" && <Badge tone="slate">Sistema</Badge>}
                      {dataHora(a.criadoEm)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{a.texto}</p>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {/* Contatos vinculados */}
          <SectionCard title="Contatos" subtitle="Quem participa desta negociação.">
            {contatos.length === 0 ? (
              <p className="subtitle">Nenhum contato cadastrado ainda — cadastre em Contatos.</p>
            ) : (
              <ul className="space-y-1.5">
                {contatos.map((c) => {
                  const marcado = n.contatoIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <label className="toque flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <input
                          type="checkbox"
                          checked={marcado}
                          disabled={!aberta}
                          onChange={() =>
                            void aplicar({
                              contatoIds: marcado ? n.contatoIds.filter((x) => x !== c.id) : [...n.contatoIds, c.id],
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-slate-800 dark:text-slate-200">{c.nome}</span>
                          {(c.cargo || c.empresaNome) && (
                            <span className="hint block truncate">{[c.cargo, c.empresaNome].filter(Boolean).join(" · ")}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Registro">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><dt className="hint">Criada por</dt><dd>{n.criadoPorNome ?? n.criadoPor}</dd></div>
              <div className="flex justify-between gap-2"><dt className="hint">Criada em</dt><dd>{dataHora(n.criadoEm)}</dd></div>
              {n.fechadoEm && (
                <div className="flex justify-between gap-2"><dt className="hint">Fechada em</dt><dd>{dataHora(n.fechadoEm)}</dd></div>
              )}
              {n.fonteNome && <div className="flex justify-between gap-2"><dt className="hint">Fonte</dt><dd>{n.fonteNome}</dd></div>}
            </dl>
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
              <button className="btn-link-danger text-sm" onClick={() => void excluir()}>Excluir negociação</button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Subpartes

function FormDados({ n, funil, clientes, usuarios, fontes, aberta, onEditar, aplicar }: {
  n: Negociacao;
  funil: Funil | null;
  clientes: Cliente[];
  usuarios: UsuarioOpcao[];
  fontes: ItemCatalogo[];
  aberta: boolean;
  onEditar: () => void;
  aplicar: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const [form, setForm] = useState({
    nome: n.nome,
    valor: String(n.valor).replace(".", ","),
    etapaId: n.etapaId,
    empresaId: n.empresaId,
    responsavel: n.responsavel,
    fonteId: n.fonteId,
    previsao: n.previsao,
    qualificacao: n.qualificacao,
  });
  const [salvando, setSalvando] = useState(false);
  /**
   * Há edição não gravada neste formulário.
   *
   * Sem isto o formulário se reescrevia a cada resposta do servidor — e QUASE
   * TUDO nesta tela responde: registrar anotação, vincular contato, adicionar
   * produto, concluir tarefa. Quem digitasse o nome novo e, antes de salvar,
   * escrevesse uma nota via o campo de histórico, via o nome voltar sozinho ao
   * anterior. Nada avisava; o texto simplesmente sumia.
   */
  const sujo = useRef(false);
  const idAnterior = useRef(n.id);

  // A resposta do servidor traz a negociação inteira, e o formulário acompanha
  // — MENOS quando há edição pendente aqui. Trocar de negociação recomeça.
  useEffect(() => {
    const outraNegociacao = idAnterior.current !== n.id;
    idAnterior.current = n.id;
    if (sujo.current && !outraNegociacao) return;
    sujo.current = false;
    setForm({
      nome: n.nome,
      valor: String(n.valor).replace(".", ","),
      etapaId: n.etapaId,
      empresaId: n.empresaId,
      responsavel: n.responsavel,
      fonteId: n.fonteId,
      previsao: n.previsao,
      qualificacao: n.qualificacao,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n.id, n.atualizadoEm]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    sujo.current = true;
    onEditar();
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const empresa = clientes.find((c) => c.id === form.empresaId);
    const usuario = usuarios.find((u) => u.email === form.responsavel);
    const fonte = fontes.find((f) => f.id === form.fonteId);
    /*
     * O nome denormalizado só é reescrito quando o cadastro foi ENCONTRADO.
     *
     * Antes, `empresa?.nome ?? ""` apagava o nome sempre que o id não batia —
     * e isso acontece quando alguém exclui a empresa em /crm/empresas. Bastava
     * então corrigir a previsão e salvar para o cliente sumir da negociação, da
     * lista e do funil, sem aviso. A denormalização existe justamente para o
     * cadastro apagado NÃO levar a história junto (ver crm/types.ts).
     *
     * Trocou de empresa (id diferente e achado) → atualiza os dois.
     * Manteve o id de um cadastro que sumiu → preserva o nome gravado.
     */
    const trocouEmpresa = form.empresaId !== n.empresaId;
    const trocouFonte = form.fonteId !== n.fonteId;
    const ok = await aplicar({
      nome: form.nome,
      valor: parseNumber(form.valor),
      etapaId: form.etapaId,
      empresaId: form.empresaId,
      empresaNome: empresa?.nome ?? (trocouEmpresa ? "" : n.empresaNome),
      responsavel: usuario?.email ?? n.responsavel,
      responsavelNome: usuario?.name ?? n.responsavelNome,
      fonteId: form.fonteId,
      fonteNome: fonte?.nome ?? (trocouFonte ? "" : n.fonteNome),
      previsao: form.previsao,
      qualificacao: form.qualificacao,
    });
    // Gravou: o formulário volta a acompanhar o servidor. Sem isto ele ficaria
    // "sujo" para sempre e nunca mais refletiria uma mudança vinda de fora.
    if (ok) sujo.current = false;
    setSalvando(false);
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        <Campo className="sm:col-span-4" label="Nome">
          <input className="field-input" value={form.nome} onChange={(e) => set("nome", e.target.value)} disabled={!aberta} />
        </Campo>
        <Campo
          className="sm:col-span-2"
          label="Valor (R$)"
          hint={n.produtos.length > 0 ? <p className="hint mt-1">Calculado pela soma dos produtos abaixo.</p> : undefined}
        >
          <input className="field-input" inputMode="decimal" value={form.valor} onChange={(e) => set("valor", e.target.value)} disabled={!aberta || n.produtos.length > 0} />
        </Campo>
        <Campo className="sm:col-span-2" label="Etapa">
          <select className="field-input" value={form.etapaId} onChange={(e) => set("etapaId", e.target.value)} disabled={!aberta}>
            {(funil?.etapas ?? []).map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
          </select>
        </Campo>
        <Campo className="sm:col-span-2" label="Empresa">
          <select className="field-input" value={form.empresaId} onChange={(e) => set("empresaId", e.target.value)} disabled={!aberta}>
            <option value="">—</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo className="sm:col-span-2" label="Responsável">
          <select className="field-input" value={form.responsavel} onChange={(e) => set("responsavel", e.target.value)} disabled={!aberta}>
            {!usuarios.some((u) => u.email === form.responsavel) && form.responsavel && (
              <option value={form.responsavel}>{n.responsavelNome || form.responsavel}</option>
            )}
            {usuarios.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
          </select>
        </Campo>
        <Campo className="sm:col-span-2" label="Fonte">
          <select className="field-input" value={form.fonteId} onChange={(e) => set("fonteId", e.target.value)} disabled={!aberta}>
            <option value="">—</option>
            {fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
        <Campo className="sm:col-span-2" label="Previsão de fechamento">
          <input type="date" className="field-input" value={form.previsao} onChange={(e) => set("previsao", e.target.value)} disabled={!aberta} />
        </Campo>
        <Campo className="sm:col-span-2" label="Avaliação">
          <select className="field-input" value={form.qualificacao} onChange={(e) => set("qualificacao", Number(e.target.value))} disabled={!aberta}>
            <option value={0}>Sem avaliação</option>
            {[1, 2, 3, 4, 5].map((q) => <option key={q} value={q}>{"★".repeat(q)}</option>)}
          </select>
        </Campo>
      </div>
      {aberta && (
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
        </div>
      )}
    </form>
  );
}

function ProdutosDaNegociacao({ n, catalogo, aberta, novoProduto, setNovoProduto, aplicar }: {
  n: Negociacao;
  catalogo: ProdutoCrm[];
  aberta: boolean;
  novoProduto: string;
  setNovoProduto: (v: string) => void;
  aplicar: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const disponiveis = catalogo.filter((p) => !p.oculto && !n.produtos.some((x) => x.produtoId === p.id));

  async function adicionar() {
    const p = catalogo.find((x) => x.id === novoProduto);
    if (!p) return;
    const item: ProdutoNegociado = {
      produtoId: p.id,
      nome: p.nome,
      preco: p.precoBase,
      quantidade: 1,
      desconto: 0,
      tipoDesconto: "valor",
      recorrencia: "unico",
    };
    if (await aplicar({ produtos: [...n.produtos, item] })) setNovoProduto("");
  }

  async function mudar(idx: number, patch: Partial<ProdutoNegociado>) {
    const produtos = n.produtos.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    await aplicar({ produtos });
  }

  async function remover(idx: number) {
    await aplicar({ produtos: n.produtos.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      {n.produtos.length === 0 && <p className="subtitle">Nenhum produto vinculado.</p>}
      {n.produtos.map((p, i) => {
        const bruto = p.preco * p.quantidade;
        const desconto = p.tipoDesconto === "percentual" ? bruto * (p.desconto / 100) : p.desconto;
        return (
          <div key={p.produtoId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-gta-navy dark:text-slate-100">{p.nome}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold text-gta-navy dark:text-slate-200">{formatBRL(Math.max(0, bruto - desconto))}</span>
                {aberta && (
                  <button type="button" className="btn-link-danger text-xs" onClick={() => void remover(i)}>Remover</button>
                )}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Campo label="Preço (R$)">
                <input
                  className="field-input !py-1 text-sm"
                  inputMode="decimal"
                  defaultValue={String(p.preco).replace(".", ",")}
                  disabled={!aberta}
                  onBlur={(e) => {
                    const v = parseNumber(e.target.value);
                    if (v !== p.preco) void mudar(i, { preco: v });
                  }}
                />
              </Campo>
              <Campo label="Quantidade">
                <input
                  type="number"
                  min={1}
                  className="field-input !py-1 text-sm"
                  defaultValue={p.quantidade}
                  disabled={!aberta}
                  onBlur={(e) => {
                    const v = Math.max(1, Math.round(Number(e.target.value) || 1));
                    if (v !== p.quantidade) void mudar(i, { quantidade: v });
                  }}
                />
              </Campo>
              <Campo label="Desconto">
                <input
                  className="field-input !py-1 text-sm"
                  inputMode="decimal"
                  defaultValue={String(p.desconto).replace(".", ",")}
                  disabled={!aberta}
                  onBlur={(e) => {
                    const v = parseNumber(e.target.value);
                    if (v !== p.desconto) void mudar(i, { desconto: v });
                  }}
                />
              </Campo>
              <Campo label="Tipo de desconto">
                <select
                  className="field-input !py-1 text-sm"
                  value={p.tipoDesconto}
                  disabled={!aberta}
                  onChange={(e) => void mudar(i, { tipoDesconto: e.target.value as ProdutoNegociado["tipoDesconto"] })}
                >
                  <option value="valor">Em R$</option>
                  <option value="percentual">Em %</option>
                </select>
              </Campo>
              <Campo label="Recorrência">
                <select
                  className="field-input !py-1 text-sm"
                  value={p.recorrencia}
                  disabled={!aberta}
                  onChange={(e) => void mudar(i, { recorrencia: e.target.value as ProdutoNegociado["recorrencia"] })}
                >
                  <option value="unico">Única</option>
                  <option value="mensal">Mensal</option>
                </select>
              </Campo>
            </div>
          </div>
        );
      })}

      {aberta && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Campo className="flex-1" label="Adicionar do catálogo">
            <select className="field-input" value={novoProduto} onChange={(e) => setNovoProduto(e.target.value)}>
              <option value="">Escolha um produto ou serviço…</option>
              {disponiveis.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}{p.precoBase > 0 ? ` — ${formatBRL(p.precoBase)}` : ""}</option>
              ))}
            </select>
          </Campo>
          <button type="button" className="btn-secondary whitespace-nowrap" disabled={!novoProduto} onClick={() => void adicionar()}>
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
