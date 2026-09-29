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

/** O contador de follow-ups em forma curta — o que cabe num cartão do funil. */
export interface ContadorFollowUp {
  /** Contatos concluídos com o cliente. */
  feitos: number;
  /** Quando foi o último (ISO), "" sem nenhum. */
  ultimoEm: string;
  ultimoPor: string;
  /** Data do próximo compromisso pendente (YYYY-MM-DD), "" sem nenhum. */
  proximo: string;
}

function contar(tarefas: readonly TarefaCrm[]): ContadorFollowUp {
  const c: ContadorFollowUp = { feitos: 0, ultimoEm: "", ultimoPor: "", proximo: "" };
  for (const t of tarefas) {
    if (t.concluida) {
      c.feitos++;
      const em = t.concluidaEm || t.data;
      if (em > c.ultimoEm) {
        c.ultimoEm = em;
        c.ultimoPor = quemFez(t);
      }
    } else if (t.data && (!c.proximo || t.data < c.proximo)) {
      c.proximo = t.data;
    }
  }
  return c;
}

/**
 * O contador de TODOS os clientes e de todas as negociações de uma vez.
 *
 * O funil e a lista de clientes precisam do número em cada linha; pedir as
 * tarefas inteiras (com os comentários de anos de contato) para o navegador
 * contar seria mandar o arquivo todo para mostrar um número. O servidor conta
 * e devolve só isto.
 *
 * Mesma regra de casamento da ficha (`ehDoCliente`): pelo id quando há, pelo
 * nome quando não há. A negociação sem cliente nenhum conta só as tarefas
 * dela.
 */
export function contadoresDeFollowUp(e: {
  tarefas: readonly TarefaCrm[];
  negociacoes: readonly Negociacao[];
  clientes: readonly RefCliente[];
}): { porCliente: Record<string, ContadorFollowUp>; porNegociacao: Record<string, ContadorFollowUp> } {
  const porNeg = new Map(e.negociacoes.map((n) => [n.id, n]));
  const comId = new Map<string, TarefaCrm[]>();
  const soNome = new Map<string, TarefaCrm[]>();
  const semCliente = new Map<string, TarefaCrm[]>();
  const junta = (mapa: Map<string, TarefaCrm[]>, chave: string, t: TarefaCrm) => {
    const lista = mapa.get(chave);
    if (lista) lista.push(t);
    else mapa.set(chave, [t]);
  };
  for (const t of e.tarefas) {
    const ref = clienteDaTarefa(t, porNeg);
    if (ref.id) junta(comId, ref.id, t);
    else if (ref.nome.trim()) junta(soNome, normal(ref.nome), t);
    else if (t.negociacaoId) junta(semCliente, t.negociacaoId, t);
  }
  const doCliente = (alvo: RefCliente) =>
    contar([...(alvo.id ? comId.get(alvo.id) ?? [] : []), ...(alvo.nome.trim() ? soNome.get(normal(alvo.nome)) ?? [] : [])]);

  const porCliente: Record<string, ContadorFollowUp> = {};
  for (const c of e.clientes) porCliente[c.id] = doCliente(c);

  /*
   * Negociação criada pelo "+" do funil tem só o nome do cliente. Se o nome
   * é o de UM cadastro, ela é daquele cliente — e mostra o contador dele,
   * não só o das tarefas que por acaso também não têm id. Nome repetido em
   * dois cadastros não escolhe nenhum.
   */
  const idPorNome = new Map<string, string | null>();
  for (const c of e.clientes) {
    const k = normal(c.nome);
    idPorNome.set(k, idPorNome.has(k) ? null : c.id);
  }

  const porNegociacao: Record<string, ContadorFollowUp> = {};
  for (const n of e.negociacoes) {
    const doCadastro = !n.empresaId && n.empresaNome.trim() ? idPorNome.get(normal(n.empresaNome)) : null;
    porNegociacao[n.id] = doCadastro
      ? porCliente[doCadastro]
      : n.empresaId || n.empresaNome.trim()
        ? doCliente({ id: n.empresaId, nome: n.empresaNome })
        : contar(semCliente.get(n.id) ?? []);
  }
  return { porCliente, porNegociacao };
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
