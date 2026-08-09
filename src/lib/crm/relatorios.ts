import type { Funil, Negociacao, TarefaCrm, TipoTarefa } from "./types";
import { totalDoItem, valorDaNegociacao } from "./types";

/**
 * Agregações dos relatórios do CRM — puras, sem I/O, para valerem teste.
 *
 * Convenções de data (as mesmas do RD):
 * - "criadas no período" olha `criadoEm`;
 * - "ganhas/perdidas no período" olham `fechadoEm` — uma negociação criada em
 *   junho e ganha em agosto conta na conversão de agosto, não na de junho;
 * - o pipeline não tem período: é fotografia do estado atual do funil.
 */

/** Limites inclusivos em YYYY-MM-DD; string vazia = sem limite daquele lado. */
export interface Periodo {
  inicio: string;
  fim: string;
}

export const PERIODO_TUDO: Periodo = { inicio: "", fim: "" };

/** `iso` pode ser timestamp completo — compara só o dia. */
export function noPeriodo(iso: string, p: Periodo): boolean {
  const dia = iso.slice(0, 10);
  if (!dia) return false;
  if (p.inicio && dia < p.inicio) return false;
  if (p.fim && dia > p.fim) return false;
  return true;
}

export interface FiltroRelatorio {
  periodo: Periodo;
  funilId: string; // "" = todos
  responsavel: string; // "" = todos
}

/** Corte por funil e responsável — o período é aplicado por métrica (ver topo). */
export function cortar(negs: Negociacao[], f: FiltroRelatorio): Negociacao[] {
  return negs.filter(
    (n) => (!f.funilId || n.funilId === f.funilId) && (!f.responsavel || n.responsavel === f.responsavel),
  );
}

// ---------------------------------------------------------------- Pipeline

export interface LinhaPipeline {
  etapaId: string;
  etapa: string;
  quantidade: number;
  valor: number;
}

/** Fotografia do funil: abertas e pausadas, por etapa, na ordem do funil. */
export function pipelinePorEtapa(negs: Negociacao[], funil: Funil): LinhaPipeline[] {
  const emJogo = negs.filter((n) => n.funilId === funil.id && (n.situacao === "aberta" || n.situacao === "pausada"));
  return funil.etapas.map((e) => {
    const daEtapa = emJogo.filter((n) => n.etapaId === e.id);
    return {
      etapaId: e.id,
      etapa: e.nome,
      quantidade: daEtapa.length,
      valor: daEtapa.reduce((s, n) => s + valorDaNegociacao(n), 0),
    };
  });
}

// -------------------------------------------------------------- Conversões

export interface Conversoes {
  criadas: number;
  ganhas: number;
  perdidas: number;
  valorGanho: number;
  /** Ganhas ÷ fechadas (ganhas + perdidas); null sem fechamento no período. */
  taxa: number | null;
  motivos: { nome: string; quantidade: number }[];
}

