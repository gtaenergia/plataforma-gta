import { describe, expect, it } from "vitest";
import { comporProposta } from "@/lib/custo-equipe/composicao";

/**
 * O ponto destes testes é a assimetria entre os dois paradigmas: a MESMA
 * equipe, nas MESMAS horas, muda o preço num e não muda no outro. Se algum dia
 * os dois passarem a se comportar igual, é porque a dupla contagem voltou.
 */

const CUSTOS = { "gabriel@gtaenergia.com": 30.3, "matheus@gtaenergia.com": 13.44 };
const reais = (cent: number) => (cent / 100).toFixed(2);

describe("composição da proposta", () => {
  describe("Fator K — as horas entram na base e o preço sobe", () => {
    it("10 h do Gabriel acrescentam K × 303,00 ao preço", () => {
      const c = comporProposta({
        linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }],
        custos: CUSTOS,
        preco: { paradigma: "fator_k", custoConfiguradorCent: 1_000_00, fatorK: 1.65 },
        imposto: 0.0701,
      });

      expect(reais(c.custoEquipeCent)).toBe("303.00");
      expect(reais(c.precoOriginalCent)).toBe("1650.00"); // 1.000 × 1,65
      expect(reais(c.precoCent)).toBe("2149.95"); // (1.000 + 303) × 1,65
      expect(reais(c.acrescimoCent)).toBe("499.95"); // 303 × 1,65
    });

    it("sem ninguém apontado, o preço é exatamente o do configurador", () => {
      const c = comporProposta({
        linhas: [],
        custos: CUSTOS,
        preco: { paradigma: "fator_k", custoConfiguradorCent: 1_000_00, fatorK: 1.65 },
        imposto: 0.0701,
      });
      expect(c.custoEquipeCent).toBe(0);
      expect(c.acrescimoCent).toBe(0);
      expect(reais(c.precoCent)).toBe("1650.00");
    });
  });

  describe("Métrica — a tabela já remunera o projeto", () => {
    it("as mesmas 10 h não mexem no preço", () => {
      const c = comporProposta({
        linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }],
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 8_000_00 },
        imposto: 0.15,
      });

      expect(reais(c.custoEquipeCent)).toBe("303.00"); // o custo é contado
      expect(reais(c.precoCent)).toBe("8000.00"); // mas o preço não muda
      expect(c.acrescimoCent).toBe(0);
      expect(c.custoConfiguradorCent).toBe(0);
    });

    it("o custo aparece na margem, que é onde ele serve", () => {
      const semEquipe = comporProposta({
        linhas: [],
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 8_000_00 },
        imposto: 0.15,
      });
      const comEquipe = comporProposta({
        linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }],
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 8_000_00 },
        imposto: 0.15,
      });
      expect(comEquipe.margem).toBeLessThan(semEquipe.margem);
    });
  });

  describe("o que a tela precisa avisar", () => {
    it("pessoa sem R$/h marca a composição como incompleta", () => {
      const c = comporProposta({
        linhas: [{ email: "novato@gtaenergia.com", horas: 20 }],
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 5_000_00 },
        imposto: 0.15,
      });
      expect(c.incompleta).toBe(true);
      expect(c.custoEquipeCent).toBe(0); // e o custo mente por baixo
    });

    it("preço que não cobre o custo é sinalizado, não bloqueado", () => {
      const c = comporProposta({
        linhas: [{ email: "gabriel@gtaenergia.com", horas: 200 }], // 6.060,00
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 5_000_00 },
        imposto: 0.15,
      });
      expect(c.prejuizo).toBe(true);
      expect(c.margem).toBeLessThan(0);
      expect(reais(c.precoCent)).toBe("5000.00"); // gerar continua possível
    });
  });

  describe("a identidade que não pode quebrar", () => {
    it("custo + imposto + lucro = preço, nos dois paradigmas", () => {
      const casos = [
        { paradigma: "fator_k" as const, custoConfiguradorCent: 12_345_67, fatorK: 1.65 },
        { paradigma: "fator_k" as const, custoConfiguradorCent: 1_00, fatorK: 2.4 },
        { paradigma: "metrica" as const, precoCent: 33_333_33 },
        { paradigma: "metrica" as const, precoCent: 1 },
      ];
      for (const preco of casos) {
        const c = comporProposta({
          linhas: [
            { email: "gabriel@gtaenergia.com", horas: 7.5 },
            { email: "matheus@gtaenergia.com", horas: 33 },
          ],
          custos: CUSTOS,
          preco,
          imposto: 0.0701,
        });
        expect(c.custoTotalCent + c.impostoCent + c.lucroCent, JSON.stringify(preco)).toBe(c.precoCent);
      }
    });

    it("várias pessoas somam, cada uma pelo seu R$/h", () => {
      const c = comporProposta({
        linhas: [
          { email: "gabriel@gtaenergia.com", horas: 10 }, // 303,00
          { email: "matheus@gtaenergia.com", horas: 10 }, // 134,40
        ],
        custos: CUSTOS,
        preco: { paradigma: "metrica", precoCent: 10_000_00 },
        imposto: 0.15,
      });
      expect(reais(c.custoEquipeCent)).toBe("437.40");
    });
  });
});
