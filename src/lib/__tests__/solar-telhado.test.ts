import { describe, expect, it } from "vitest";
import { simularTelhado, dimensaoDoPainel, textoParaProposta, type TelhadoInput } from "@/services/solar/telhado";

/** Módulo de 550 W: 2,279 × 1,134 m. */
const PAINEL = { comprimentoMm: 2279, larguraMm: 1134 };

const base: TelhadoInput = {
  larguraM: 10,
  comprimentoM: 8,
  painel: PAINEL,
  espacoEntrePaineisMm: 20,
  espacoEntreFileirasMm: 20,
  recuoBordaMm: 300,
};

describe("simularTelhado — contagem", () => {
  it("desconta o recuo dos dois lados de cada eixo", () => {
    const r = simularTelhado(base);
    expect(r.utilLarguraM).toBeCloseTo(9.4, 5); // 10 − 2×0,30
    expect(r.utilComprimentoM).toBeCloseTo(7.4, 5);
    expect(r.areaTelhadoM2).toBe(80);
    expect(r.areaUtilM2).toBeCloseTo(69.56, 2);
  });

  it("a última peça não é descartada por uma folga inexistente", () => {
    // 3 módulos de 1,134 + 2 folgas de 0,02 = 3,442 -> cabe exato em 3,442.
    const r = simularTelhado({ ...base, larguraM: 3.442, comprimentoM: 30, recuoBordaMm: 0 });
    const retrato = r.arranjos.find((a) => a.orientacao === "retrato")!;
    expect(retrato.colunas).toBe(3);
  });

  it("avalia as duas orientações e ordena pela maior contagem", () => {
    const r = simularTelhado(base);
    expect(r.arranjos).toHaveLength(2);
    expect(r.arranjos[0].total).toBeGreaterThanOrEqual(r.arranjos[1].total);
    expect(r.melhor).toBe(r.arranjos[0]);
  });

  it("orientação muda o resultado — é por isso que testamos as duas", () => {
    const r = simularTelhado(base);
    const retrato = r.arranjos.find((a) => a.orientacao === "retrato")!;
    const paisagem = r.arranjos.find((a) => a.orientacao === "paisagem")!;
    // 9,4 / 1,134 -> 8 colunas ; 7,4 / 2,279 -> 3 fileiras
    expect(retrato).toMatchObject({ colunas: 8, fileiras: 3, total: 24 });
    // 9,4 / 2,279 -> 4 colunas ; 7,4 / 1,134 -> 6 fileiras
    expect(paisagem).toMatchObject({ colunas: 4, fileiras: 6, total: 24 });
  });

  it("o espaço ocupado nunca passa da área útil", () => {
    const r = simularTelhado(base);
    for (const a of r.arranjos) {
      expect(a.ocupaLarguraM).toBeLessThanOrEqual(r.utilLarguraM + 1e-9);
      expect(a.ocupaComprimentoM).toBeLessThanOrEqual(r.utilComprimentoM + 1e-9);
    }
  });
});

describe("simularTelhado — casos-limite", () => {
  it("telhado menor que um módulo não cabe nenhum", () => {
    const r = simularTelhado({ ...base, larguraM: 1, comprimentoM: 1 });
    expect(r.melhor).toBeNull();
    expect(r.arranjos.every((a) => a.total === 0)).toBe(true);
  });

  it("recuo que engole o telhado zera a área útil sem negativar", () => {
    const r = simularTelhado({ ...base, larguraM: 2, comprimentoM: 2, recuoBordaMm: 1500 });
    expect(r.utilLarguraM).toBe(0);
    expect(r.areaUtilM2).toBe(0);
    expect(r.melhor).toBeNull();
  });

  it("medidas zeradas (formulário em branco) não quebram", () => {
    const r = simularTelhado({ ...base, larguraM: 0, comprimentoM: 0 });
    expect(r.areaUtilM2).toBe(0);
    expect(r.melhor).toBeNull();
    expect(Number.isFinite(r.areaTelhadoM2)).toBe(true);
  });

  it("medida negativa é tratada como zero", () => {
    const r = simularTelhado({ ...base, larguraM: -5 });
    expect(r.utilLarguraM).toBe(0);
    expect(r.melhor).toBeNull();
  });

  it("sem folga nenhuma cabe mais módulos", () => {
    const comFolga = simularTelhado(base).melhor!.total;
    const semFolga = simularTelhado({ ...base, espacoEntrePaineisMm: 0, espacoEntreFileirasMm: 0 }).melhor!.total;
    expect(semFolga).toBeGreaterThanOrEqual(comFolga);
  });

  it("recuo maior reduz a contagem", () => {
    const r300 = simularTelhado(base).melhor!.total;
    const r1000 = simularTelhado({ ...base, recuoBordaMm: 1000 }).melhor!.total;
    expect(r1000).toBeLessThan(r300);
  });
});

describe("dimensaoDoPainel", () => {
  it("acha a medida da potência exata", () => {
    expect(dimensaoDoPainel(550)).toEqual({ comprimentoMm: 2279, larguraMm: 1134 });
  });

  it("potência fora do catálogo cai na mais próxima", () => {
    expect(dimensaoDoPainel(575)).toEqual(dimensaoDoPainel(570));
  });
});

describe("textoParaProposta", () => {
  const r = simularTelhado(base);
  const texto = textoParaProposta(base, r, r.melhor!, 550);

  it("traz as medidas, a área útil e a disposição", () => {
    expect(texto).toContain("10,00 m × 8,00 m");
    expect(texto).toContain("300 mm nas bordas");
    expect(texto).toContain("69,56 m² de área útil");
    expect(texto).toContain(`${r.melhor!.total} módulos`);
    expect(texto).toContain("2279 mm × 1134 mm");
  });

  it("traz as duas folgas — o que faltava no desenho", () => {
    expect(texto).toContain("20 mm entre módulos");
    expect(texto).toContain("20 mm entre fileiras");
  });

  it("declara a potência do arranjo", () => {
    // 24 módulos × 550 W = 13,2 kWp
    expect(texto).toContain("13,20 kWp");
  });

  it("declara o que o método NÃO cobre — senão vira promessa", () => {
    expect(texto).toContain("não considera obstruções");
    expect(texto).toContain("sombreamento");
    expect(texto).toContain("visita técnica");
  });

  it("concorda o singular quando há uma só fileira", () => {
    const rr = simularTelhado({ ...base, comprimentoM: 3 });
    const t = textoParaProposta({ ...base, comprimentoM: 3 }, rr, rr.melhor!, 550);
    expect(rr.melhor!.fileiras).toBe(1);
    expect(t).toContain("× 1 fileira,");
  });
});
