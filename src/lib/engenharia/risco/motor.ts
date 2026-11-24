/**
 * Motor da análise de risco — ABNT NBR 5419-2:2026.
 *
 * Função pura: entrada → números. Nada aqui sabe de tela ou de laudo; o
 * assistente recalcula a cada tecla e o laudo lê o mesmo resultado, então o
 * que a pessoa vê ao vivo é exatamente o que sai no documento.
 *
 * Referências por trecho:
 *  - áreas e número de eventos ............ Anexo A (A.1 a A.10)
 *  - probabilidades ....................... Anexo B (B.1 a B.11)
 *  - perdas L1 / L3 ....................... Anexo C (C.1 a C.4, C.7)
 *  - perdas L4 (informativo) .............. Anexo D (D.1 a D.4)
 *  - componentes RX = NX × PX × LX ........ Seção 6 (equações 3 a 11)
 *  - frequência de danos F ................ Seção 7 (equações 14 e 15, Tabela 7)
 */

import {
  CD,
  CE,
  CI,
  CT,
  FT,
  HZ,
  KS3,
  LF_L1,
  LF_L3,
  LF_L4,
  LO_L1,
  LO_L4,
  LT_L1,
  LT_L4,
  PB,
  PEB,
  PSPD,
  PTA,
  PTU,
  RF,
  RP,
  RS_ESTRUTURA,
  RT_PISO,
  RT_TOLERAVEL,
  opcaoCl,
  pld,
  pli,
  valor,
} from "./tabelas";
import type { EntradaRisco, LinhaRisco, TipoLinha, ZonaRisco } from "./tipos";

export type ChaveComponente = "RA" | "RB" | "RC" | "RM" | "RU" | "RV" | "RW" | "RZ";
export type Componentes = Record<ChaveComponente, number>;
export type ChaveRisco = "R1" | "R3" | "R4";

export const CHAVES: ChaveComponente[] = ["RA", "RB", "RC", "RM", "RU", "RV", "RW", "RZ"];

export const META_COMPONENTE: Record<ChaveComponente, { dano: "D1" | "D2" | "D3"; fonte: string; formula: string; descricao: string }> = {
  RA: { dano: "D1", fonte: "S1", formula: "ND × PA × LA", descricao: "ferimentos por choque, descarga na estrutura" },
  RB: { dano: "D2", fonte: "S1", formula: "ND × PB × LB", descricao: "danos físicos, descarga na estrutura" },
  RC: { dano: "D3", fonte: "S1", formula: "ND × PC × LC", descricao: "falha de sistemas internos, descarga na estrutura" },
  RM: { dano: "D3", fonte: "S2", formula: "NM × PM × LM", descricao: "falha de sistemas internos, descarga perto da estrutura" },
  RU: { dano: "D1", fonte: "S3", formula: "(NL+NDJ) × PU × LU", descricao: "ferimentos por choque, descarga na linha" },
  RV: { dano: "D2", fonte: "S3", formula: "(NL+NDJ) × PV × LV", descricao: "danos físicos, descarga na linha" },
  RW: { dano: "D3", fonte: "S3", formula: "(NL+NDJ) × PW × LW", descricao: "falha de sistemas internos, descarga na linha" },
  RZ: { dano: "D3", fonte: "S4", formula: "NI × PZ × LZ", descricao: "falha de sistemas internos, descarga perto da linha" },
};

export const META_RISCO: Record<ChaveRisco, { nome: string; equacao: string; RT: number; expoente: number; perda: "L1" | "L3" | "L4" }> = {
  R1: { nome: "Perda de vida humana", equacao: "R1 = RA + RB + RC + RM + RU + RV + RW + RZ", RT: RT_TOLERAVEL.R1, expoente: -5, perda: "L1" },
  R3: { nome: "Perda de patrimônio cultural", equacao: "R3 = RB + RV", RT: RT_TOLERAVEL.R3, expoente: -4, perda: "L3" },
  R4: { nome: "Perda de valor econômico", equacao: "R4 = RA* + RB + RC + RM + RU* + RV + RW + RZ", RT: RT_TOLERAVEL.R4, expoente: -3, perda: "L4" },
};

