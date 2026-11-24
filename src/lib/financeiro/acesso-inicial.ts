/**
 * Quem recebe o acesso ao Financeiro quando a coluna nasce: os três sócios
 * que já usavam o controle financeiro do chat — Tito, Paulo Vitor e Gabriel.
 *
 * Casa pelo INÍCIO do nome, sem acento e sem caixa: "Tito", "Tito Alves",
 * "Gabriel S.", "Paulo Vitor", "Paulo Víctor". "Paulo" sozinho NÃO casa: há
 * mais Paulos no mundo do que sócios, e dar acesso ao caixa por engano é pior
 * do que pedir ao administrador para marcar uma caixa.
 *
 * Roda uma vez só (ver `migrarFinanceiro` em users/store.ts). Depois, o acesso
 * é decidido em Gerenciar usuários.
 */
export function ehSocioComAcessoInicial(nome: string): boolean {
  const n = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return /^(tito|gabriel|paulo vi(c)?tor|pv)(\s|$)/.test(n);
}
