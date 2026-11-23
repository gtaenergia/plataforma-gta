import type { CamposDoServidor, StatusTarefa, Task } from "./types";

/**
 * Regras da verificação de tarefas — funções puras, usadas pela API e testáveis
 * sem banco.
 *
 * Decisões do dono (23/11/2026):
 * - verifica quem é administrador ou tem a permissão `tarefas.verificar`, e só;
 * - quem verifica pode DEVOLVER a tarefa entregue ao responsável; o motivo é
 *   opcional, mas a devolução sempre fica nos comentários e avisa o responsável;
 * - o prazo para de correr na entrega (ver `trabalhoEntregue` em types.ts).
 */

/** Status de quem ainda tem trabalho a fazer. */
export const STATUS_ABERTOS: readonly StatusTarefa[] = ["afazer", "andamento", "atraso", "continuo"];

export function statusAberto(s: string): boolean {
  return (STATUS_ABERTOS as readonly string[]).includes(s);
}

type Carimbos = Partial<Pick<Task, CamposDoServidor>>;

/**
 * O que gravar nos quatro carimbos quando o status muda de `de` para `para`.
 *
 * - Entregar grava quem e quando, e apaga uma verificação antiga: se a tarefa
 *   voltou e foi entregue de novo, a verificação anterior não vale para ela.
 * - Verificar grava quem e quando, e mantém a entrega (é o registro de que houve).
 * - Voltar a um status aberto apaga os quatro: o que estava registrado deixou
 *   de ser verdade.
 * - Status igual não carimba nada: salvar a tarefa não é entregá-la de novo.
 */
export function carimbosDaTransicao(de: string, para: string, quem: string, agora: string): Carimbos {
  if (de === para) return {};
  if (para === "entregue") {
    return { entregueEm: agora, entreguePor: quem, verificadaEm: "", verificadaPor: "" };
  }
  if (para === "concluida") return { verificadaEm: agora, verificadaPor: quem };
  if (statusAberto(para)) return { entregueEm: "", entreguePor: "", verificadaEm: "", verificadaPor: "" };
  return {};
}

/** Tirar uma tarefa entregue de volta para um status aberto. */
export function ehDevolucao(de: string, para: string): boolean {
  return de === "entregue" && statusAberto(para);
}

const mesmoEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Por que esta mudança de status é recusada, ou `null` se pode seguir.
 *
 * O servidor é a regra; a tela só antecipa a mesma resposta para não oferecer
 * um botão que vai dar erro.
 */
export function bloqueioDaTransicao(
  tarefa: Pick<Task, "status" | "responsavel">,
  para: string,
  quem: { email: string; podeVerificar: boolean },
): string | null {
  if (tarefa.status === para) return null;
  if (para === "concluida" && !quem.podeVerificar) {
    return "Marcar como Concluída (verificada) cabe a administradores e a quem tem a permissão de verificar tarefas.";
  }
  // Devolver passa pela rota própria, que registra a devolução e avisa o responsável.
  // O próprio responsável pode reabrir a tarefa que ele entregou: é ele quem
  // sabe que faltou algo, e não há a quem avisar.
  if (ehDevolucao(tarefa.status, para) && !mesmoEmail(tarefa.responsavel, quem.email)) {
    return quem.podeVerificar
      ? "Para devolver a tarefa, use “Devolver ao responsável” na página dela: assim o responsável é avisado."
      : "Só o responsável reabre uma tarefa entregue; quem verifica pode devolvê-la pela página da tarefa.";
  }
  return null;
}
