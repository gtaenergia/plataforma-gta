import { describe, expect, it } from "vitest";
import { horasParaMin, minParaHoras } from "@/components/capacidade/comum";

/**
 * Campos de hora: o contrato é pt-BR, com vírgula.
 *
 * Estes campos já foram `type="number"`, e a combinação com um valor derivado
 * do número mentia de um jeito caro: o navegador descarta a vírgula (medido em
 * navegador pt-BR), o React reescreve o campo, e o dígito seguinte entra na
 * frente do que estava — quem digitava "1,5" terminava com 51 horas.
 *
 * Os testes abaixo não conseguem exercer o navegador; o que eles seguram é a
 * outra metade, a que está ao alcance: a ida e a volta preservam a vírgula, e
 * o que sai daqui pode ser digitado de volta sem virar outro número.
 */
describe("horas em texto", () => {
  it("aceita vírgula na entrada", () => {
    expect(horasParaMin("1,5")).toBe(90);
    expect(horasParaMin("0,75")).toBe(45);
    expect(horasParaMin("8")).toBe(480);
  });

  it("aceita ponto também — quem digita no teclado numérico não é punido", () => {
    expect(horasParaMin("1.5")).toBe(90);
  });

  it("devolve vírgula, nunca ponto", () => {
    expect(minParaHoras(90)).toBe("1,5");
    expect(minParaHoras(45)).toBe("0,75");
    expect(minParaHoras(480)).toBe("8");
  });

  it("zero é 'não informado', e vira campo vazio", () => {
    expect(minParaHoras(0)).toBe("");
    expect(horasParaMin("")).toBe(0);
  });

  it("ida e volta não muda o número", () => {
    for (const min of [30, 45, 90, 150, 240, 480, 1440, 2400]) {
      expect(horasParaMin(minParaHoras(min))).toBe(min);
    }
  });

  it("texto sem sentido vira zero, não NaN", () => {
    expect(horasParaMin("abc")).toBe(0);
    expect(horasParaMin("-3")).toBe(0);
  });
});
