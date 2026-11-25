import { describe, expect, it } from "vitest";
import { calcularRisco, componenteDominante, reducao } from "@/lib/engenharia/risco/motor";
import { pousada } from "./eng-fixtures";
import { pld, pli } from "@/lib/engenharia/risco/tabelas";
import { novaLinha, novaZona, riscoVazio, type EntradaRisco } from "@/lib/engenharia/risco/tipos";
import { observacoesNorma } from "@/lib/engenharia/risco/requisitos";
import { fmtFreq } from "@/lib/engenharia/formato";

describe("análise de risco — caso de referência (Projeto Pousada)", () => {
  const com = calcularRisco(pousada(true));
  const sem = calcularRisco(pousada(false));

  it("áreas de exposição e número de eventos (Seção 5 do laudo)", () => {
    expect(com.AD).toBeCloseTo(14107.19, 2);
    expect(com.AM).toBeCloseTo(900398.16, 2);
    expect(com.ND).toBeCloseTo(9.875e-2, 5);
    expect(com.NM).toBeCloseTo(12.61, 2);
    expect(com.linhas[0].AL).toBe(40000);
    expect(com.linhas[0].AI).toBe(4000000);
    expect(com.linhas[0].NL).toBeCloseTo(0.112, 6);
    expect(com.linhas[0].NI).toBeCloseTo(11.2, 6);
    expect(com.linhas[0].PLD).toBe(1);
    expect(com.linhas[0].PLI).toBe(0.3);
  });

  it("R1 com medidas = 0,571 ×10⁻⁵ e componentes por zona", () => {
    expect(com.R1!.total / 1e-5).toBeCloseTo(0.571, 3);
    const [z1, z2] = com.R1!.porZona;
    expect(z1.componentes.RB / 1e-5).toBeCloseTo(0.263, 3);
    expect(z1.componentes.RV / 1e-5).toBeCloseTo(0.299, 3);
    expect(z1.total / 1e-5).toBeCloseTo(0.563, 3);
    expect(z2.componentes.RA / 1e-5).toBeCloseTo(0.003, 3);
    expect(z2.componentes.RU / 1e-5).toBeCloseTo(0.004, 3);
    expect(z2.total / 1e-5).toBeCloseTo(0.008, 3);
    expect(com.R1!.excede).toBe(false);
  });

  it("R1 sem medidas = 28,627 ×10⁻⁵ (redução de 98,0%)", () => {
    expect(sem.R1!.total / 1e-5).toBeCloseTo(28.627, 3);
    expect(sem.R1!.excede).toBe(true);
    expect(reducao(sem.R1!.total, com.R1!.total)!).toBeCloseTo(-0.98, 3);
  });

  it("frequência de danos na Zona 1 (Seção 7 do laudo)", () => {
    const F = com.zonas[0].F!;
    expect(F.FB).toBe(0);
    expect(F.FC).toBeCloseTo(4.938e-3, 6);
    expect(F.FM).toBeCloseTo(1.008e-1, 4);
    expect(F.FV).toBeCloseTo(2.24e-3, 6);
    expect(F.FW).toBeCloseTo(5.6e-3, 6);
    expect(F.FZ).toBeCloseTo(1.68e-1, 6);
    expect(F.total).toBeCloseTo(0.2816, 4);
    expect(F.excede).toBe(false);
    expect(sem.zonas[0].F!.total).toBeCloseTo(5.7, 3);
    expect(com.zonas[1].F).toBeNull();
  });

  it("veredito e componente dominante (Painel de Risco)", () => {
    expect(com.toleravel).toBe(true);
    expect(com.criterios).toHaveLength(2);
    const dom = componenteDominante(com.R1!)!;
    expect(dom.chave).toBe("RV");
    expect(Math.round(dom.fracao * 100)).toBe(52);
  });
});

describe("tabelas B.8 e B.9", () => {
  it("PLD por blindagem e UW", () => {
    expect(pld("nao-blindada", 0.35)).toBe(1);
    expect(pld("1-5", 2.5)).toBe(0.6);
    expect(pld("ate-1", 6)).toBe(0.02);
  });
  it("PLI abaixo de 1 kV vale 1; sinal é mais sensível", () => {
    expect(pli("energia", 0.5)).toBe(1);
    expect(pli("energia", 4)).toBe(0.16);
    expect(pli("sinal", 4)).toBe(0.08);
  });
});