export function conversoes(negs: Negociacao[], f: FiltroRelatorio): Conversoes {
  const base = cortar(negs, f);
  const criadas = base.filter((n) => noPeriodo(n.criadoEm, f.periodo)).length;
  const ganhas = base.filter((n) => n.situacao === "ganha" && noPeriodo(n.fechadoEm, f.periodo));
  const perdidas = base.filter((n) => n.situacao === "perdida" && noPeriodo(n.fechadoEm, f.periodo));

  const contagem = new Map<string, number>();
  for (const n of perdidas) {
    const nome = n.motivoPerdaNome || "Sem motivo";
    contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  const fechadas = ganhas.length + perdidas.length;
  return {
    criadas,
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    valorGanho: ganhas.reduce((s, n) => s + valorDaNegociacao(n), 0),
    taxa: fechadas > 0 ? ganhas.length / fechadas : null,
    motivos: Array.from(contagem, ([nome, quantidade]) => ({ nome, quantidade })).sort(
      (a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"),
    ),
  };
}

// ------------------------------------------------------- Por fonte / origem

export interface LinhaPorChave {
  chave: string;
  criadas: number;
  ganhas: number;
  valor: number;
}

/** Negociações criadas no período, agrupadas pela fonte de origem. */
export function porFonte(negs: Negociacao[], f: FiltroRelatorio): LinhaPorChave[] {
  return agrupar(
    cortar(negs, f).filter((n) => noPeriodo(n.criadoEm, f.periodo)),
    (n) => n.fonteNome || "Sem fonte",
  );
}

// -------------------------------------------------------- Por responsável

export interface LinhaResponsavel {
  responsavel: string;
  criadas: number;
  ganhas: number;
  perdidas: number;
  valorGanho: number;
  ticketMedio: number;
}

export function porResponsavel(negs: Negociacao[], f: FiltroRelatorio): LinhaResponsavel[] {
  const base = cortar(negs, f);
  const mapa = new Map<string, LinhaResponsavel>();
  const linha = (nome: string): LinhaResponsavel => {
    if (!mapa.has(nome)) mapa.set(nome, { responsavel: nome, criadas: 0, ganhas: 0, perdidas: 0, valorGanho: 0, ticketMedio: 0 });
    return mapa.get(nome)!;
  };
  for (const n of base) {
    const nome = n.responsavelNome || n.responsavel || "Sem responsável";
    if (noPeriodo(n.criadoEm, f.periodo)) linha(nome).criadas += 1;
    if (n.situacao === "ganha" && noPeriodo(n.fechadoEm, f.periodo)) {
      const l = linha(nome);
      l.ganhas += 1;
      l.valorGanho += valorDaNegociacao(n);
    }
    if (n.situacao === "perdida" && noPeriodo(n.fechadoEm, f.periodo)) linha(nome).perdidas += 1;
  }
  for (const l of mapa.values()) l.ticketMedio = l.ganhas > 0 ? l.valorGanho / l.ganhas : 0;
  return Array.from(mapa.values()).sort((a, b) => b.valorGanho - a.valorGanho || b.criadas - a.criadas);
}

// ------------------------------------------------------ Produtos e serviços

export interface LinhaProduto {
  nome: string;
  /** Soma das quantidades nos itens das negociações. */
  quantidade: number;
  /** Valor pontual (itens de recorrência única). */
  valor: number;
  /** Valor por mês (itens recorrentes) — contado à parte, não somado ao acima. */
  valorMensal: number;
  emGanhas: number;
}

/** Itens das negociações criadas no período (valor já com desconto). */
export function porProduto(negs: Negociacao[], f: FiltroRelatorio): LinhaProduto[] {
  const base = cortar(negs, f).filter((n) => noPeriodo(n.criadoEm, f.periodo));
  const mapa = new Map<string, LinhaProduto>();
  for (const n of base) {
    for (const p of n.produtos) {
      const atual = mapa.get(p.nome) ?? { nome: p.nome, quantidade: 0, valor: 0, valorMensal: 0, emGanhas: 0 };
      atual.quantidade += p.quantidade;
      // Único e mensal em colunas distintas: juntá-los faria "R$ 5.000" querer
      // dizer duas coisas diferentes na mesma linha.
      if (p.recorrencia === "mensal") atual.valorMensal += totalDoItem(p);
      else atual.valor += totalDoItem(p);
      if (n.situacao === "ganha") atual.emGanhas += p.quantidade;
      mapa.set(p.nome, atual);
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor + b.valorMensal - (a.valor + a.valorMensal));
}

// ------------------------------------------------------------- Atividades

export interface Atividades {
  total: number;
  concluidas: number;
  pendentes: number;
  atrasadas: number;
  porTipo: { tipo: TipoTarefa; total: number; concluidas: number }[];
}

/** Tarefas com data no período; atrasada = pendente com data antes de `hoje`. */
export function atividades(tarefas: TarefaCrm[], f: FiltroRelatorio, hoje: string): Atividades {
  const base = tarefas.filter(
    (t) => (!f.responsavel || t.responsavel === f.responsavel) && noPeriodo(t.data, f.periodo),
  );
  const mapa = new Map<TipoTarefa, { tipo: TipoTarefa; total: number; concluidas: number }>();
  let concluidas = 0;
  let atrasadas = 0;
  for (const t of base) {
    const linha = mapa.get(t.tipo) ?? { tipo: t.tipo, total: 0, concluidas: 0 };
    linha.total += 1;
    if (t.concluida) {
      linha.concluidas += 1;
      concluidas += 1;
    } else if (t.data < hoje) {
      atrasadas += 1;
    }
    mapa.set(t.tipo, linha);
  }
  return {
    total: base.length,
    concluidas,
    pendentes: base.length - concluidas,
    atrasadas,
    porTipo: Array.from(mapa.values()).sort((a, b) => b.total - a.total),
  };
}

// ----------------------------------------------------------------- Interno

function agrupar(negs: Negociacao[], chaveDe: (n: Negociacao) => string): LinhaPorChave[] {
  const mapa = new Map<string, LinhaPorChave>();
  for (const n of negs) {
    const chave = chaveDe(n);
    const atual = mapa.get(chave) ?? { chave, criadas: 0, ganhas: 0, valor: 0 };
    atual.criadas += 1;
    atual.valor += valorDaNegociacao(n);
    if (n.situacao === "ganha") atual.ganhas += 1;
    mapa.set(chave, atual);
  }
  return Array.from(mapa.values()).sort((a, b) => b.criadas - a.criadas || a.chave.localeCompare(b.chave, "pt-BR"));
}
