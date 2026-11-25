import { describe, expect, it } from "vitest";
import { balancearFases, calcularOrigem, calcularQuadros, quedaPercentual } from "@/lib/engenharia/quadro/motor";
import { energiaPassante, fatorAgrupamento, fatorTemperatura, izTabelado, neutroReduzido, reatancia, resistenciaA, secaoPE } from "@/lib/engenharia/quadro/tabelas";
import { novoCircuito, quadroVazio, type DadosQuadro } from "@/lib/engenharia/quadro/tipos";

describe("tabelas da NBR 5410", () => {
  it("capacidade de condução (Tabelas 36 a 39)", () => {
    expect(izTabelado({ material: "Cu", isolacao: "PVC", metodo: "B1", config: "unipolar-trifolio", carregados: 2, secao: 2.5 })).toBe(24);
    expect(izTabelado({ material: "Cu", isolacao: "PVC", metodo: "B1", config: "unipolar-trifolio", carregados: 3, secao: 2.5 })).toBe(21);
    expect(izTabelado({ material: "Cu", isolacao: "XLPE", metodo: "D", config: "unipolar-trifolio", carregados: 3, secao: 95 })).toBe(211);
    expect(izTabelado({ material: "Cu", isolacao: "XLPE", metodo: "F", config: "unipolar-trifolio", carregados: 3, secao: 95 })).toBe(328);
    expect(izTabelado({ material: "Cu", isolacao: "PVC", metodo: "E", config: "multipolar", carregados: 3, secao: 16 })).toBe(80);
    expect(izTabelado({ material: "Al", isolacao: "EPR", metodo: "C", config: "multipolar", carregados: 3, secao: 50 })).toBe(136);
  });
  it("fatores de correção (Tabelas 40, 42 e 45)", () => {
    expect(fatorTemperatura(40, "PVC", false)).toBe(0.87);
    expect(fatorTemperatura(37, "XLPE", false)).toBe(0.91); // entre degraus: usa o de cima
    expect(fatorTemperatura(25, "PVC", true)).toBe(0.95);
    expect(fatorAgrupamento(3, 1)).toBe(0.7);
    expect(fatorAgrupamento(10, 1)).toBe(0.5);
    expect(fatorAgrupamento(12, 4)).toBe(0.72);
    expect(fatorAgrupamento(2, 0)).toBe(0.85);
    expect(fatorAgrupamento(3, 6)).toBe(0.65); // Tabela 44, diretamente enterrados
    expect(fatorAgrupamento(5, 7)).toBe(1); // espaçados (nota 2 da Tabela 42)
  });
  it("neutro reduzido e condutor de proteção (Tabelas 48 e 58)", () => {
    expect(neutroReduzido(25)).toBe(25);
    expect(neutroReduzido(95)).toBe(50);
    expect(secaoPE(10, "Cu")).toBe(10);
    expect(secaoPE(25, "Cu")).toBe(16);
    expect(secaoPE(120, "Cu")).toBe(70); // 60 mm²: empate entre 50 e 70, fica a maior
    // 6.4.3.1.3: seção padronizada mais próxima de S/2.
    expect(secaoPE(150, "Cu")).toBe(70);
    expect(secaoPE(185, "Cu")).toBe(95);
    expect(secaoPE(400, "Cu")).toBe(185);
    // Acima de 400 mm² a Tabela 48 não dá valor: o neutro não é reduzido.
    expect(neutroReduzido(400)).toBe(185);
    expect(neutroReduzido(500)).toBe(500);
  });
});

describe("curto-circuito na origem", () => {
  it("transformador 500 kVA, Z = 5%, 380 V", () => {
    const d = quadroVazio();
    d.config.tensao = "220/380";
    d.config.ikModo = "calculado";
    d.config.trafo = { kva: 500, z: 5, pk: null };
    const o = calcularOrigem(d.config);
    expect(o.trafo!.In).toBeCloseTo(759.7, 1);
    expect(o.trafo!.ZT).toBeCloseTo(0.01444, 5);
    expect(o.ikMax!).toBeCloseTo(15.95, 2);
  });
});