describe("perdas L3 e L4", () => {
  it("R3 só tem RB e RV; R4 inclui RC/RM e usa as razões de valor", () => {
    const e = pousada(false);
    e.zonas[0].perdas = { L1: false, L3: true, L4: true, F: false };
    e.zonas[0].L4 = { LT: "sem-animais", LF: "outros", LO: "outros", ca: 0, cb: 2, cc: 1, cs: 1 };
    e.zonas[1].perdas = { L1: false, L3: false, L4: true, F: false };
    e.zonas[1].L4 = { LT: "sem-animais", LF: "outros", LO: "outros", ca: 0, cb: 1, cc: 0, cs: 0 };
    const r = calcularRisco(e);
    expect(r.R1).toBeNull();
    expect(r.R3!.componentes.RA).toBe(0);
    expect(r.R3!.componentes.RC).toBe(0);
    expect(r.R3!.total).toBeCloseTo(r.R3!.componentes.RB + r.R3!.componentes.RV, 15);
    // Nota a da Tabela D.1: contra o RT representativo, as razões de valor valem 1.
    const z1 = r.zonas[0].perdas.L4!;
    expect(z1.LB).toBeCloseTo(1 * 0.01 * 0.1, 10);
    expect(z1.LC).toBeCloseTo(1e-4, 12);
    expect(z1.LA).toBe(0);
    expect(r.R4!.componentes.RA).toBe(0);
    expect(r.R4!.componentes.RM).toBeGreaterThan(0);
    // Já o custo (D.4) usa as razões: zona 1 tem 4 dos 5 mi (0,8) e cs/ct = 1/5.
    expect(r.custoPerdas!.ct).toBe(5);
    const zc = r.zonas[0].custoR4!;
    expect(zc).toBeLessThan(r.R4!.porZona[0].total);
    expect(r.custoPerdas!.CL).toBeCloseTo(r.custoPerdas!.R4 * 5e6, 6);
  });
});

describe("B.4.4 — CLD no PC", () => {
  it("fiação interna não blindada usa CLD = 1; blindada usa o CLD da Tabela B.4", () => {
    const e = pousada(true);
    e.linhas[0].clc = "duto-metalico"; // CLD = 0
    const naoBlindada = calcularRisco(e).zonas[0].prob.PC;
    expect(naoBlindada).toBeCloseTo(0.05, 10); // PSPD × 1
    e.zonas[0].energia.KS3 = "blindado";
    expect(calcularRisco(e).zonas[0].prob.PC).toBe(0);
  });
});

describe("notas 1 das Tabelas B.1 e B.3", () => {
  it("sem SPDA nem descida natural, PTA e o DPS coordenado não reduzem PA e PC", () => {
    const e = pousada(false);
    e.zonas[1].PTA = "avisos";
    e.zonas[1].energia.PSPD = "II";
    const z2 = calcularRisco(e).zonas[1];
    expect(z2.prob.PA).toBe(1);
    expect(z2.prob.PC).toBe(1);
    expect(z2.prob.PM).toBeLessThan(z2.prob.porTipo.energia!.PMS); // em PM o DPS continua valendo
    e.estrutura.PB = "IV";
    const comSpda = calcularRisco(e).zonas[1];
    expect(comSpda.prob.PA).toBeCloseTo(0.1 * 0.2, 12);
    expect(comSpda.prob.PC).toBeCloseTo(0.02, 12);
  });
});

/**
 * Caso calculado à mão, fora do laudo de referência: duas linhas (energia
 * enterrada com estrutura adjacente; sinal aérea blindada), equipamento na
 * ZPR 0A, KS3 reduzido pelo comprimento e sistema crítico. Cada valor
 * esperado sai direto das equações da norma, sem passar pelo motor.
 */
function duasLinhas(): EntradaRisco {
  const base = riscoVazio(10);
  const energia = {
    ...novaLinha("energia", 1),
    LL: 500,
    CE: "suburbano", // 0,5
    CI: "enterrado", // 0,5
    clc: "subterranea-nao-blindada", // CLD = CLI = 1
    UW: 2.5,
    adjacente: { L: 10, W: 10, H: 5, CDJ: "cercada-mesma-altura" }, // CDJ = 0,5
  };
  const sinal = {
    ...novaLinha("sinal", 1),
    LL: 1000,
    CE: "suburbano",
    CI: "aereo",
    blindagem: "1-5",
    clc: "blindada-interligada", // CLD = 1, CLI = 0
    UW: 1.5,
  };
  const zona = {
    ...novaZona(1),
    perdas: { L1: false, L3: false, L4: false, F: true },
    FT: "critico",
    equipamentosExpostos: true,
    energia: { KS3: "lacos-medios", comprimento: 50, PSPD: "II" },
    sinal: { KS3: "blindado", comprimento: null, PSPD: "I" },
  };
  return {
    estrutura: { ...base.estrutura, L: 20, W: 10, H: 8, CD: "isolada", PB: "III", PEB: "II" },
    linhas: [energia, sinal],
    zonas: [zona],
  };
}

