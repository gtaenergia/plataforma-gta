import { describe, expect, it } from "vitest";
import { acoesDisponiveis, podeTransicionar } from "@/lib/crm/machine";
import { valorDaNegociacao } from "@/lib/crm/types";

describe("máquina de situação da negociação", () => {
  it("permite os caminhos do funil", () => {
    expect(podeTransicionar("aberta", "pausar")).toEqual({ ok: true, destino: "pausada" });
    expect(podeTransicionar("aberta", "ganhar")).toEqual({ ok: true, destino: "ganha" });
    expect(podeTransicionar("aberta", "perder")).toEqual({ ok: true, destino: "perdida" });
    expect(podeTransicionar("pausada", "retomar")).toEqual({ ok: true, destino: "aberta" });
    expect(podeTransicionar("pausada", "ganhar")).toEqual({ ok: true, destino: "ganha" });
  });

  it("reabrir devolve ao funil, de qualquer fechamento", () => {
    expect(podeTransicionar("ganha", "reabrir")).toEqual({ ok: true, destino: "aberta" });
    expect(podeTransicionar("perdida", "reabrir")).toEqual({ ok: true, destino: "aberta" });
  });

  it("bloqueia o que não faz sentido", () => {
    expect(podeTransicionar("ganha", "ganhar").ok).toBe(false);
    expect(podeTransicionar("perdida", "perder").ok).toBe(false);
    expect(podeTransicionar("aberta", "retomar").ok).toBe(false);
    expect(podeTransicionar("ganha", "pausar").ok).toBe(false);
  });

  it("as ações da interface batem com as transições", () => {
    expect(acoesDisponiveis("aberta")).toEqual(["pausar", "ganhar", "perder"]);
    expect(acoesDisponiveis("ganha")).toEqual(["reabrir"]);
  });
});

describe("valorDaNegociacao", () => {
  const base = { produtoId: "p1", nome: "Projeto", recorrencia: "unico" as const };

  it("sem produtos, vale o valor livre", () => {
    expect(valorDaNegociacao({ valor: 1500, produtos: [] })).toBe(1500);
  });

  it("com produtos, a soma vence o valor livre", () => {
    expect(
      valorDaNegociacao({
        valor: 999,
        produtos: [
          { ...base, preco: 1000, quantidade: 2, desconto: 0, tipoDesconto: "valor" },
          { ...base, preco: 500, quantidade: 1, desconto: 100, tipoDesconto: "valor" },
        ],
      }),
    ).toBe(2400);
  });

  it("desconto percentual incide sobre o bruto do item", () => {
    expect(
      valorDaNegociacao({
        valor: 0,
        produtos: [{ ...base, preco: 200, quantidade: 5, desconto: 10, tipoDesconto: "percentual" }],
      }),
    ).toBe(900);
  });

  it("desconto maior que o item não deixa o total negativo", () => {
    expect(
      valorDaNegociacao({
        valor: 0,
        produtos: [{ ...base, preco: 100, quantidade: 1, desconto: 500, tipoDesconto: "valor" }],
      }),
    ).toBe(0);
  });
});
