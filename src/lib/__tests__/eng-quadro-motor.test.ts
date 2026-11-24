import { describe, expect, it } from "vitest";
import { balancearFases, calcularOrigem, calcularQuadros, quedaPercentual } from "@/lib/engenharia/quadro/motor";
import { fatorAgrupamento, fatorTemperatura, izTabelado, neutroReduzido, secaoPE } from "@/lib/engenharia/quadro/tabelas";
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
    expect(secaoPE(120, "Cu")).toBe(70); // 60 mm² não é padronizada: sobe para 70
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
