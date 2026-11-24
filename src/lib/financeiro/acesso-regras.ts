import type { User } from "@/lib/users/types";

/**
 * Regras puras de acesso ao Financeiro (sem banco, sem Next) — testáveis e
 * usadas tanto nas rotas do Financeiro quanto em Gerenciar usuários.
 */

/** Tem acesso: conta ativa E a marca `financeiro` no cadastro. */
export const temAcessoFinanceiro = (u: Pick<User, "financeiro" | "active"> | null | undefined) => !!u?.active && u.financeiro === true;

type Quem = Pick<User, "id" | "email" | "role" | "active" | "financeiro">;

/**
 * Pode `me` mexer na porta do Financeiro de `alvo`? Vale para: dar ou tirar o
 * acesso, criar alguém já com acesso, redefinir a senha, desativar ou excluir
 * quem tem acesso.
 *
 * O buraco que isto fecha: um administrador SEM acesso ao Financeiro não
 * consegue se dar acesso, nem redefinir a senha de um sócio para entrar como
 * ele, nem desativar os sócios para depois "começar do zero". Administrar
 * usuários e ver o caixa são poderes diferentes.
 *
 * - Antes de qualquer pessoa ter a marca (instalação nova), qualquer
 *   administrador pode dar o primeiro acesso.
 * - Depois disso, só quem TEM acesso mexe na porta — e a contagem inclui
 *   contas desativadas, para que desativar os sócios não reabra a instalação.
 * - Nunca fica sem ninguém: não dá para tirar o acesso, desativar ou excluir a
 *   última pessoa ativa com acesso.
 */
export function decidirMudancaDeAcesso(
  me: Quem,
  todos: Quem[],
  alvo: Quem | null,
  mudanca: "conceder" | "revogar" | "senha" | "desativar" | "excluir",
): { ok: true } | { ok: false; erro: string } {
  if (me.role !== "admin") return { ok: false, erro: "Acesso restrito a administradores." };
  const jaConfigurado = todos.some((u) => u.financeiro === true);
  if (jaConfigurado && !temAcessoFinanceiro(me)) {
    return {
      ok: false,
      erro: "Só quem já tem acesso ao Financeiro pode dar ou tirar esse acesso, ou mexer na senha e na conta de quem o tem.",
    };
  }
  const tira = mudanca === "revogar" || mudanca === "desativar" || mudanca === "excluir";
  if (tira && alvo && temAcessoFinanceiro(alvo)) {
    const ativosComAcesso = todos.filter((u) => temAcessoFinanceiro(u));
    if (ativosComAcesso.length <= 1) return { ok: false, erro: "Deve haver ao menos uma pessoa ativa com acesso ao Financeiro." };
  }
  return { ok: true };
}

/**
 * A requisição veio da própria plataforma? Barreira contra CSRF nas rotas que
 * mudam dinheiro, por cima do SameSite do cookie.
 *
 * Navegadores atuais mandam `Sec-Fetch-Site`; os antigos, `Origin`. Sem
 * nenhum dos dois não é navegador — e cliente que não é navegador não carrega
 * o cookie de ninguém sozinho.
 */
export function origemConfiavel(req: Pick<Request, "headers" | "url">): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origem = req.headers.get("origin");
  if (!origem) return true;
  try {
    return new URL(origem).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Cabeçalho que a tela manda nas consultas automáticas (não contam como uso). */
export const CABECALHO_AUTOMATICO = "x-fin-auto";
