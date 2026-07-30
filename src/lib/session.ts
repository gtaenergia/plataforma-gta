import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, passwordFingerprint, type SessionPayload } from "./auth";
import { users } from "./users/store";
import type { User } from "./users/types";
import { temPermissao } from "./rbac/resolve";
import type { PermissaoKey } from "./rbac/permissoes";

/** Payload da sessão a partir do cookie (edge/node). */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Usuário atual carregado do banco (fonte da verdade: papel, ativo,
 * troca-de-senha-obrigatória). Retorna null se a sessão for inválida ou o
 * usuário não existir/estiver inativo.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSessionUser();
  if (!session) return null;
  const store = await users();
  const u = await store.getByEmail(session.email);
  if (!u || !u.active) return null;
  // A senha mudou desde que a sessão foi emitida? Então ela não vale mais.
  // O middleware (Edge, sem banco) não consegue checar isso — é aqui que a
  // revogação de fato acontece, em toda página e rota protegida.
  if (session.pv !== (await passwordFingerprint(u.passwordHash))) return null;
  return u;
}

interface RequireOptions {
  requireAdmin?: boolean;
  /** Permite acesso mesmo com troca de senha pendente (ex.: a própria tela de troca). */
  allowMustChange?: boolean;
}

/**
 * Usado no topo de páginas protegidas. Redireciona:
 * - sem sessão/usuário -> /login
 * - troca de senha pendente -> /trocar-senha
 * - sem permissão de admin -> /
 */
export async function requirePageUser(opts: RequireOptions = {}): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!opts.allowMustChange && user.mustChangePassword) redirect("/trocar-senha");
  if (opts.requireAdmin && user.role !== "admin") redirect("/");
  return user;
}

/**
 * Igual a requirePageUser, mas exige uma permissão específica (via cargo).
 * Sem a permissão, redireciona para a home. Admins passam sempre (super-usuário).
 */
export async function requirePagePermissao(chave: PermissaoKey): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/trocar-senha");
  if (!(await temPermissao(user, chave))) redirect("/");
  return user;
}
