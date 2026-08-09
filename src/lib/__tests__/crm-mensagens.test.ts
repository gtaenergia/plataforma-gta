import { describe, expect, it } from "vitest";
import { mensagemDeErro } from "@/components/crm/buscar";

/**
 * A mensagem que a pessoa lê quando o servidor recusa.
 *
 * O caso que motivou: criar negociação com nome longo devolvia "Nome: String
 * must contain at most 200 character(s)" no funil — texto do zod, em inglês,
 * na tela de quem só quer saber o que corrigir.
 */
describe("mensagemDeErro", () => {
  it("nomeia o campo pelo rótulo da tela, não pela chave do código", () => {
    expect(mensagemDeErro({ issues: { fieldErrors: { motivoPerdaId: ["Escolha um motivo"] } } })).toBe(
      "Motivo da perda: Escolha um motivo",
    );
  });

  it("traduz o limite de tamanho do zod", () => {
    expect(mensagemDeErro({ issues: { fieldErrors: { nome: ["String must contain at most 200 character(s)"] } } })).toBe(
      "Nome: no máximo 200 caracteres.",
    );
    expect(mensagemDeErro({ issues: { fieldErrors: { texto: ["String must contain at least 2 character(s)"] } } })).toBe(
      "Texto: no mínimo 2 caracteres.",
    );
  });

  it("traduz limite numérico, campo faltando e opção inválida", () => {
    expect(mensagemDeErro({ issues: { fieldErrors: { valor: ["Number must be greater than or equal to 0"] } } })).toBe(
      "Valor: no mínimo 0.",
    );
    expect(mensagemDeErro({ issues: { fieldErrors: { etapaId: ["Required"] } } })).toBe("Etapa: obrigatório.");
    expect(mensagemDeErro({ issues: { fieldErrors: { data: ["Invalid enum value. Expected 'a' | 'b'"] } } })).toBe(
      "Data: opção inválida.",
    );
  });

  it("preserva a mensagem que o esquema escreveu em português", () => {
    expect(mensagemDeErro({ issues: { fieldErrors: { nome: ["Informe o nome da negociação"] } } })).toBe(
      "Nome: Informe o nome da negociação",
    );
  });

  it("usa o `error` da rota quando não há detalhe por campo", () => {
    expect(mensagemDeErro({ error: "Preencha o campo “Distribuidora” para avançar até Proposta enviada." })).toBe(
      "Preencha o campo “Distribuidora” para avançar até Proposta enviada.",
    );
  });

  it("não deixa a tela sem frase quando o servidor não manda nenhuma", () => {
    expect(mensagemDeErro({})).toBe("Não foi possível concluir. Tente de novo.");
  });
});
