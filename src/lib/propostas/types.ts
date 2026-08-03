import { z } from "zod";

/** Modelo e validação de Propostas salvas (histórico / rascunhos). */

export const STATUS_PROPOSTA = [
  { value: "rascunho", label: "Rascunho" },
  { value: "precificada", label: "Precificada" },
  { value: "gerada", label: "Gerada" },
] as const;

export type StatusProposta = (typeof STATUS_PROPOSTA)[number]["value"];

/**
 * Chave de serviço para a proposta manual que não se encaixa em nenhum dos 12
 * configuradores. Fica no mesmo campo `serviceKey` das geradas para que filtro,
 * contagem e referência automática continuem funcionando sem exceção no código.
 */
export const SERVICO_OUTRO = "outro";
export const SERVICO_OUTRO_LABEL = "Outro";

export interface Proposta {
  id: string;
  serviceKey: string; // "solar"
  cliente: string;
  referencia: string;
  status: StatusProposta;
  /** Configuração completa (entradas + resultados) para reabrir e continuar. */
  dados: Record<string, unknown>;
  /**
   * FormData TRANSFORMADO (schema-shaped) usado na geração do .docx — o que o
   * zodSchema/mapper do serviço esperam. Difere de `dados` (form cru) nos
   * configuradores; usado para regenerar o .docx (Rev 00 da esteira).
   */
  formGerado?: Record<string, unknown>;
  /**
   * Proposta cadastrada à mão, feita fora da plataforma. Não tem configurador
   * por trás, então não pode ser reaberta nem duplicada — o que existe dela é o
   * registro e, enquanto a esteira não expirar o anexo, o PDF.
   */
  manual: boolean;
  criadoPor: string;
  /** Nome do criador resolvido a partir do e-mail (apenas para exibição). */
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const createPropostaSchema = z.object({
  serviceKey: z.string().trim().min(1),
  cliente: z.string().trim().min(1, "Informe o cliente").max(200),
  referencia: z.string().trim().max(120).default(""),
  status: z.enum(["rascunho", "precificada", "gerada"]).default("rascunho"),
  dados: z.record(z.unknown()).default({}),
  manual: z.boolean().default(false),
});

export const updatePropostaSchema = createPropostaSchema.partial();

/**
 * Campos do cadastro manual. Vão para `dados` em vez de virarem colunas: são
 * exibição, não regra — nenhum cálculo da plataforma depende deles, e uma
 * coluna a mais é uma migração a mais em produção.
 */
export const dadosManualSchema = z.object({
  valor: z.number().nonnegative().optional(),
  dataEmissao: z.string().trim().max(10).optional(),
  observacoes: z.string().trim().max(2000).optional(),
});
export type DadosManual = z.infer<typeof dadosManualSchema>;

export function statusPropostaLabel(s: StatusProposta): string {
  return STATUS_PROPOSTA.find((x) => x.value === s)?.label ?? s;
}