export interface ResultadoLinha {
  id: string;
  nome: string;
  tipo: TipoLinha;
  LL: number;
  AL: number;
  AI: number;
  NL: number;
  NI: number;
  ADJ: number;
  NDJ: number;
  CE: number;
  CT: number;
  CI: number;
  PLD: number;
  PLI: number;
  CLD: number;
  CLI: number;
  UW: number;
}

export interface ProbLinha {
  linhaId: string;
  tipo: TipoLinha;
  PSPD: number;
  PU: number;
  PV: number;
  PW: number;
  PZ: number;
}

export interface ResultadoFrequencia {
  FB: number;
  FC: number;
  FM: number;
  FV: number;
  FW: number;
  FZ: number;
  total: number;
  FT: number;
  excede: boolean;
}

export interface ResultadoZona {
  id: string;
  nome: string;
  /** nz/nt × tz/8760 × rS (fator comum das perdas L1). */
  fatorPessoas: number;
  prob: {
    PA: number;
    PB: number;
    PEB: number;
    PC: number;
    PM: number;
    KS1: number;
    KS2: number;
    porTipo: Partial<Record<TipoLinha, { PSPD: number; KS3: number; KS4: number; PMS: number; PM: number; UW: number }>>;
    linhas: ProbLinha[];
  };
  perdas: {
    L1: { LA: number; LB: number; LC: number } | null;
    L3: { LB: number } | null;
    L4: { LA: number; LB: number; LC: number } | null;
  };
  R1: Componentes | null;
  R3: Componentes | null;
  R4: Componentes | null;
  /** R4 da zona com as razões de valor (D.3) — base do custo anual das perdas (D.4). */
  custoR4: number | null;
  F: ResultadoFrequencia | null;
}

export interface ResultadoRiscoTotal {
  chave: ChaveRisco;
  componentes: Componentes;
  total: number;
  RT: number;
  excede: boolean;
  porZona: { zonaId: string; nome: string; componentes: Componentes; total: number }[];
}

export interface Criterio {
  chave: string;
  rotulo: string;
  valor: number;
  limite: number;
  ok: boolean;
  tipo: "risco" | "frequencia";
}

export interface ResultadoRisco {
  AD: number;
  AM: number;
  ND: number;
  NM: number;
  linhas: ResultadoLinha[];
  zonas: ResultadoZona[];
  R1: ResultadoRiscoTotal | null;
  R3: ResultadoRiscoTotal | null;
  R4: ResultadoRiscoTotal | null;
  /** Custo anual das perdas econômicas, D.4: CL = Σ R4z × ct (R$/ano). */
  custoPerdas: { ct: number; R4: number; CL: number } | null;
  criterios: Criterio[];
  /** Todos os riscos e frequências avaliados dentro do tolerável. */
  toleravel: boolean;
}

const zero = (): Componentes => ({ RA: 0, RB: 0, RC: 0, RM: 0, RU: 0, RV: 0, RW: 0, RZ: 0 });
const soma = (c: Componentes) => CHAVES.reduce((s, k) => s + c[k], 0);
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Estrutura em que as medidas de PTA e o DPS coordenado (no PC) são efetivos:
 * protegida por SPDA, ou metálica/concreto armado como descida natural
 * (notas 1 das Tabelas B.1 e B.3).
 */
export function estruturaEfetiva(pbId: string, ptaId: string): boolean {
  return pbId !== "sem-spda" || ptaId === "descida-natural";
}

/** A.1 — área de exposição equivalente de uma estrutura retangular isolada. */
export function areaExposicao(L: number, W: number, H: number): number {
  return L * W + 2 * (3 * H) * (L + W) + Math.PI * (3 * H) ** 2;
}

/** A.6 — área de influência perto da estrutura (500 m do perímetro). */
export function areaInfluencia(L: number, W: number): number {
  return 2 * 500 * (L + W) + Math.PI * 500 ** 2;
}

