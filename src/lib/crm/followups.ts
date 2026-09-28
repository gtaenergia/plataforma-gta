import type { Negociacao, TarefaCrm } from "./types";

/**
 * A agenda vista pelo CLIENTE (puro, sem I/O): de quem é cada compromisso,
 * quantos contatos já foram feitos e qual é o próximo.
 */

export interface RefCliente {
  id: string;
  nome: string;
}

const normal = (s: string) => s.trim().toLowerCase();

/**
 * O cliente de uma tarefa.
 *
 * O próprio, quando ela tem; senão, o da negociação. Tarefas anteriores ao
 * follow-up por cliente só conhecem a negociação — e é pelo cliente dela que
 * entram na contagem de contatos feitos.
 */
export function clienteDaTarefa(t: TarefaCrm, negociacoes: ReadonlyMap<string, Negociacao>): RefCliente {
  if (t.clienteId || t.clienteNome) return { id: t.clienteId, nome: t.clienteNome };
  const n = t.negociacaoId ? negociacoes.get(t.negociacaoId) : undefined;
  return { id: n?.empresaId ?? "", nome: n?.empresaNome ?? "" };
}

/**
 * A referência aponta para este cliente?
 *
 * Por id quando há id; por nome quando não há — a mesma regra da ficha do
 * cliente para as negociações: a criação rápida no funil pede só o nome, e
 * negociação antiga nasceu antes de o cliente existir no cadastro.
 */
export function ehDoCliente(ref: RefCliente, cliente: RefCliente): boolean {
  if (ref.id) return ref.id === cliente.id;
  return !!ref.nome.trim() && normal(ref.nome) === normal(cliente.nome);
}

export function tarefasDoCliente(
  cliente: RefCliente,
  tarefas: readonly TarefaCrm[],
  negociacoes: readonly Negociacao[],
): TarefaCrm[] {
  const porId = new Map(negociacoes.map((n) => [n.id, n]));
  return tarefas.filter((t) => ehDoCliente(clienteDaTarefa(t, porId), cliente));
}

/** As negociações deste cliente (mesma regra de casamento das tarefas). */
export function negociacoesDoCliente(cliente: RefCliente, negociacoes: readonly Negociacao[]): Negociacao[] {
  return negociacoes.filter((n) => ehDoCliente({ id: n.empresaId, nome: n.empresaNome }, cliente));
}

const emAndamento = (n: Negociacao) => n.situacao === "aberta" || n.situacao === "pausada";

/**
 * A negociação que diz "em que etapa o cliente está" para um compromisso.
 *
 * A dele, quando ele tem uma. Follow-up só de cliente não tem: aí vale a
 * negociação em andamento mexida por último com esse cliente — é a conversa
 * viva no momento. Sem nenhuma em andamento, não há etapa a mostrar, e
 * inventar uma ("Ganha", da venda do ano passado) diria que o cliente está
 * num ponto em que ele não está.
 */
export function negociacaoDeReferencia(
  t: TarefaCrm,
  cliente: RefCliente,
  negociacoes: readonly Negociacao[],
): Negociacao | null {
  if (t.negociacaoId) {
    const propria = negociacoes.find((n) => n.id === t.negociacaoId);
    if (propria) return propria;
  }
  const vivas = negociacoesDoCliente(cliente, negociacoes).filter(emAndamento);
  return vivas.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))[0] ?? null;
}

/** Quem fez o contato. Conclusão antiga não guardava o autor: vale o responsável. */
export function quemFez(t: TarefaCrm): string {
  return t.concluidaPorNome || t.concluidaPor || t.responsavelNome || t.responsavel;
}

export interface ResumoFollowUps {
  /** Contatos concluídos — o contador de follow-ups do cliente. */
  feitos: number;
  /** O contato concluído mais recente. */
  ultimo: TarefaCrm | null;
  /** O próximo compromisso pendente (o mais antigo, se houver atrasado). */
  proximo: TarefaCrm | null;
  pendentes: TarefaCrm[];
  /** Do mais recente para o mais antigo. */
  concluidas: TarefaCrm[];
}

/** Recebe as tarefas de UM cliente (ver `tarefasDoCliente`). */
export function resumoFollowUps(tarefas: readonly TarefaCrm[]): ResumoFollowUps {
  const pendentes = tarefas
    .filter((t) => !t.concluida)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  // A ordem é pelo momento em que o contato foi registrado, não pela data
  // agendada: o de ontem que estava marcado para a semana passada é o último.
  const concluidas = tarefas
    .filter((t) => t.concluida)
    .sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data));
  return {
    feitos: concluidas.length,
    ultimo: concluidas[0] ?? null,
    proximo: pendentes[0] ?? null,
    pendentes,
    concluidas,
  };
}