describe("frequência de danos — Seção 7, Tabela 7 (caso calculado à mão)", () => {
  const NG = 10;
  const ND = NG * (20 * 10 + 2 * (3 * 8) * (20 + 10) + Math.PI * (3 * 8) ** 2) * 1 * 1e-6; // A.1, A.3
  const NM = NG * (2 * 500 * (20 + 10) + Math.PI * 500 ** 2) * 1e-6; // A.5, A.6
  const NL1 = NG * (40 * 500) * 0.5 * 0.5 * 1 * 1e-6; // A.7, A.8
  const NI1 = NG * (4000 * 500) * 0.5 * 0.5 * 1 * 1e-6; // A.9, A.10
  const NDJ1 = NG * (10 * 10 + 2 * 15 * 20 + Math.PI * 15 ** 2) * 0.5 * 1 * 1e-6; // A.4
  const NL2 = NG * (40 * 1000) * 1 * 0.5 * 1 * 1e-6;
  const PEB = 0.02;
  // PC (B.2, B.4.4, eq. 17): energia não blindada usa CLD = 1; sinal em cabo blindado usa o CLD da Tabela B.4 (= 1).
  const PC = 1 - (1 - 0.02 * 1) * (1 - 0.01 * 1);
  // PM (B.3, B.4): KS3 de 0,2 reduzido a 50 m; KS4 = 1/UW.
  const PMe = 0.02 * (1 * 1 * (0.2 * 0.5) * (1 / 2.5)) ** 2;
  const PMs = 0.01 * (1 * 1 * 1e-4 * (1 / 1.5)) ** 2;
  const PM = 1 - (1 - PMe) * (1 - PMs);
  const PW1 = 0.02 * 1 * 1; // PSPD × PLD × CLD
  const PW2 = 0.01 * 0.8 * 1; // PLD (1 < RS ≤ 5 Ω/km, 1,5 kV) = 0,8
  const PZ1 = 0.02 * 0.3 * 1; // PSPD × PLI (energia, 2,5 kV) × CLI
  const PZ2 = 0.01 * 0.5 * 0; // CLI = 0

  const F = calcularRisco(duasLinhas()).zonas[0].F!;

  it("cada componente segue a Tabela 7", () => {
    expect(F.FB).toBeCloseTo(ND * 0.1, 12); // ND × PB (equipamento na ZPR 0A)
    expect(F.FC).toBeCloseTo(ND * PC, 12);
    expect(F.FM).toBeCloseTo(NM * PM, 12);
    expect(F.FV).toBeCloseTo((NL1 + NDJ1) * PEB + NL2 * PEB, 12);
    expect(F.FW).toBeCloseTo((NL1 + NDJ1) * PW1 + NL2 * PW2, 12);
    expect(F.FZ).toBeCloseTo(NI1 * PZ1 + 20 * PZ2, 12);
  });

  it("F é a soma (equação 14) e compara com FT = 0,1 de sistema crítico", () => {
    expect(F.total).toBeCloseTo(F.FB + F.FC + F.FM + F.FV + F.FW + F.FZ, 15);
    expect(F.total).toBeCloseTo(0.04262, 5);
    expect(F.FT).toBe(0.1);
    expect(F.excede).toBe(false);
  });

  it("sem equipamento na ZPR 0A, FB = 0 (7.1.5)", () => {
    const e = duasLinhas();
    e.zonas[0].equipamentosExpostos = false;
    expect(calcularRisco(e).zonas[0].F!.FB).toBe(0);
  });
});

describe("C.3.4 — rp em estrutura com risco de explosão", () => {
  it("rp = 1 em todas as zonas, qualquer que seja a providência", () => {
    const e = pousada(true);
    e.zonas[0].rp = "automatica";
    e.zonas[1].rp = "manual";
    const antes = calcularRisco(e);
    expect(antes.zonas[0].rp).toBe(0.2);
    expect(antes.zonas[1].rp).toBe(0.5);

    e.zonas[1].rf = "explosao-z2";
    const r = calcularRisco(e);
    expect(r.zonas[0].rp).toBe(1);
    expect(r.zonas[1].rp).toBe(1);
    expect(r.zonas[0].perdas.L1!.LB).toBeCloseTo(antes.zonas[0].perdas.L1!.LB / 0.2, 15);
    expect(observacoesNorma(e, r).join(" ")).toContain("C.3.4");
  });

  it("LF de risco de explosão também caracteriza a estrutura", () => {
    const e = pousada(true);
    e.zonas[0].rp = "automatica";
    e.zonas[0].L1.LF = "explosao";
    expect(calcularRisco(e).zonas[0].rp).toBe(1);
  });
});

describe("exibição da frequência de danos", () => {
  it("valores pequenos não viram zero", () => {
    expect(fmtFreq(0.28158)).toBe("0,282");
    expect(fmtFreq(4.2e-5)).toBe("4,20×10⁻⁵");
    expect(fmtFreq(0)).toBe("0");
  });
});
