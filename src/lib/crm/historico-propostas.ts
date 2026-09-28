import { parseNumber } from "@/lib/format";
import { SERVICO_OUTRO, SERVICO_OUTRO_LABEL, type Proposta } from "@/lib/propostas/types";
import { getService } from "@/services/registry";
import type { PropostaResumo } from "./historico";

/**
 * A proposta do operacional reduzida ao que o histórico do cliente mostra.
 *
 * Fica fora de `historico.ts` porque precisa do registro de serviços — o que
 * puxa todos os configuradores. O histórico em si continua puro e testável
 * sem eles.
 */

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** O que dá para saber sem rodar o serviço: barato, serve para TODAS as propostas. */
export function resumoBasico(p: Proposta): PropostaResumo {
  const src = (p.formGerado ?? p.dados ?? {}) as Record<string, unknown>;
  const servico = getService(p.serviceKey);
  // `SERVICO_OUTRO` não está no registro: sem isto a linha diria "outro".
  const rotuloServico =
    servico?.label ??
    (p.serviceKey === SERVICO_OUTRO ? texto(p.dados?.servicoOutro) || SERVICO_OUTRO_LABEL : p.serviceKey);
  const emissao = texto(src.dataEmissao) || texto(p.dados?.dataEmissao);
  return {
    id: p.id,
    serviceKey: p.serviceKey,
    rotuloServico,
    cliente: p.cliente,
    referencia: p.referencia,
    status: p.status,
    criadoEm: p.criadoEm,
    dataEmissao: /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : "",
    valorDocumento: 0,
    negociacaoId: texto(p.dados?.negociacaoId),
  };
}

/**
 * O valor impresso no documento da proposta.
 *
 * É o mesmo caminho da esteira de aprovação (/api/orcamentos/da-proposta):
 * revalidar o formulário gravado e ler o `valorTotal` que o mapper põe no
 * .docx. Rascunho que não valida, ou serviço que mudou desde então, devolve
 * 0 — "sem valor" é melhor do que um número adivinhado. A proposta cadastrada
 * à mão não tem mapper: o valor dela foi digitado em `dados.valor`.
 */
export function valorDoDocumento(p: Proposta): number {
  if (p.manual) {
    const v = p.dados?.valor;
    return typeof v === "number" && v > 0 ? v : 0;
  }
  try {
    const servico = getService(p.serviceKey);
    if (!servico) return 0;
    const parsed = servico.zodSchema.safeParse(p.formGerado ?? p.dados);
    if (!parsed.success) return 0;
    const v = parseNumber((servico.map(parsed.data).data as Record<string, unknown>).valorTotal);
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
