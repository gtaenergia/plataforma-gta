import { describe, expect, it } from "vitest";
import { dimensionarEV, gerarBomEV, POTENCIA_MAX_CA_KW } from "@/services/carregador/engine";
import { avaliarEV } from "@/services/carregador/avisos";

const dim = (potenciaKw: number, fase: "mono" | "tri", distanciaM = 20) =>
  dimensionarEV({ potenciaKw, fase, distanciaM });

describe("dimensionarEV — NBR 5410: Ib ≤ In(disjuntor) ≤ Iz(condutor)", () => {
  /** Ampacidade (A) das seções usadas pelo motor. */
  const IZ: Record<number, number> = { 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125, 50: 151, 70: 192 };

  const casos: [number, "mono" | "tri"][] = [
    [3.7, "mono"], [7.4, "mono"], [11, "tri"], [22, "tri"], [7.3, "mono"], [3.5, "mono"], [15, "tri"],
  ];

  it.each(casos)("%s kW %s: disjuntor cobre a corrente de projeto", (p, f) => {
    const s = dim(p, f);
    // Era violado em 100% dos casos: o disjuntor saía sobre In, não sobre Ib.
    expect(s.disjuntorA).toBeGreaterThanOrEqual(s.correnteProjeto);
  });

  it.each(casos)("%s kW %s: condutor suporta o disjuntor", (p, f) => {
    const s = dim(p, f);
    expect(IZ[s.secaoMm2]).toBeGreaterThanOrEqual(s.disjuntorA);
  });

  it("a corrente de projeto continua sendo 1,25 × a nominal (carga contínua)", () => {
    const s = dim(7.4, "mono");
    expect(s.correnteProjeto).toBeCloseTo(s.correnteNominal * 1.25, 6);
  });

  it("7,4 kW mono passa a exigir 50 A, não 40 A", () => {
    const s = dim(7.4, "mono");
    expect(s.correnteNominal).toBeCloseTo(33.64, 1);
    expect(s.correnteProjeto).toBeCloseTo(42.05, 1);
    expect(s.disjuntorA).toBe(50);
    expect(s.secaoMm2).toBe(10);
  });

  it("3,7 kW mono sobe de 2,5 para 4 mm² — o disjuntor de 25 A não cabe em 24 A", () => {
    const s = dim(3.7, "mono");
    expect(s.disjuntorA).toBe(25);
    expect(s.secaoMm2).toBe(4);
  });
});

describe("dimensionarEV — queda de tensão", () => {
  it("trifásico usa √3, não o fator 2 do monofásico", () => {
    const s = dim(22, "tri", 60);
    const esperado = (Math.sqrt(3) * s.correnteNominal * 60) / (56 * s.secaoMm2 * 380);
    expect(s.quedaPct).toBeCloseTo(esperado, 8);
  });

  it("monofásico continua com ida e volta (fator 2)", () => {
    const s = dim(7.4, "mono", 30);
    const esperado = (2 * s.correnteNominal * 30) / (56 * s.secaoMm2 * 220);
    expect(s.quedaPct).toBeCloseTo(esperado, 8);
  });

  it("sinaliza quando estoura 4% mesmo na maior bitola", () => {
    const s = dim(22, "tri", 3000);
    expect(s.quedaAcimaDoLimite).toBe(true);
  });
});

describe("gerarBomEV — a infraestrutura acompanha os pontos", () => {
  const s = dim(7.4, "mono");
  const qtdDe = (n: number, re: RegExp) => gerarBomEV(s, 20, n).itens.find((i) => re.test(i.descricao))!.qtd;

  it("cabo, eletroduto e abraçadeira dobram ao dobrar os pontos", () => {
    // Ficavam congelados enquanto quadro/disjuntor/DR multiplicavam.
    expect(qtdDe(2, /Cabo flex/)).toBe(qtdDe(1, /Cabo flex/) * 2);
    expect(qtdDe(2, /Eletroduto/)).toBe(qtdDe(1, /Eletroduto/) * 2);
    expect(qtdDe(2, /Abraçadeira/)).toBe(qtdDe(1, /Abraçadeira/) * 2);
  });

  it("a proteção continua um conjunto por ponto", () => {
    expect(qtdDe(4, /Quadro/)).toBe(4);
    expect(qtdDe(4, /Disjuntor/)).toBe(4);
  });

  it("4 pontos custam bem mais que 4× nada — e mais que antes", () => {
    const um = gerarBomEV(s, 20, 1).custoMateriais;
    const quatro = gerarBomEV(s, 20, 4).custoMateriais;
    // Antes: R$ 7.950 (infraestrutura de 1 ponto). Agora escala de verdade.
    expect(quatro).toBeGreaterThan(um * 3);
  });
});

describe("avaliarEV — travas técnicas", () => {
  const titulos = (a: { titulo: string }[]) => a.map((x) => x.titulo);

  it("7,4 kW mono, 1 ponto: sem aviso", () => {
    expect(avaliarEV({ potenciaKw: 7.4, qtdPontos: 1, sizing: dim(7.4, "mono") })).toEqual([]);
  });

  it("150 kW: avisa que a especificação está subdimensionada", () => {
    const s = dim(150, "tri");
    const a = avaliarEV({ potenciaKw: 150, qtdPontos: 1, sizing: s });
    expect(s.acimaDoCatalogo).toBe(true);
    expect(titulos(a)).toContain("Potência acima do que este dimensionamento cobre");
    expect(a.find((x) => x.titulo.includes("subdimensionada") || x.detalhe.includes("SUBDIMENSIONADOS"))).toBeTruthy();
  });

  it("acima da faixa CA vira carregador CC", () => {
    const a = avaliarEV({ potenciaKw: 60, qtdPontos: 1, sizing: dim(60, "tri") });
    expect(titulos(a)).toContain("Acima da faixa de recarga em corrente alternada");
  });

  it(`${POTENCIA_MAX_CA_KW} kW ainda é CA`, () => {
    const a = avaliarEV({ potenciaKw: POTENCIA_MAX_CA_KW, qtdPontos: 1, sizing: dim(POTENCIA_MAX_CA_KW, "tri") });
    expect(titulos(a).some((t) => t.includes("corrente alternada"))).toBe(false);
  });

  it("mais de um ponto exige alimentador e fator de demanda", () => {
    const a = avaliarEV({ potenciaKw: 7.4, qtdPontos: 4, sizing: dim(7.4, "mono") });
    const aviso = a.find((x) => x.titulo.includes("mais de um ponto"));
    expect(aviso?.detalhe).toContain("29,6 kW");
    expect(aviso?.detalhe).toContain("NBR 17019");
  });

  it("ponto único de alta potência lembra do padrão de entrada", () => {
    const a = avaliarEV({ potenciaKw: 22, qtdPontos: 1, sizing: dim(22, "tri") });
    expect(titulos(a)).toContain("Verifique o padrão de entrada");
  });
});