function calcularLinha(l: LinhaRisco, NG: number): ResultadoLinha {
  const LL = num(l.LL);
  const ce = valor(CE, l.CE);
  const ct = valor(CT, l.CT);
  const ci = valor(CI, l.CI);
  const AL = 40 * LL;
  const AI = 4000 * LL;
  const NL = NG * AL * ci * ce * ct * 1e-6;
  const NI = NG * AI * ci * ce * ct * 1e-6;
  let ADJ = 0;
  let NDJ = 0;
  if (l.adjacente) {
    ADJ = areaExposicao(num(l.adjacente.L), num(l.adjacente.W), num(l.adjacente.H));
    NDJ = NG * ADJ * valor(CD, l.adjacente.CDJ) * ct * 1e-6;
  }
  const cl = opcaoCl(l.clc);
  return {
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    LL,
    AL,
    AI,
    NL,
    NI,
    ADJ,
    NDJ,
    CE: ce,
    CT: ct,
    CI: ci,
    PLD: pld(l.blindagem, l.UW),
    PLI: pli(l.tipo, l.UW),
    CLD: cl.CLD,
    CLI: cl.CLI,
    UW: l.UW,
  };
}

/** KS3 da Tabela B.5 vale para 100 m de circuito; circuitos menores reduzem na proporção (nota e). */
export function ks3Efetivo(id: string, comprimento: number | null): number {
  const base = valor(KS3, id);
  if (comprimento == null || !(comprimento > 0) || comprimento >= 100) return base;
  return base * (comprimento / 100);
}

