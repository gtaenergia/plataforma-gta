"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { formatBRL } from "@/lib/format";
import {
  atividades,
  conversoes,
  cortar,
  pipelinePorEtapa,
  porFonte,
  porProduto,
  porResponsavel,
  type FiltroRelatorio,
  type Periodo,
} from "@/lib/crm/relatorios";
import { PERIODOS, periodoDe, rotuloPeriodo, type ChavePeriodo } from "@/lib/crm/periodos";
import { TIPO_TAREFA_LABEL, type Funil, type Negociacao, type TarefaCrm } from "@/lib/crm/types";
import { buscarJson } from "./buscar";
import { hojeISO } from "./util";

/**
 * Relatórios do CRM.
 *
 * As contas moram em `src/lib/crm/relatorios.ts` — puras e testadas. Esta tela
 * só escolhe o recorte e desenha; nenhuma regra de negócio aqui.
 *
 * Um relatório por vez, com um seletor, como no RD Station: empilhar seis
 * tabelas numa página só faz a pessoa rolar até achar. Os quatro indicadores
 * do topo ficam sempre à vista porque respondem a pergunta mais frequente
 * ("como estamos?") sem exigir escolha nenhuma.
 */

type Qual = "pipeline" | "conversoes" | "fonte" | "responsavel" | "produtos" | "atividades";