function chuveiro(): DadosQuadro {
  const d = quadroVazio();
  d.config.ikManual = 5;
  const q = d.quadros[0];
  const c = novoCircuito(1, q.tiposCarga);
  c.descricao = "Chuveiro";
  c.grupo = "b1";
  c.cargaEspecial = 2000;
  c.fp = 1;
  c.comprimento = 20;
  q.circuitos = [c];
  q.geral.comprimento = null;
  return d;
}

describe("dimensionamento de circuito terminal", () => {
  it("chuveiro de 2 000 W em 127 V: a queda de tensão leva a seção de 2,5 para 4 mm²", () => {
    const r = calcularQuadros(chuveiro()).quadros[0].circuitos[0];
    expect(r.Ib).toBeCloseTo(15.75, 2);
    expect(r.In).toBe(16);
    expect(r.secao).toBe(4);
    expect(r.dvTrecho!).toBeCloseTo(2.94, 2);
    expect(r.Im).toBe(160);
    expect(r.ikMinFim! * 1000).toBeGreaterThan(r.Im);
    expect(r.i2t!).toBeCloseTo(34000, 0);
    expect(r.k2s2).toBe(115 * 115 * 16);
    expect(Object.values(r.verif).every((v) => v === "ok")).toBe(true);
  });

  it("queda de tensão trifásica: √3 · Ib · L · (R cosφ + X senφ) / UL", () => {
    const dv = quedaPercentual("3F+N+PE", 220, 380, 100, 50, 0.5, 0.08, 1, 0.8);
    expect(dv).toBeCloseTo((Math.sqrt(3) * 100 * 0.05 * (0.5 * 0.8 + 0.08 * 0.6)) / 380 * 100, 10);
  });

  it("chuveiro sem DR de 30 mA recebe o aviso do 5.1.3.2.2", () => {
    const d = chuveiro();
    expect(calcularQuadros(d).quadros[0].circuitos[0].avisos.join(" ")).toContain("5.1.3.2.2");
    d.quadros[0].circuitos[0].protecao.dr = true;
    expect(calcularQuadros(d).quadros[0].circuitos[0].avisos.join(" ")).not.toContain("5.1.3.2.2");
  });

  it("esquema TT sem DR reprova a proteção contra choques", () => {
    const d = chuveiro();
    d.config.esquema = "TT";
    d.config.RA = 30;
    expect(calcularQuadros(d).quadros[0].circuitos[0].verif.choque).toBe("falha");
    d.quadros[0].circuitos[0].protecao.dr = true;
    const r = calcularQuadros(d).quadros[0].circuitos[0];
    expect(r.zsIa).toBeCloseTo(0.9, 6);
    expect(r.verif.choque).toBe("ok");
  });
});

describe("balanceamento de fases", () => {
  it("distribui seis circuitos iguais em duas por fase", () => {
    const d = quadroVazio();
    const q = d.quadros[0];
    q.circuitos = Array.from({ length: 6 }, (_, i) => ({ ...novoCircuito(i + 1, q.tiposCarga), cargaEspecial: 1000, fase: "A" as const }));
    const mapa = balancearFases(q, "127/220");
    const cont = { A: 0, B: 0, C: 0 } as Record<string, number>;
    Object.values(mapa).forEach((f) => (cont[f] += 1));
    expect(cont).toEqual({ A: 2, B: 2, C: 2 });
  });
});

