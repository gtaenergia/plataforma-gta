import { randomBytes } from "node:crypto";
import { users } from "./store";
import { hashPassword, verifyPassword } from "./password";
import type { User } from "./types";

/**
 * Valida e-mail + senha contra o banco de usuários (senha com hash).
 * Módulo Node (usado pela rota de login), fora do `auth.ts` edge-safe.
 */

/**
 * Hash de uma senha que ninguém conhece, para gastar o MESMO tempo quando o
 * e-mail não existe.
 *
 * Antes, `if (!u || !u.active) return null` saía sem hashear. Medido: 0,0 ms
 * para e-mail inexistente contra 59,7 ms para existente — diferença trivial de
 * cronometrar pela rede. Dava para mapear quem tem conta antes de tentar
 * qualquer senha, e ainda separar conta DESATIVADA de inexistente.
 *
 * Gerado uma vez, sob demanda. O valor não importa: só o custo de verificá-lo.
 */
let hashIsca: string | null = null;
function iscaDeTempo(): string {
  if (!hashIsca) hashIsca = hashPassword(randomBytes(32).toString("hex"));
  return hashIsca;
}

export async function validateCredentials(
  email: string,
  password: string,
): Promise<User | null> {
  const store = await users();
  const u = await store.getByEmail(email);

  // O scrypt roda SEMPRE — com o hash real ou com a isca. Só depois os motivos
  // de recusa são avaliados, e todos custam o mesmo tempo.
  const senhaConfere = verifyPassword(password, u?.passwordHash ?? iscaDeTempo());

  if (!u || !u.active || !senhaConfere) return null;
  return u;
}