const RELATORIOS: { chave: Qual; label: string; descricao: string }[] = [
  { chave: "pipeline", label: "Pipeline por etapa", descricao: "Onde está o dinheiro em jogo, agora. Não depende do período." },
  { chave: "conversoes", label: "Conversões e motivos de perda", descricao: "O que foi fechado no período e por que se perdeu." },
  { chave: "fonte", label: "Negociações por origem", descricao: "De onde vieram as negociações criadas no período." },
  { chave: "responsavel", label: "Desempenho por responsável", descricao: "Criadas, ganhas, perdidas e ticket médio de cada pessoa." },
  { chave: "produtos", label: "Produtos e serviços", descricao: "O que foi mais negociado, em quantidade e valor." },
  { chave: "atividades", label: "Atividades de vendas", descricao: "Tarefas do período, por tipo e situação." },
];

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function RelatoriosCrm() {
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [tarefas, setTarefas] = useState<TarefaCrm[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [qual, setQual] = useState<Qual>("pipeline");
  const [chavePeriodo, setChavePeriodo] = useState<ChavePeriodo>("mes");
  const [funilId, setFunilId] = useState("");
  const [responsavel, setResponsavel] = useState("");

  useEffect(() => {
    Promise.all([
      buscarJson<{ negociacoes: Negociacao[] }>("/api/crm/negociacoes"),
      buscarJson<{ funis: Funil[] }>("/api/crm/funis"),
      buscarJson<{ tarefas: TarefaCrm[] }>("/api/crm/tarefas"),
    ])
      .then(([n, f, t]) => {
        setNegociacoes(n.negociacoes ?? []);
        setFunis(f.funis ?? []);
        setTarefas(t.tarefas ?? []);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar os relatórios."))
      .finally(() => setLoading(false));
  }, []);

  const periodo: Periodo = useMemo(() => periodoDe(chavePeriodo, new Date()), [chavePeriodo]);
  const filtro: FiltroRelatorio = useMemo(() => ({ periodo, funilId, responsavel }), [periodo, funilId, responsavel]);

  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const n of negociacoes) if (n.responsavel) mapa.set(n.responsavel, n.responsavelNome || n.responsavel);
    return Array.from(mapa, ([email, nome]) => ({ email, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [negociacoes]);

  const conv = useMemo(() => conversoes(negociacoes, filtro), [negociacoes, filtro]);
  const emJogo = useMemo(() => {
    const base = cortar(negociacoes, filtro);
    const abertas = base.filter((n) => n.situacao === "aberta" || n.situacao === "pausada");
    return { quantidade: abertas.length, valor: abertas.reduce((s, n) => s + valor(n), 0) };
  }, [negociacoes, filtro]);

  if (loading) return <Loading>Carregando os relatórios…</Loading>;
  if (erro) {
    return (
      <Alert tone="red" titulo="Não foi possível carregar os relatórios.">
        {erro}{" "}
        <button type="button" className="btn-link" onClick={() => window.location.reload()}>Tentar de novo</button>
      </Alert>
    );
  }
  if (negociacoes.length === 0) {
    return <EmptyState>Ainda não há negociações para medir. Os relatórios aparecem assim que a primeira for criada.</EmptyState>;
  }

  const escolhido = RELATORIOS.find((r) => r.chave === qual)!;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Campo className="min-w-[160px]" label="Período">
          <select className="field-input" value={chavePeriodo} onChange={(e) => setChavePeriodo(e.target.value as ChavePeriodo)}>
            {PERIODOS.map((p) => <option key={p.chave} value={p.chave}>{p.label}</option>)}
          </select>
        </Campo>
        {funis.length > 1 && (
          <Campo className="min-w-[160px]" label="Funil">
            <select className="field-input" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              <option value="">Todos</option>
              {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo className="min-w-[180px]" label="Responsável">
          <select className="field-input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {responsaveis.map((r) => <option key={r.email} value={r.email}>{r.nome}</option>)}
          </select>
        </Campo>
      </div>

      {/* O resumo fica sempre à vista — é a pergunta que não precisa de escolha. */}
      <KpiGrid>
        <Kpi destaque label="Em jogo agora" value={formatBRL(emJogo.valor)} />
        <Kpi label="Negociações abertas" value={emJogo.quantidade} />
        <Kpi tone="green" label={`Ganho — ${rotuloPeriodo(periodo)}`} value={`${formatBRL(conv.valorGanho)} (${conv.ganhas})`} />
        <Kpi
          tone={conv.taxa !== null && conv.taxa < 0.3 ? "amber" : undefined}
          label="Taxa de conversão"
          value={conv.taxa === null ? "—" : pct(conv.taxa)}
        />
      </KpiGrid>

      <SectionCard title={escolhido.label} subtitle={escolhido.descricao} actions={
        <Campo label="">
          <select className="field-input !w-auto" value={qual} onChange={(e) => setQual(e.target.value as Qual)} aria-label="Tipo de relatório">
            {RELATORIOS.map((r) => <option key={r.chave} value={r.chave}>{r.label}</option>)}
          </select>
        </Campo>
      }>
        {qual === "pipeline" && <Pipeline negociacoes={negociacoes} funis={funis} filtro={filtro} />}
        {qual === "conversoes" && <Conversoes conv={conv} />}
        {qual === "fonte" && <PorChave linhas={porFonte(negociacoes, filtro)} rotulo="Fonte" />}
        {qual === "responsavel" && <PorResponsavel linhas={porResponsavel(negociacoes, filtro)} />}
        {qual === "produtos" && <Produtos linhas={porProduto(negociacoes, filtro)} />}
        {qual === "atividades" && <Atividades dados={atividades(tarefas, filtro, hojeISO())} />}
      </SectionCard>
    </div>
  );
}

/** Repetido do motor para o KPI de "em jogo" — mesma regra de `valorDaNegociacao`. */
function valor(n: Negociacao): number {
  if (!n.produtos.length) return n.valor;
  return n.produtos.reduce((s, p) => {
    const bruto = p.preco * p.quantidade;
    const desc = p.tipoDesconto === "percentual" ? bruto * (p.desconto / 100) : p.desconto;
    return s + Math.max(0, bruto - desc);
  }, 0);
}

// ----------------------------------------------------------------- Tabelas

function Vazio({ children }: { children: React.ReactNode }) {
  return <EmptyState className="!p-6">{children}</EmptyState>;
}

function Pipeline({ negociacoes, funis, filtro }: { negociacoes: Negociacao[]; funis: Funil[]; filtro: FiltroRelatorio }) {
  const alvos = filtro.funilId ? funis.filter((f) => f.id === filtro.funilId) : funis;
  const comResponsavel = filtro.responsavel
    ? negociacoes.filter((n) => n.responsavel === filtro.responsavel)
    : negociacoes;

  return (
    <div className="space-y-5">
      {alvos.map((funil) => {
        const linhas = pipelinePorEtapa(comResponsavel, funil);
        const total = linhas.reduce((s, l) => s + l.valor, 0);
        const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
        return (
          <div key={funil.id}>
            {funis.length > 1 && <h3 className="mb-2 text-sm font-semibold text-gta-navy dark:text-slate-100">{funil.nome}</h3>}
            {qtd === 0 ? (
              <Vazio>Nenhuma negociação em aberto neste funil.</Vazio>
            ) : (
              <div className="overflow-x-auto card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th className="text-right">Negociações</th>
                      <th className="text-right">Valor previsto</th>
                      <th className="text-right">% do funil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.etapaId}>
                        <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">{l.etapa}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{l.quantidade}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBRL(l.valor)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {total > 0 ? pct(l.valor / total) : "—"}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{qtd}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatBRL(total)}</td>
                      <td className="px-4 py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Conversoes({ conv }: { conv: ReturnType<typeof conversoes> }) {
  const totalMotivos = conv.motivos.reduce((s, m) => s + m.quantidade, 0);
  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi label="Criadas" value={conv.criadas} />
        <Kpi tone="green" label="Ganhas" value={conv.ganhas} />
        <Kpi tone={conv.perdidas > 0 ? "red" : undefined} label="Perdidas" value={conv.perdidas} />
        <Kpi label="Ticket médio" value={conv.ganhas > 0 ? formatBRL(conv.valorGanho / conv.ganhas) : "—"} />
      </KpiGrid>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gta-navy dark:text-slate-100">Por que se perdeu</h3>
        {conv.motivos.length === 0 ? (
          <Vazio>Nenhuma negociação perdida no período.</Vazio>
        ) : (
          <div className="overflow-x-auto card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th className="text-right">Negociações</th>
                  <th className="text-right">% das perdas</th>
                </tr>
              </thead>
              <tbody>
                {conv.motivos.map((m) => (
                  <tr key={m.nome}>
                    <td className="px-4 py-2 text-gta-navy dark:text-slate-100">{m.nome}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{m.quantidade}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                      {totalMotivos > 0 ? pct(m.quantidade / totalMotivos) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PorChave({ linhas, rotulo }: { linhas: ReturnType<typeof porFonte>; rotulo: string }) {
  if (linhas.length === 0) return <Vazio>Nenhuma negociação criada no período.</Vazio>;
  return (
    <div className="overflow-x-auto card">
      <table className="data-table">
        <thead>
          <tr>
            <th>{rotulo}</th>
            <th className="text-right">Criadas</th>
            <th className="text-right">Ganhas</th>
            <th className="text-right">Aproveitamento</th>
            <th className="text-right">Valor gerado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave}>
              <td className="px-4 py-2 text-gta-navy dark:text-slate-100">{l.chave}</td>
              <td className="px-4 py-2 text-right tabular-nums">{l.criadas}</td>
              <td className="px-4 py-2 text-right tabular-nums">{l.ganhas}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                {l.criadas > 0 ? pct(l.ganhas / l.criadas) : "—"}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBRL(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PorResponsavel({ linhas }: { linhas: ReturnType<typeof porResponsavel> }) {
  if (linhas.length === 0) return <Vazio>Nenhuma movimentação no período.</Vazio>;
  return (
    <div className="overflow-x-auto card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Responsável</th>
            <th className="text-right">Criadas</th>
            <th className="text-right">Ganhas</th>
            <th className="text-right">Perdidas</th>
            <th className="text-right">Conversão</th>
            <th className="text-right">Vendido</th>
            <th className="text-right">Ticket médio</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const fechadas = l.ganhas + l.perdidas;
            return (
              <tr key={l.responsavel}>
                <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">{l.responsavel}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.criadas}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.ganhas}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.perdidas}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {fechadas > 0 ? pct(l.ganhas / fechadas) : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBRL(l.valorGanho)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {l.ticketMedio > 0 ? formatBRL(l.ticketMedio) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Produtos({ linhas }: { linhas: ReturnType<typeof porProduto> }) {
  if (linhas.length === 0) return <Vazio>Nenhum produto vinculado às negociações do período.</Vazio>;
  return (
    <div className="overflow-x-auto card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Produto ou serviço</th>
            <th className="text-right">Quantidade</th>
            <th className="text-right">Em negociações ganhas</th>
            <th className="text-right">Valor negociado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome}>
              <td className="px-4 py-2 text-gta-navy dark:text-slate-100">{l.nome}</td>
              <td className="px-4 py-2 text-right tabular-nums">{l.quantidade.toLocaleString("pt-BR")}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{l.emGanhas.toLocaleString("pt-BR")}</td>
              <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBRL(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Atividades({ dados }: { dados: ReturnType<typeof atividades> }) {
  if (dados.total === 0) return <Vazio>Nenhuma tarefa com data no período.</Vazio>;
  return (
    <div className="space-y-4">
      <KpiGrid>
        <Kpi label="Tarefas no período" value={dados.total} />
        <Kpi tone="green" label="Concluídas" value={dados.concluidas} />
        <Kpi label="Pendentes" value={dados.pendentes} />
        <Kpi tone={dados.atrasadas > 0 ? "red" : undefined} label="Atrasadas" value={dados.atrasadas} />
      </KpiGrid>
      <div className="overflow-x-auto card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th className="text-right">Total</th>
              <th className="text-right">Concluídas</th>
              <th className="text-right">Conclusão</th>
            </tr>
          </thead>
          <tbody>
            {dados.porTipo.map((t) => (
              <tr key={t.tipo}>
                <td className="px-4 py-2 text-gta-navy dark:text-slate-100">{TIPO_TAREFA_LABEL[t.tipo]}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.total}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.concluidas}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {t.total > 0 ? pct(t.concluidas / t.total) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