describe("queda de tensão — 6.2.7", () => {
  function comTrafo(origemQueda: DadosQuadro["config"]["origemQueda"]): DadosQuadro {
    const d = chuveiro();
    d.config.tensao = "220/380";
    d.config.ikModo = "calculado";
    d.config.trafo = { kva: 150, z: 4.5, pk: null };
    d.config.caboOrigem = { ...d.config.caboOrigem, comprimento: 60, secao: 35 };
    d.config.origemQueda = origemQueda;
    const c = d.quadros[0].circuitos[0];
    c.cargaEspecial = 30000;
    c.esquema = "3F+N+PE";
    c.fase = "ABC";
    d.quadros[0].geral.comprimento = 30;
    return d;
  }

  it("com transformador próprio, a queda no cabo até a origem entra na conta (6.2.7.1 a)", () => {
    const res = calcularQuadros(comTrafo("trafo-proprio"));
    const ib = 30000 / (Math.sqrt(3) * 380);
    const r = resistenciaA("Cu", 5, 35, 90);
    const esperado = ((Math.sqrt(3) * ib * 0.06 * (r * 1 + reatancia("unipolar-trifolio") * 0)) / 380) * 100;
    expect(res.quedaOrigem!.Ib).toBeCloseTo(ib, 6);
    expect(res.quedaOrigem!.dv).toBeCloseTo(esperado, 6);
    const q = res.quadros[0];
    expect(q.geral.dvMontante).toBeCloseTo(esperado, 9);
    expect(q.circuitos[0].dvMontante).toBeCloseTo(esperado + q.geral.dvTrecho!, 9);
  });

  it("com ponto de entrega em BT, a queda conta a partir dele (6.2.7.1 c)", () => {
    const res = calcularQuadros(comTrafo("ponto-entrega-bt"));
    expect(res.quedaOrigem).toBeNull();
    expect(res.quadros[0].geral.dvMontante).toBe(0);
  });

  it("o alimentador só tem o limite global; 4% é só do terminal", () => {
    const d = comTrafo("ponto-entrega-bt");
    const g = d.quadros[0].geral;
    g.comprimento = 60;
    g.cond = { ...g.cond, secaoModo: "manual", secao: 10 };
    const q = calcularQuadros(d).quadros[0];
    expect(q.geral.limiteTrecho).toBe(5);
    expect(q.geral.dvTrecho!).toBeGreaterThan(1);
    expect(q.geral.dvTrecho!).toBeLessThan(5);
    expect(q.geral.verif.queda).toBe("ok");
    expect(q.circuitos[0].limiteTrecho).toBe(4);
  });

  it("na seção automática, o alimentador mira global − 4% quando é possível", () => {
    const q = calcularQuadros(comTrafo("ponto-entrega-bt")).quadros[0];
    expect(q.geral.dvAcumulada!).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("agrupamento com condutores em paralelo (Tabela 42, nota 3)", () => {
  it("dois conjuntos por fase contam como dois circuitos", () => {
    const d = chuveiro();
    d.quadros[0].circuitos[0].cond.condutoresPorFase = 2;
    const r = calcularQuadros(d).quadros[0].circuitos[0];
    expect(r.k2).toBe(fatorAgrupamento(2, 1));
    expect(r.k2).toBe(0.8);
  });
});

describe("curto-circuito", () => {
  it("acima de 32 A, sem catálogo, I²t = Ik² × 1 ciclo de 60 Hz", () => {
    expect(energiaPassante(63, "C", 10000).i2t).toBeCloseTo(1e8 / 60, 6);
  });

  it("neutro reduzido precisa estar protegido pelo disjuntor das fases (5.3.2.2.1.2 a)", () => {
    const d = quadroVazio();
    d.config.tensao = "220/380";
    d.config.ikManual = 50;
    const q = d.quadros[0];
    const c = novoCircuito(1, q.tiposCarga);
    c.esquema = "3F+N+PE";
    c.fase = "ABC";
    c.cargaEspecial = 100000;
    c.fp = 1;
    c.comprimento = 10;
    c.protecao = { ...c.protecao, inModo: "manual", In: 200 };
    c.cond = { ...c.cond, secaoModo: "manual", secao: 95, neutroReduzido: true };
    q.circuitos = [c];
    const r = calcularQuadros(d).quadros[0].circuitos[0];
    expect(r.secaoN).toBe(50);
    expect(r.i2t!).toBeLessThan(r.k2s2); // a fase aguenta
    expect(r.i2t!).toBeGreaterThan(115 * 115 * 50 * 50); // o neutro de 50 mm² não
    expect(r.verif.termica).toBe("falha");
    expect(r.avisos.join(" ")).toContain("5.3.2.2.1.2");
  });
});