export function calcularRisco(entrada: EntradaRisco): ResultadoRisco {
  const e = entrada.estrutura;
  const NG = num(e.NG);
  const L = num(e.L);
  const W = num(e.W);
  const H = num(e.H);

  const AD = areaExposicao(L, W, H);
  const AM = areaInfluencia(L, W);
  const ND = NG * AD * valor(CD, e.CD) * 1e-6;
  const NM = NG * AM * 1e-6;

  const linhas = entrada.linhas.map((l) => calcularLinha(l, NG));
  const pb = valor(PB, e.PB);
  const peb = valor(PEB, e.PEB);
  const rS = valor(RS_ESTRUTURA, e.rS);
  const KS1 = e.semBlindagemKs1 ? 1 : limita(num(e.KS1) || 1, 1e-4, 1);
  const nt = num(e.nt);

  // Totais da estrutura que as razões cz/ct (L3) e c/ct (L4) usam.
  const ct3 = entrada.zonas.filter((z) => z.perdas.L3).reduce((s, z) => s + num(z.L3.cz), 0);
  const ct4 = entrada.zonas
    .filter((z) => z.perdas.L4)
    .reduce((s, z) => s + num(z.L4.ca) + num(z.L4.cb) + num(z.L4.cc) + num(z.L4.cs), 0);

  const zonas: ResultadoZona[] = entrada.zonas.map((z) => calcularZona(z));

  function calcularZona(z: ZonaRisco): ResultadoZona {
    const KS2 = z.semBlindagemKs2 ? 1 : limita(num(z.KS2) || 1, 1e-4, 1);
    // Notas 1 das Tabelas B.1 e B.3: as medidas contra toque/passo (PTA) e o
    // DPS coordenado (no PC) só são efetivos em estrutura protegida por SPDA
    // ou com estrutura metálica/concreto armado atuando como descida natural.
    const estruturaProtegida = estruturaEfetiva(e.PB, z.PTA);
    const PA = (estruturaProtegida ? valor(PTA, z.PTA) : 1) * pb;
    const ptu = valor(PTU, z.PTU);

    // Probabilidades por tipo de sistema interno (energia / sinal).
    const porTipo: ResultadoZona["prob"]["porTipo"] = {};
    for (const tipo of ["energia", "sinal"] as TipoLinha[]) {
      const daqui = linhas.filter((l) => l.tipo === tipo);
      if (!daqui.length) continue;
      const fiacao = z[tipo];
      const pspd = valor(PSPD, fiacao.PSPD);
      const ks3 = ks3Efetivo(fiacao.KS3, fiacao.comprimento);
      // B.4.15: com equipamentos de UW diferentes, vale o menor.
      const UW = Math.min(...daqui.map((l) => l.UW));
      const KS4 = Math.min(1, 1 / UW);
      const PMS = (KS1 * KS2 * ks3 * KS4) ** 2;
      // B.4.8 / B.4.9: sem DPS coordenado, PM = PMS.
      const PM = pspd < 1 ? pspd * PMS : PMS;
      porTipo[tipo] = { PSPD: pspd, KS3: ks3, KS4, PMS, PM, UW };
    }

    const probLinhas: ProbLinha[] = linhas.map((l) => {
      const pspd = porTipo[l.tipo]?.PSPD ?? 1;
      return {
        linhaId: l.id,
        tipo: l.tipo,
        PSPD: pspd,
        PU: ptu * peb * l.PLD * l.CLD, // B.8
        PV: peb * l.PLD * l.CLD, // B.9
        PW: pspd * l.PLD * l.CLD, // B.10
        PZ: pspd * l.PLI * l.CLI, // B.11
      };
    });

    // Equações 12 e 13: vários sistemas internos na zona. B.4.4: no PC, o CLD
    // da Tabela B.4 só vale para sistema interno blindado — fiação não
    // blindada usa CLD = 1 (aqui, "blindado" é o KS3 de cabos blindados).
    const cldPC = (l: ResultadoLinha) => (z[l.tipo].KS3 === "blindado" ? l.CLD : 1);
    const pspdPC = (l: ResultadoLinha) => (estruturaProtegida ? porTipo[l.tipo]?.PSPD ?? 1 : 1);
    const PC = 1 - linhas.reduce((acc, l) => acc * (1 - pspdPC(l) * cldPC(l)), 1);
    const PM = 1 - Object.values(porTipo).reduce((acc, t) => acc * (1 - (t?.PM ?? 0)), 1);

    const rt = valor(RT_PISO, z.rt);
    const rp = valor(RP, z.rp);
    const rf = valor(RF, z.rf);
    const hz = valor(HZ, z.hz);
    const fatorPessoas = nt > 0 ? (num(z.nz) / nt) * (num(z.tz) / 8760) * rS : 0;

    const componentesCom = (LA: number, LB: number, LC: number, comChoque = true): Componentes => {
      const c = zero();
      c.RA = comChoque ? ND * PA * LA : 0;
      c.RB = ND * pb * LB;
      c.RC = ND * PC * LC;
      c.RM = NM * PM * LC;
      linhas.forEach((l, i) => {
        const pr = probLinhas[i];
        const N = l.NL + l.NDJ;
        if (comChoque) c.RU += N * pr.PU * LA;
        c.RV += N * pr.PV * LB;
        c.RW += N * pr.PW * LC;
        c.RZ += l.NI * pr.PZ * LC;
      });
      return c;
    };

    // L1 — Tabela C.1
    let L1: ResultadoZona["perdas"]["L1"] = null;
    let R1: Componentes | null = null;
    if (z.perdas.L1) {
      const LA = rt * valor(LT_L1, z.L1.LT) * fatorPessoas;
      const LB = rp * rf * hz * valor(LF_L1, z.L1.LF) * fatorPessoas;
      const LC = valor(LO_L1, z.L1.LO) * fatorPessoas;
      L1 = { LA, LB, LC };
      R1 = componentesCom(LA, LB, LC);
    }

    // L3 — Tabela C.8: só RB e RV (equação 2).
    let L3: ResultadoZona["perdas"]["L3"] = null;
    let R3: Componentes | null = null;
    if (z.perdas.L3) {
      const razao = ct3 > 0 ? num(z.L3.cz) / ct3 : 1;
      const LB = rp * rf * valor(LF_L3, z.L3.LF) * razao;
      L3 = { LB };
      const c = componentesCom(0, LB, 0, false);
      R3 = { ...zero(), RB: c.RB, RV: c.RV };
    }

    // L4 — Tabela D.1. RA e RU só onde há animais de valor comercial.
    // Nota a da Tabela D.1: comparado com o RT representativo (10⁻³), as razões
    // ca/ct, (ca+cb+cc+cs)/ct e cs/ct NÃO entram (valem 1). Elas só entram na
    // avaliação de custo (D.4), que sai à parte em `custoR4`.
    let L4: ResultadoZona["perdas"]["L4"] = null;
    let R4: Componentes | null = null;
    let custoR4: number | null = null;
    if (z.perdas.L4) {
      const ca = num(z.L4.ca);
      const total = ca + num(z.L4.cb) + num(z.L4.cc) + num(z.L4.cs);
      const lt = valor(LT_L4, z.L4.LT);
      const lf = valor(LF_L4, z.L4.LF);
      const lo = valor(LO_L4, z.L4.LO);
      const LA = rt * lt;
      const LB = rp * rf * lf;
      const LC = lo;
      L4 = { LA, LB, LC };
      R4 = componentesCom(LA, LB, LC, lt > 0);
      if (ct4 > 0) {
        const c = componentesCom(LA * (ca / ct4), LB * (total / ct4), LC * (num(z.L4.cs) / ct4), lt > 0);
        custoR4 = soma(c);
      }
    }

    // Frequência de danos — Seção 7, Tabela 7.
    let F: ResultadoFrequencia | null = null;
    if (z.perdas.F) {
      const FB = z.equipamentosExpostos ? ND * pb : 0;
      const FC = ND * PC;
      const FM = NM * PM;
      let FV = 0;
      let FW = 0;
      let FZ = 0;
      linhas.forEach((l, i) => {
        const N = l.NL + l.NDJ;
        FV += N * peb;
        FW += N * probLinhas[i].PW;
        FZ += l.NI * probLinhas[i].PZ;
      });
      const total = FB + FC + FM + FV + FW + FZ;
      const ft = valor(FT, z.FT);
      F = { FB, FC, FM, FV, FW, FZ, total, FT: ft, excede: total > ft };
    }

    return {
      id: z.id,
      nome: z.nome,
      fatorPessoas,
      prob: { PA, PB: pb, PEB: peb, PC, PM, KS1, KS2, porTipo, linhas: probLinhas },
      perdas: { L1, L3, L4 },
      R1,
      R3,
      R4,
      custoR4,
      F,
    };
  }

  const agrega = (chave: ChaveRisco): ResultadoRiscoTotal | null => {
    const comPerda = zonas.filter((z) => z[chave]);
    if (!comPerda.length) return null;
    const componentes = zero();
    for (const z of comPerda) for (const k of CHAVES) componentes[k] += z[chave]![k];
    const total = soma(componentes);
    const RT = META_RISCO[chave].RT;
    return {
      chave,
      componentes,
      total,
      RT,
      excede: total > RT,
      porZona: comPerda.map((z) => ({ zonaId: z.id, nome: z.nome, componentes: z[chave]!, total: soma(z[chave]!) })),
    };
  };

  const R1 = agrega("R1");
  const R3 = agrega("R3");
  const R4 = agrega("R4");

  const criterios: Criterio[] = [];
  for (const r of [R1, R3, R4]) {
    if (r) criterios.push({ chave: r.chave, rotulo: r.chave, valor: r.total, limite: r.RT, ok: !r.excede, tipo: "risco" });
  }
  for (const z of zonas) {
    if (z.F) criterios.push({ chave: `F-${z.id}`, rotulo: `F — ${z.nome}`, valor: z.F.total, limite: z.F.FT, ok: !z.F.excede, tipo: "frequencia" });
  }

  const comCusto = zonas.filter((z) => z.custoR4 != null);
  const R4custo = comCusto.reduce((s, z) => s + (z.custoR4 ?? 0), 0);
  const custoPerdas = comCusto.length && ct4 > 0 ? { ct: ct4, R4: R4custo, CL: R4custo * ct4 * 1e6 } : null;

  return {
    AD,
    AM,
    ND,
    NM,
    linhas,
    zonas,
    R1,
    R3,
    R4,
    custoPerdas,
    criterios,
    toleravel: criterios.length > 0 && criterios.every((c) => c.ok),
  };
}

/** O componente que mais pesa num risco, com a fatia em %. */
export function componenteDominante(r: ResultadoRiscoTotal): { chave: ChaveComponente; fracao: number } | null {
  if (!(r.total > 0)) return null;
  let melhor: ChaveComponente = "RA";
  for (const k of CHAVES) if (r.componentes[k] > r.componentes[melhor]) melhor = k;
  return { chave: melhor, fracao: r.componentes[melhor] / r.total };
}

/** Redução relativa (negativa quando caiu), ou null se não havia base. */
export function reducao(antes: number, depois: number): number | null {
  if (!(antes > 0)) return null;
  return (depois - antes) / antes;
}
