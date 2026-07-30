import type { AcaoTransicao, Estacao } from "./types";
import type { PermissaoKey } from "@/lib/rbac/permissoes";

/**
 * Máquina de estados do fluxo de aprovação (pura, sem I/O). Define as transições válidas.
 * A autorização por PERMISSÃO é aplicada nas rotas (Node) via `permissaoDaAcao`.
 *
 * rascunho   --enviar--->   em_revisao
 * rascunho   --cancelar-->  cancelado
 * em_revisao --aprovar--->  aprovado    (gate humano final, exige parecer)
 * em_revisao --rejeitar-->  rascunho    (devolve ao criador, exige parecer)
 * em_revisao --cancelar-->  cancelado
 * aprovado   --reabrir-->   em_revisao  (desfaz a decisão, exige justificativa)
 * cancelado  --reabrir-->   em_revisao
 *
 * `reabrir` existe porque aprovar/cancelar são cliques irreversíveis num
 * fluxo humano: quem decidiu errado precisa de caminho de volta. Não pula
 * etapa — devolve para em_revisao, de onde as decisões normais valem de novo.
 */

const TRANSICOES: Record<Estacao, Partial<Record<AcaoTransicao, Estacao>>> = {
  rascunho: { enviar: "em_revisao", cancelar: "cancelado" },
  em_revisao: { aprovar: "aprovado", rejeitar: "rascunho", cancelar: "cancelado" },
  aprovado: { reabrir: "em_revisao" },
  cancelado: { reabrir: "em_revisao" },
};

/** Permissão exigida para cada ação do fluxo de aprovação. */
export function permissaoDaAcao(acao: AcaoTransicao): PermissaoKey {
  switch (acao) {
    case "enviar":
      return "orcamentos.criar";
    case "aprovar":
    case "rejeitar":
    // Desfazer uma decisão exige o mesmo poder de decidir.
    case "reabrir":
      return "orcamentos.aprovar";
    case "cancelar":
      return "orcamentos.cancelar";
  }
}

export type Transicao =
  | { ok: true; destino: Estacao }
  | { ok: false; erro: string };

/** Verifica se a ação é válida a partir da estação atual. */
export function podeTransicionar(estacao: Estacao, acao: AcaoTransicao): Transicao {
  const destino = TRANSICOES[estacao]?.[acao];
  if (!destino) return { ok: false, erro: `Ação "${acao}" indisponível em "${estacao}".` };
  return { ok: true, destino };
}
