import { criarServicoConfigurador } from "../_cpq/configurador";

/**
 * Fornecimento de Mão de Obra — a proposta que nasce da mesma conta da
 * calculadora de mão de obra (funções × horas × R$/h ÷ divisor), acrescida dos
 * custos de materiais, ferramentas e equipamentos.
 *
 * O MaoDeObraConfigurator monta os itens já precificados; aqui é só o contrato
 * do serviço, no molde padrão (solar-style) — igual aos demais configuradores.
 */
export const maoDeObraService = criarServicoConfigurador({
  key: "mao-de-obra",
  label: "Fornecimento de Mão de Obra",
  description: "Equipe terceirizada por função e hora, com materiais e ferramentas — do custo ao preço, como na calculadora.",
  referencePrefix: "MDO",
});
