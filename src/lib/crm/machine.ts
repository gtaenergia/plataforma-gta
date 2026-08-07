import type { SituacaoNegociacao } from "./types";

/**
 * Máquina de situação da negociação (pura, sem I/O) — mesmo desenho da máquina
 * de aprovação de orçamentos (src/lib/orcamentos/machine.ts).
 *
 * aberta  --pausar-->  pausada
 * aberta  --ganhar-->  ganha
 * aberta  --perder-->  perdida   (exige motivo de perda — regra do RD)
 * pausada --retomar--> aberta
 * pausada --ganhar-->  ganha
 * pausada --perder-->  perdida
 * ganha   --reabrir--> aberta
 * perdida --reabrir--> aberta
 *
 * `reabrir` existe porque ganhar/perder são cliques irreversíveis num fluxo
 * humano: quem fechou errado precisa de caminho de volta. A volta é para
 * "aberta" — a negociação retorna ao funil, e o fechamento anterior fica
 * contado no histórico (anotação de sistema), não se apaga.
 */

export type AcaoNegociacao = "pausar" | "retomar" | "ganhar" | "perder" | "reabrir";

const TRANSICOES: Record<SituacaoNegociacao, Partial<Record<AcaoNegociacao, SituacaoNegociacao>>> = {
  aberta: { pausar: "pausada", ganhar: "ganha", perder: "perdida" },
  pausada: { retomar: "aberta", ganhar: "ganha", perder: "perdida" },
  ganha: { reabrir: "aberta" },
  perdida: { reabrir: "aberta" },
};

export type TransicaoNegociacao =
  | { ok: true; destino: SituacaoNegociacao }
  | { ok: false; erro: string };

/** Verifica se a ação é válida a partir da situação atual. */
export function podeTransicionar(situacao: SituacaoNegociacao, acao: AcaoNegociacao): TransicaoNegociacao {
  const destino = TRANSICOES[situacao]?.[acao];
  if (!destino) return { ok: false, erro: `Ação "${acao}" indisponível numa negociação "${situacao}".` };
  return { ok: true, destino };
}

/** Ações oferecidas na interface para cada situação (na ordem de exibição). */
export function acoesDisponiveis(situacao: SituacaoNegociacao): AcaoNegociacao[] {
  return Object.keys(TRANSICOES[situacao] ?? {}) as AcaoNegociacao[];
}
