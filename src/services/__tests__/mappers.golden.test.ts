import { describe, expect, it } from "vitest";
import { SERVICES } from "../registry";
import { TEMPLATE_SERVICOS } from "../_cpq/proposta";

/**
 * GOLDEN TESTS dos mappers CPQ — para cada serviço que usa o molde padrão
 * (template-servicos.docx), valida o form contra o zodSchema e congela os
 * marcadores que vão para o .docx. Garante que refatorações (ex.: consolidar os
 * index.ts na fábrica criarServicoConfigurador) não mudam o documento gerado.
 * Solar e Carregador têm mapper/molde próprios e são cobertos pelos engines.
 */

const FIXTURE = {
  clienteNome: "Cliente Golden Ltda",
  cidadeUf: "Goiânia/GO",
  referenciaSeq: 7,
  dataEmissao: "2026-07-01",
  validadeDias: 20,
  formaPagamento: "50% na assinatura e 50% na entrega",
  localAtividade: "",
  titulo: "PROPOSTA TÉCNICA E COMERCIAL — TESTE",
  objeto: "Objeto de teste do serviço, fixo para o snapshot.",
  prazoExecucao: "30 dias corridos",
  itens: [
    { descricao: "Item principal do escopo", valor: "1.234,56", condicao: "na entrega" },
    { descricao: "Item incluso (sem preço destacado)", valor: "0" },
  ],
  observacoes: ["Observação de teste.", ""],
};

const cpq = SERVICES.filter((s) => s.templateFile === TEMPLATE_SERVICOS);

describe("mappers CPQ (molde compartilhado)", () => {
  // Sem número no título: ele já mentiu uma vez, ao entrar o 11º serviço.
  it("cobre todos os serviços que usam o molde padrão", () => {
    expect(cpq.map((s) => s.key).sort()).toMatchSnapshot();
  });

  it.each(cpq.map((s) => [s.key, s] as const))("%s: form validado → marcadores do .docx", (_key, service) => {
    const parsed = service.zodSchema.parse(FIXTURE);
    const { data } = service.map(parsed);
    expect(data).toMatchSnapshot();
  });
});
