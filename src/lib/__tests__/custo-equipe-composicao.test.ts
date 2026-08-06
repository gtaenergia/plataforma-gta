import { describe, expect, it } from "vitest";
import { comporProposta, equipeFormaPreco, servicosQueFormamPreco } from "@/lib/custo-equipe/composicao";
import { SERVICES } from "@/services/registry";

/**
 * O ponto destes testes é a assimetria entre os dois paradigmas: a MESMA
 * equipe, nas MESMAS horas, muda o preço num e não muda no outro. Se algum dia
 * os dois passarem a se comportar igual, é porque a dupla contagem voltou.
 */

const CUSTOS = { "gabriel@gtaenergia.com": 30.3, "matheus@gtaenergia.com": 13.44 };
const reais = (cent: number) => (cent / 100).toFixed(2);

describe("composição da proposta", () => {
  it("o acréscimo é a diferença entre os dois preços que o engine deu", () => {
    // Fator K: o engine já somou as horas na base e arredondou do seu jeito.
    const c = comporProposta({
      linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }],
      custos: CUSTOS,
      custoConfiguradorCent: 1_000_00,
      precoSemEquipeCent: 1_650_00,
      precoCent: 2_150_00, // (1.000 + 303) × 1,65, arredondado a R$ 10
      imposto: 0.0701,
    });

    expect(reais(c.custoEquipeCent)).toBe("303.00");
    expect(reais(c.acrescimoCent)).toBe("500.00");
    expect(reais(c.custoTotalCent)).toBe("1303.00");
  });

  it("por métrica: o custo é contado, o preço não muda", () => {
    const c = comporProposta({
      linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }],
      custos: CUSTOS,
      custoConfiguradorCent: 0,
      precoSemEquipeCent: 8_000_00,
      precoCent: 8_000_00,
      imposto: 0.15,
    });

    expect(reais(c.custoEquipeCent)).toBe("303.00");
    expect(c.acrescimoCent).toBe(0);
  });

  it("o custo aparece na margem, que é onde ele serve", () => {
    const base = { custos: CUSTOS, custoConfiguradorCent: 0, precoSemEquipeCent: 8_000_00, precoCent: 8_000_00, imposto: 0.15 };
    const sem = comporProposta({ ...base, linhas: [] });
    const com = comporProposta({ ...base, linhas: [{ email: "gabriel@gtaenergia.com", horas: 10 }] });
    expect(com.margem).toBeLessThan(sem.margem);
  });

  describe("o que a tela precisa avisar", () => {
    it("pessoa sem R$/h marca a composição como incompleta", () => {
      const c = comporProposta({
        linhas: [{ email: "novato@gtaenergia.com", horas: 20 }],
        custos: CUSTOS,
        custoConfiguradorCent: 0,
        precoSemEquipeCent: 5_000_00,
        precoCent: 5_000_00,
        imposto: 0.15,
      });
      expect(c.incompleta).toBe(true);
      expect(c.custoEquipeCent).toBe(0); // e o custo mente por baixo
    });

    it("preço que não cobre o custo é sinalizado, não bloqueado", () => {
      const c = comporProposta({
        linhas: [{ email: "gabriel@gtaenergia.com", horas: 200 }], // 6.060,00
        custos: CUSTOS,
        custoConfiguradorCent: 0,
        precoSemEquipeCent: 5_000_00,
        precoCent: 5_000_00,
        imposto: 0.15,
      });
      expect(c.prejuizo).toBe(true);
      expect(c.margem).toBeLessThan(0);
      expect(reais(c.precoCent)).toBe("5000.00"); // gerar continua possível
    });
  });

  it("custo + imposto + lucro = preço, sempre", () => {
    const casos = [
      { custoConfiguradorCent: 12_345_67, precoSemEquipeCent: 20_370_00, precoCent: 21_200_00, imposto: 0.0701 },
      { custoConfiguradorCent: 1_00, precoSemEquipeCent: 2_40, precoCent: 1_200_00, imposto: 0.0701 },
      { custoConfiguradorCent: 0, precoSemEquipeCent: 33_333_33, precoCent: 33_333_33, imposto: 0.15 },
      { custoConfiguradorCent: 0, precoSemEquipeCent: 1, precoCent: 1, imposto: 0 },
    ];
    for (const caso of casos) {
      const c = comporProposta({
        ...caso,
        linhas: [
          { email: "gabriel@gtaenergia.com", horas: 7.5 },
          { email: "matheus@gtaenergia.com", horas: 33 },
        ],
        custos: CUSTOS,
      });
      expect(c.custoTotalCent + c.impostoCent + c.lucroCent, JSON.stringify(caso)).toBe(c.precoCent);
    }
  });

  it("várias pessoas somam, cada uma pelo seu R$/h", () => {
    const c = comporProposta({
      linhas: [
        { email: "gabriel@gtaenergia.com", horas: 10 }, // 303,00
        { email: "matheus@gtaenergia.com", horas: 10 }, // 134,40
      ],
      custos: CUSTOS,
      custoConfiguradorCent: 0,
      precoSemEquipeCent: 10_000_00,
      precoCent: 10_000_00,
      imposto: 0.15,
    });
    expect(reais(c.custoEquipeCent)).toBe("437.40");
  });
});

describe("quais serviços deixam a equipe formar o preço", () => {
  it("só os quatro de Fator K", () => {
    expect([...servicosQueFormamPreco()].sort()).toEqual(
      ["carregador", "execucao-subestacao", "qgbt", "rede-mt"].sort(),
    );
  });

  it("a lista só cita serviços que existem", () => {
    const doRegistro = new Set(SERVICES.map((s) => s.key));
    for (const k of servicosQueFormamPreco()) {
      expect(doRegistro.has(k), `${k} não está no registro de serviços`).toBe(true);
    }
  });

  it("os por métrica ficam de fora — é o que evita cobrar duas vezes", () => {
    for (const k of ["spda", "solar", "projeto-subestacao", "projeto-bt", "limpeza", "laudo-inspecao", "analisador", "conexao"]) {
      expect(equipeFormaPreco(k), k).toBe(false);
    }
  });
});
