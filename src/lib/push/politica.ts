import type { NovaNotificacao } from "../notificacoes/types";
import type { PayloadPush } from "./types";

/**
 * Quais notificações merecem interromper a pessoa — e quais ficam só no sino.
 *
 * ## Por que uma lista de PERMITIDOS, e não de bloqueados
 *
 * As duas listas erram, e a pergunta é qual erro dói mais.
 *
 * Lista de bloqueados: um tipo novo passa a notificar sozinho. Se ele for
 * tagarela, o celular de todo mundo vibra sem parar, e a primeira reação de
 * qualquer pessoa a isso é desligar as notificações — inclusive as que
 * importavam. O estrago é irreversível: ninguém religa depois.
 *
 * Lista de permitidos: um tipo novo nasce mudo. Alguém estranha, avisa, e
 * acrescenta uma linha aqui.
 *
 * O segundo erro se conserta; o primeiro mata o recurso. Por isso a lista é de
 * permitidos, e `novidade` — que é difusão para a equipe inteira — está fora
 * dela de propósito.
 */
export const TIPOS_COM_PUSH: readonly string[] = [
  "tarefa_atribuida",
  "orcamento_aprovado",
  "orcamento_rejeitado",
  "orcamento_reaberto",
  "capacidade_estourada",
  /*
   * Do CRM, só o que exige AÇÃO de quem recebe:
   *
   * - o pedido de proposta é trabalho novo caindo na fila de alguém;
   * - a proposta aprovada libera o comercial a enviá-la ao cliente;
   * - a cobrança da manhã é um recado por pessoa, por dia útil — e é
   *   justamente para quem está em campo e não abre a plataforma.
   *
   * `crm_proposta_gerada` fica de fora: ela é intermediária (a revisão ainda
   * vem), e vibrar duas vezes pela mesma proposta gasta a atenção à toa.
   */
  "crm_pedido_proposta",
  "crm_proposta_aprovada",
  "crm_cobranca_diaria",
];

export function merecePush(tipo: string): boolean {
  return TIPOS_COM_PUSH.includes((tipo ?? "").trim());
}

/**
 * Agrupa avisos do mesmo assunto para que se substituam em vez de empilhar.
 *
 * A chave é o LINK, não o tipo: um orçamento que é rejeitado e depois reaberto
 * gera dois tipos diferentes sobre a mesma coisa, e o que interessa na tela de
 * notificações do celular é o estado atual dele.
 */
export function tagDe(n: Pick<NovaNotificacao, "tipo" | "link">): string {
  return n.link?.trim() || n.tipo?.trim() || "gta";
}

/** Monta o que o service worker recebe. Retorna null quando o tipo não vibra. */
export function payloadDe(n: NovaNotificacao): PayloadPush | null {
  if (!merecePush(n.tipo)) return null;
  return {
    titulo: n.titulo?.trim() || "Plataforma GTA",
    mensagem: n.mensagem?.trim() ?? "",
    link: n.link?.trim() ?? "",
    tag: tagDe(n),
  };
}
