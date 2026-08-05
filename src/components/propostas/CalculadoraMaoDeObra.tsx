"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { Alert, Badge } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { calcularComposicao, markupDe } from "@/lib/mao-de-obra/motor";
import { lerHoras } from "@/lib/custo-equipe/sugestao";
import type { Funcao } from "@/lib/mao-de-obra/types";
import type { TipoDemanda } from "@/lib/capacidade/types";

/**
 * Calculadora de mão de obra terceirizada.
 *
 * Ferramenta, não formulário: NÃO gera proposta e não cria orçamento. A
 * entrega é uma planilha com a memória de cálculo — e a planilha sai com
 * FÓRMULAS, então quem receber muda a margem e vê o preço se mover sem
 * precisar da plataforma.
 *
 * Exige `financeiro.ver`: uma calculadora que mostra custo e margem não faz
 * sentido para quem não pode enxergá-los. Sem a permissão a rota nem devolve
 * o R$/h das funções, e o card não aparece.
 *
 * O cálculo roda AQUI, no navegador, porque quem tem a permissão já recebeu os
 * custos — e uma calculadora precisa responder a cada tecla.
 */

const moeda = (cent: number) => (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Linha {
  funcaoId: string;
  pessoas: string;
  horas: string;
}

const LINHA_VAZIA: Linha = { funcaoId: "", pessoas: "1", horas: "" };

export function CalculadoraMaoDeObra({ podeConfigurar }: { podeConfigurar: boolean }) {
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  /**
   * Quatro estados, e não um booleano, porque "não aparece" precisa ter causa.
   *
   * A primeira versão engolia qualquer falha e devolvia `null` — some o card,
   * some a explicação, e quem olha a tela não tem o que reportar. Sumir é
   * intencional só quando falta permissão; falha de carregamento tem que
   * dizer o que houve.
   */
  const [estado, setEstado] = useState<"carregando" | "erro" | "pronto">("carregando");
  const [falha, setFalha] = useState("");
  const [aberto, setAberto] = useState(false);

  const [cliente, setCliente] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([{ ...LINHA_VAZIA }]);
  const [imposto, setImposto] = useState("");
  const [margem, setMargem] = useState("");
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [origemHoras, setOrigemHoras] = useState<string | null>(null);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvouConfig, setSalvouConfig] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/mao-de-obra");
        // Sessão vencida não devolve JSON: o middleware desvia para o login e
        // o `fetch` segue o desvio, entregando 200 com HTML. Olhar só o status
        // diria que deu certo.
        const tipo = r.headers.get("content-type") ?? "";
        if (!tipo.includes("application/json")) {
          setFalha("Sua sessão expirou. Entre novamente para usar a calculadora.");
          return setEstado("erro");
        }
        const d = await r.json();
        if (!r.ok || !d.config) {
          setFalha(d.error ?? "Não foi possível carregar o catálogo de mão de obra.");
          return setEstado("erro");
        }

        setFuncoes(d.config.funcoes ?? []);
        setImposto(String((d.config.impostoPadrao ?? 0) * 100).replace(".", ","));
        setMargem(String((d.config.margemPadrao ?? 0) * 100).replace(".", ","));
        setEstado("pronto");

        // O catálogo de demandas é opcional: falhar aqui não impede calcular.
        const rc = await fetch("/api/planejamento");
        const dc = await rc.json().catch(() => null);
        if (rc.ok && dc) setTipos((dc.config?.tipos ?? []).filter((t: TipoDemanda) => t.minutos > 0));
      } catch (e) {
        setFalha(e instanceof Error ? e.message : "Falha ao carregar a calculadora.");
        setEstado("erro");
      }
    })();
  }, []);

  const taxas = useMemo(
    () => ({ imposto: pctParaFracao(imposto), margem: pctParaFracao(margem) }),
    [imposto, margem],
  );

  const composicao = useMemo(
    () =>
      calcularComposicao(
        linhas
          .filter((l) => l.funcaoId && lerHoras(l.horas) > 0)
          .map((l) => ({ funcaoId: l.funcaoId, pessoas: lerHoras(l.pessoas), horas: lerHoras(l.horas) })),
        { funcoes },
        taxas,
      ),
    [linhas, funcoes, taxas],
  );
  /*
   * O cabeçalho aparece SEMPRE. Quem chegou até aqui já tem permissão — isso
   * foi decidido no servidor — então o card não tem mais motivo para sumir.
   *
   * Devolver `null` enquanto carrega foi o que produziu "não tá aparecendo":
   * qualquer tropeço na API deixava a tela idêntica à de quem não tem acesso.
   */
  if (estado !== "pronto") {
    return (
      <section className="section-card">
        <h2 className="section-title">Calculadora de mão de obra</h2>
        {estado === "carregando" ? (
          <p className="hint mt-2">Carregando o catálogo de funções…</p>
        ) : (
          <Alert tone="amber" className="mt-3">{falha}</Alert>
        )}
      </section>
    );
  }

  function escolherTipo(id: string) {
    setTipoId(id);
    const t = tipos.find((x) => x.id === id);
    if (!t) return setOrigemHoras(null);
    const horas = t.minutos / 60;
    setLinhas((ls) => {
      const [primeira, ...resto] = ls.length ? ls : [{ ...LINHA_VAZIA }];
      return [{ ...primeira, horas: String(horas).replace(".", ",") }, ...resto];
    });
    // Honestidade sobre a origem: essas durações foram cadastradas para
    // planejar a equipe INTERNA. Servem de ponto de partida para a mão de obra
    // contratada, não de verdade.
    setOrigemHoras(
      `${horas.toLocaleString("pt-BR")} h vindas do catálogo de demandas, que foi cadastrado para a equipe interna. Ajuste para a realidade da equipe contratada.`,
    );
  }

  async function salvarFuncoes() {
    setSalvandoConfig(true);
    setErro(null);
    setSalvouConfig(false);
    try {
      const r = await fetch("/api/mao-de-obra", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Linha em branco é rascunho de quem clicou em acrescentar e desistiu.
          funcoes: funcoes.filter((f) => f.nome.trim() !== ""),
          impostoPadrao: taxas.imposto,
          margemPadrao: taxas.margem,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar.");
      setFuncoes(d.config.funcoes ?? []);
      setSalvouConfig(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar as funções.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function baixar() {
    setBaixando(true);
    setErro(null);
    try {
      const dados = {
        cliente,
        servico: tipos.find((t) => t.id === tipoId)?.nome ?? "",
        imposto: taxas.imposto,
        margem: taxas.margem,
        linhas: linhas
          .filter((l) => l.funcaoId && lerHoras(l.horas) > 0)
          .map((l) => {
            const f = funcoes.find((x) => x.id === l.funcaoId);
            return {
              funcao: f?.nome ?? "—",
              pessoas: lerHoras(l.pessoas) || 1,
              horas: lerHoras(l.horas),
              custoHora: f?.custoHora ?? 0,
            };
          }),
      };
      const r = await fetch("/api/planilha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: "mao-de-obra", data: dados, nome: nomeArquivo(cliente) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Falha ao gerar a planilha.");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nomeArquivo(cliente)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setBaixando(false);
    }
  }

  const semCusto = funcoes.filter((f) => f.custoHora <= 0).length;
  const semSolucao = composicao.impedimento === "divisor_invalido";
  const temResultado = composicao.precoCent > 0;

  return (
    <section className="section-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Calculadora de mão de obra</h2>
          <p className="hint mt-1">
            Quanto cobrar por um trabalho executado por equipe contratada. Não gera proposta — a
            entrega é uma planilha com a conta aberta.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Abrir calculadora"}
        </button>
      </div>

      {!aberto ? null : (
        <div className="mt-5 space-y-5">
          {erro && <Alert tone="red">{erro}</Alert>}

          {/* O cadastro mora AQUI, e não numa tela de administração à parte:
              quem calcula é quem sabe quanto custa a hora de cada função. */}
          {podeConfigurar && (
            <details className="rounded-lg border border-slate-200 p-4 dark:border-slate-700" open={funcoes.length === 0}>
              <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">
                Funções e custo por hora
                {semCusto > 0 && <Badge tone="amber" className="ml-2">{semCusto} sem custo</Badge>}
              </summary>

              <div className="mt-4 space-y-3">
                {funcoes.map((f) => (
                  <div key={f.id} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <Campo className="sm:col-span-7" label="">
                      <input
                        className="field-input"
                        value={f.nome}
                        placeholder="Ex.: Eletricista"
                        aria-label="Nome da função"
                        onChange={(e) =>
                          setFuncoes((fs) => fs.map((x) => (x.id === f.id ? { ...x, nome: e.target.value } : x)))
                        }
                      />
                    </Campo>
                    <Campo className="sm:col-span-4" label="">
                      <div className="flex items-center gap-2">
                        <span className="hint shrink-0">R$/h</span>
                        <input
                          className="field-input tabular-nums"
                          inputMode="decimal"
                          aria-label={`Custo por hora de ${f.nome || "função sem nome"}`}
                          value={f.custoHora > 0 ? String(f.custoHora).replace(".", ",") : ""}
                          placeholder="0,00"
                          onChange={(e) =>
                            setFuncoes((fs) =>
                              fs.map((x) => (x.id === f.id ? { ...x, custoHora: pctParaNumero(e.target.value) } : x)),
                            )
                          }
                        />
                      </div>
                    </Campo>
                    <div className="flex items-end sm:col-span-1">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remover ${f.nome || "função sem nome"}`}
                        onClick={() => setFuncoes((fs) => fs.filter((x) => x.id !== f.id))}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    // `randomUUID` para o id NUNCA colidir com o de uma função
                    // apagada — uma planilha antiga apontaria para o custo errado.
                    setFuncoes((fs) => [...fs, { id: crypto.randomUUID(), nome: "", custoHora: 0 }])
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden /> Acrescentar função
                </button>
                <button type="button" className="btn-primary" onClick={salvarFuncoes} disabled={salvandoConfig}>
                  {salvandoConfig ? "Salvando…" : "Salvar funções"}
                </button>
                {salvouConfig && <span className="hint">Salvo.</span>}
              </div>
            </details>
          )}

          {funcoes.length === 0 && !podeConfigurar && (
            <Alert tone="amber" titulo="Nenhuma função cadastrada">
              Um administrador precisa cadastrar as funções e o custo por hora antes de a calculadora
              montar um preço.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Cliente ou obra" hint={<p className="hint mt-1">Só para identificar a planilha</p>}>
              <input className="field-input" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: Bertanzin Madeiras" />
            </Campo>
            <Campo
              label="Partir de um tipo de demanda"
              hint={<p className="hint mt-1">{tipos.length === 0 ? "Nenhum tipo com duração cadastrada" : "Preenche as horas da primeira linha"}</p>}
            >
              <select className="field-input" value={tipoId} onChange={(e) => escolherTipo(e.target.value)} disabled={tipos.length === 0}>
                <option value="">Começar do zero</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.categoria} — {t.nome} ({(t.minutos / 60).toLocaleString("pt-BR")} h)
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {origemHoras && <Alert tone="indigo">{origemHoras}</Alert>}

          <div>
            <h3 className="text-sm font-semibold text-gta-navy dark:text-slate-100">Equipe</h3>
            <div className="mt-3 space-y-3">
              {linhas.map((l, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <Campo className="sm:col-span-5" label={i === 0 ? "Função" : ""}>
                    <select
                      className="field-input"
                      value={l.funcaoId}
                      onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, funcaoId: e.target.value } : x)))}
                    >
                      <option value="">Selecione…</option>
                      {funcoes.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                          {f.custoHora > 0 ? ` — ${f.custoHora.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/h` : " (sem custo)"}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo className="sm:col-span-3" label={i === 0 ? "Pessoas" : ""}>
                    <input
                      className="field-input tabular-nums"
                      inputMode="numeric"
                      value={l.pessoas}
                      onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, pessoas: e.target.value } : x)))}
                    />
                  </Campo>
                  <Campo
                    className="sm:col-span-3"
                    label={i === 0 ? "Horas cada" : ""}
                    hint={i === 0 ? <p className="hint mt-1">Aceita &quot;5 x 8&quot;</p> : undefined}
                  >
                    <input
                      className="field-input tabular-nums"
                      value={l.horas}
                      placeholder="0"
                      onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))}
                    />
                  </Campo>
                  <div className="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ ...LINHA_VAZIA }]))}
                      aria-label={`Remover linha ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary mt-3" onClick={() => setLinhas((ls) => [...ls, { ...LINHA_VAZIA }])}>
              <Plus className="h-4 w-4" aria-hidden /> Acrescentar função
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo label="Imposto (%)">
              <input className="field-input tabular-nums" inputMode="decimal" value={imposto} onChange={(e) => setImposto(e.target.value)} />
            </Campo>
            <Campo label="Margem (%)">
              <input className="field-input tabular-nums" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} />
            </Campo>
            <div>
              <span className="field-label">Markup</span>
              <p className="mt-1 text-lg font-semibold tabular-nums text-gta-navy dark:text-slate-100">
                {semSolucao ? "—" : markupDe(taxas.imposto, taxas.margem).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
              </p>
            </div>
          </div>

          <p className="hint">
            As taxas mudam só nesta conta — o padrão da empresa continua como está em Mão de obra
            terceirizada.
          </p>

          {semSolucao ? (
            <Alert tone="red" titulo="Imposto e margem somam 100% ou mais">
              Não existe preço para essa combinação: os dois são percentuais do preço final.
            </Alert>
          ) : (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <p className="text-3xl font-semibold tabular-nums text-gta-navy dark:text-slate-100">
                {moeda(composicao.precoCent)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <dt className="text-slate-600 dark:text-slate-400">Custo</dt>
                <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.custoCent)}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Imposto</dt>
                <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.impostoCent)}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Lucro</dt>
                <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.lucroCent)}</dd>
                <dt className="text-slate-600 dark:text-slate-400">Horas</dt>
                <dd className="tabular-nums text-slate-700 dark:text-slate-300">
                  {composicao.linhas.reduce((s, l) => s + l.horasTotais, 0).toLocaleString("pt-BR")} h
                </dd>
              </dl>
              {composicao.incompleta && (
                <Badge tone="amber" className="mt-3">alguma função está sem custo cadastrado</Badge>
              )}
            </div>
          )}

          <button type="button" className="btn-primary" onClick={baixar} disabled={baixando || !temResultado}>
            <Download className="h-4 w-4" aria-hidden />
            {baixando ? "Gerando…" : "Baixar planilha"}
          </button>
        </div>
      )}
    </section>
  );
}

function pctParaNumero(txt: string): number {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function pctParaFracao(txt: string): number {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : 0;
}

function nomeArquivo(cliente: string): string {
  const base = cliente.trim() ? `mao-de-obra-${cliente.trim()}` : "mao-de-obra";
  return base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 60);
}
