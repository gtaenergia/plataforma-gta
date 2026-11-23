import { users } from "@/lib/users/store";
import { cargos } from "@/lib/cargos/store";
import type { User } from "@/lib/users/types";
import type { Cargo } from "@/lib/cargos/types";

/**
 * Quem pode verificar tarefas — e, portanto, quem é avisado quando uma tarefa
 * chega a "Concluída" (server-only: toca usuários e cargos).
 *
 * A mesma regra de `temPermissao(user, "tarefas.verificar")`, aplicada à equipe
 * inteira de uma vez: um admin passa sempre; os demais, pelo cargo. Ler os
 * cargos uma vez só, em vez de perguntar usuário por usuário, é o que deixa
 * isto barato o bastante para rodar a cada entrega.
 */
export function podemVerificar(lista: User[], listaCargos: Cargo[]): User[] {
  const comChave = new Set(listaCargos.filter((c) => c.permissoes.includes("tarefas.verificar")).map((c) => c.id));
  return lista.filter((u) => u.active && (u.role === "admin" || (!!u.cargoId && comChave.has(u.cargoId))));
}

/** E-mails de quem deve ser avisado de uma entrega, sem quem acabou de entregar. */
export async function emailsDosVerificadores(exceto: string): Promise<string[]> {
  const [u, c] = await Promise.all([users(), cargos()]);
  const [lista, listaCargos] = await Promise.all([u.list(), c.list()]);
  const fora = exceto.trim().toLowerCase();
  return podemVerificar(lista, listaCargos)
    .map((x) => x.email)
    .filter((e) => e.trim().toLowerCase() !== fora);
}
