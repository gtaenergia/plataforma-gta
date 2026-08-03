/**
 * Filtros da lista de tarefas, guardados na URL.
 *
 * Antes eles viviam só no estado do componente: abrir uma tarefa e voltar
 * limpava tudo. Quem acompanha as atividades de uma pessoa e edita uma a uma
 * tinha que reaplicar o filtro a cada volta.
 *
 * Na URL o problema some sozinho — o botão Voltar do navegador restaura o
 * endereço, e o mesmo endereço pode ser guardado ou enviado a alguém.
 */

/** Valor que significa "não filtrar" em cada campo. */
export const FILTROS_PADRAO = {
  status: "ativas",
  resp: "todos",
  cliente: "todos",
  categoria: "todos",
  demandante: "todos",
  busca: "",
};

export type Filtros = Record<keyof typeof FILTROS_PADRAO, string>;

/** Lê os filtros de uma query, caindo no padrão quando o parâmetro não veio. */
export function lerFiltros(sp: URLSearchParams): Filtros {
  const f = { ...FILTROS_PADRAO } as Filtros;
  for (const chave of Object.keys(FILTROS_PADRAO) as (keyof Filtros)[]) {
    const v = sp.get(chave);
    if (v !== null) f[chave] = v;
  }
  return f;
}

/**
 * Só o que difere do padrão entra na query: com a lista sem filtro o endereço
 * continua sendo `/tarefas`, e não uma fileira de `todos`.
 */
export function paraQuery(f: Filtros): string {
  const p = new URLSearchParams();
  for (const [chave, padrao] of Object.entries(FILTROS_PADRAO)) {
    const v = f[chave as keyof Filtros];
    if (v && v !== padrao) p.set(chave, v);
  }
  return p.toString();
}

/** `/tarefas` preservando os filtros — para quem volta do detalhe ou do formulário. */
export function urlDaLista(query: string): string {
  return query ? `/tarefas?${query}` : "/tarefas";
}
