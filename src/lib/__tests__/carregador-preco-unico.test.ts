import { describe, expect, it } from "vitest";
import { precoEV } from "@/services/carregador/engine";
import { CARREGADOR_PARAMS_DEFAULT as P } from "@/services/carregador/params";

/**
 * `precoEV` é a ÚNICA dona da conta do carregador.
 *
 * O configurador mantinha uma cópia escrita à mão, com o comentário "mesma
 * fórmula do engine" — e ela deixou de ser a mesma no instante em que só uma
 * das duas ganhou o custo de equipe: a tela cobrava as horas e a rota devolvia
 * preço sem elas. Estes testes seguram o contrato que a tela consome.
 */
describe("carregador: uma fórmula só", () => {
  it("sem horas, o preço é idêntico ao de antes da mudança", () => {
    const r = precoEV(3_000, 1, P);
    expect(r.custoEquipe).toBe(0);
    expect(r.preco).toBe(r.precoSemEquipe);
    expect(r.custoGeral).toBe(r.custoSemEquipe);
  });

  it("as horas entram na base e o preço sobe pelo Fator K", () => {
    const r = precoEV(3_000, 1, { ...P, fatorK: 1.65 }, 121.2);
    expect(r.custoSemEquipe).toBe(3_800); // 3.000 materiais + 800 instalação
    expect(r.custoGeral).toBeCloseTo(3_921.2, 2);
    expect(r.precoSemEquipe).toBe(6_270);
    expect(r.preco).toBe(6_470);
    // O acréscimo passa pelo markup: é maior que o custo cru das horas.
    expect(r.preco - r.precoSemEquipe).toBe(200);
    expect(r.preco - r.precoSemEquipe).toBeGreaterThan(121.2);
  });

  it("a identidade do engine vale com e sem horas", () => {
    for (const horas of [0, 121.2, 5_000]) {
      const r = precoEV(3_000, 2, P, horas);
      expect(r.custoGeral + r.impostos + r.lucro).toBeCloseTo(r.preco, 6);
      expect(r.custoSemEquipe + r.custoEquipe).toBeCloseTo(r.custoGeral, 6);
    }
  });

  it("horas negativas não viram desconto", () => {
    expect(precoEV(3_000, 1, P, -500).custoEquipe).toBe(0);
  });
});
