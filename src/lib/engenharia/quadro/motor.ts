/**
 * Motor do quadro de cargas — ABNT NBR 5410:2004.
 *
 * Sequência (a mesma do memorial):
 *  1. potência e corrente de projeto de cada circuito (com harmônicas);
 *  2. demanda por grupo e corrente do alimentador (fase mais carregada);
 *  3. impedância da fonte Z_Q e curto-circuito na origem;
 *  4. alimentador: disjuntor, seção por capacidade de condução e queda;
 *  5. circuitos: disjuntor (Ib ≤ In ≤ Iz), seção pelo maior dos critérios
 *     (capacidade, queda, atuação magnética e I²t), neutro e PE;
 *  6. verificações: sobrecarga, queda, capacidade de interrupção,
 *     suportabilidade térmica, atuação magnética e proteção contra choques.
 *
 * Curto-circuito pelo método das impedâncias (IEC 60909 simplificado):
 * máximo com c = 1,05 e condutores a 20 °C; mínimo com c = 0,95 e condutores
 * na temperatura máxima de serviço.
 */

import {
  CAPACIDADES_INTERRUPCAO,
  CORRENTES_DISJUNTOR,
  CORRENTES_DR,
  energiaPassante,
  fatorAgrupamento,
  fatorK,
  fatorTemperatura,
  izTabelado,
  metodoInstalacao,
  metodoReferencia,
  multiploCurva,
  neutroReduzido,
  nomeGrupo,
  reatancia,
  resistencia20,
  resistenciaA,
  secaoMinima,
  secaoPE,
  secoesDe,
  temperaturaServico,
  tempoSeccionamento,
  tensaoContatoLimite,
  type MetodoRef,
} from "./tabelas";
import {
  LIMITE_TERMINAL,
  ORIGENS_QUEDA,
  type CaboTrecho,
  type Circuito,
  type ClasseTensao,
  type Condutores,
  type ConfigQuadro,
  type DadosQuadro,
  type EsquemaCondutores,
  type Fase,
  type Protecao,
  type Quadro,
} from "./tipos";

export const C_MAX = 1.05;
export const C_MIN = 0.95;

export interface Z {
  r: number;
  x: number;
}
const Z0: Z = { r: 0, x: 0 };
const soma = (...zs: Z[]): Z => zs.reduce((a, b) => ({ r: a.r + b.r, x: a.x + b.x }), Z0);
export const modulo = (z: Z) => Math.hypot(z.r, z.x);
const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const tem = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function tensoes(t: ClasseTensao): { U0: number; UL: number } {
  return t === "220/380" ? { U0: 220, UL: 380 } : { U0: 127, UL: 220 };
}

export type Verif = "ok" | "falha" | "sem-dados";

// ------------------------------------------------------------------ origem

export interface ResultadoOrigem {
  modo: "manual" | "calculado";
  /** Ik trifásico máximo na origem (kA). */
  ikMax: number | null;
  cosCc: number | null;
  /** Impedâncias da fonte vistas da origem (Ω). */
  zMax: Z;
  z1Min: Z;
  zLacoPE: Z;
  zLacoN: Z;
  trafo: { In: number; ZT: number; RT: number; XT: number; ik: number } | null;
  cabo: { R: number; X: number } | null;
  completo: boolean;
}

function zCabo(c: { material: CaboTrecho["material"]; classe: 2 | 5; config: CaboTrecho["config"] }, secao: number, comprimento: number, n: number, temperatura: number): Z {
  const km = comprimento / 1000;
  return {
    r: (temperatura === 20 ? resistencia20(c.material, c.classe, secao) : resistenciaA(c.material, c.classe, secao, temperatura)) * km / Math.max(1, n),
    x: (reatancia(c.config) * km) / Math.max(1, n),
  };
}

export function calcularOrigem(cfg: ConfigQuadro): ResultadoOrigem {
  const { UL } = tensoes(cfg.tensao);
  const cos = Math.min(1, Math.max(0.05, cfg.cosCc || 0.3));
  if (cfg.ikModo === "manual") {
    if (!tem(cfg.ikManual)) {
      return { modo: "manual", ikMax: null, cosCc: null, zMax: Z0, z1Min: Z0, zLacoPE: Z0, zLacoN: Z0, trafo: null, cabo: null, completo: false };
    }
    const zm = (C_MAX * UL) / (Math.sqrt(3) * cfg.ikManual * 1000);
    const z: Z = { r: zm * cos, x: zm * Math.sqrt(1 - cos * cos) };
    // Com o Ik informado, a falta fase-terra na origem é tomada igual à trifásica
    // (transformador Dyn, Z0 ≈ Z1): o laço da fonte vale Z_Q.
    return { modo: "manual", ikMax: cfg.ikManual, cosCc: cos, zMax: z, z1Min: z, zLacoPE: z, zLacoN: z, trafo: null, cabo: null, completo: true };
  }
  const t = cfg.trafo;
  if (!tem(t.kva) || !tem(t.z)) {
    return { modo: "calculado", ikMax: null, cosCc: null, zMax: Z0, z1Min: Z0, zLacoPE: Z0, zLacoN: Z0, trafo: null, cabo: null, completo: false };
  }
  const Sn = t.kva * 1000;
  const In = Sn / (Math.sqrt(3) * UL);
  const ZT = (t.z / 100) * (UL * UL) / Sn;
  const RT = tem(t.pk) ? Math.min(ZT * 0.99, t.pk / (3 * In * In)) : ZT * cos;
  const XT = Math.sqrt(Math.max(0, ZT * ZT - RT * RT));
  const zt: Z = { r: RT, x: XT };
  const ikTrafo = (C_MAX * UL) / (Math.sqrt(3) * ZT) / 1000;

  const c = cfg.caboOrigem;
  let cabo20 = Z0;
  let caboQ = Z0;
  let pe = Z0;
  if (tem(c.comprimento) && tem(c.secao)) {
    const th = temperaturaServico(c.isolacao);
    cabo20 = zCabo(c, c.secao, c.comprimento, c.condutoresPorFase, 20);
    caboQ = zCabo(c, c.secao, c.comprimento, c.condutoresPorFase, th);
    pe = zCabo(c, secaoPE(c.secao * Math.max(1, c.condutoresPorFase), c.material), c.comprimento, 1, th);
  }
  const zMax = soma(zt, cabo20);
  const ikMax = (C_MAX * UL) / (Math.sqrt(3) * modulo(zMax)) / 1000;
  return {
    modo: "calculado",
    ikMax,
    cosCc: zMax.r / modulo(zMax),
    zMax,
    z1Min: soma(zt, caboQ),
    zLacoPE: soma(zt, caboQ, pe),
    zLacoN: soma(zt, caboQ, caboQ),
    trafo: { In, ZT, RT, XT, ik: ikTrafo },
    cabo: tem(c.comprimento) && tem(c.secao) ? { R: cabo20.r, X: cabo20.x } : null,
    completo: true,
  };
}

// ---------------------------------------------------------------- circuitos

export interface ResultadoCircuito {
  id: string;
  tag: string;
  descricao: string;
  grupo: string;
  esquema: EsquemaCondutores;
  fase: Fase;
  reserva: boolean;
  P: number;
  S: number;
  Q: number;
  especial: number;
  fp: number;
  thd: number;
  I1: number;
  Ib: number;
  carregados: 2 | 3 | 4;
  f4: number;
  In: number;
  inAuto: boolean;
  curva: Protecao["curva"];
  Im: number;
  icu: number | null;
  dr: boolean;
  drIn: number | null;
  drSens: number;
  material: Condutores["material"];
  isolacao: Condutores["isolacao"];
  tensaoIsolacao: Condutores["tensaoIsolacao"];
  classe: 2 | 5;
  metodo: string;
  metodoRef: MetodoRef;
  config: Condutores["config"];
  condPorFase: number;
  secao: number;
  secaoAuto: boolean;
  secaoN: number | null;
  secaoPE: number;
  k1: number;
  k2: number;
  izTab: number;
  iz: number;
  /** Ω/km na temperatura de serviço, por condutor. */
  rKm: number;
  xKm: number;
  /** Ω no trecho (fase, já dividido pelos condutores em paralelo). */
  R: number;
  X: number;
  comprimento: number | null;
  dvTrecho: number | null;
  dvMontante: number;
  dvAcumulada: number | null;
  limiteTrecho: number;
  limiteGlobal: number;
  ikInicio: number | null;
  ikMaxFim: number | null;
  ikMinFim: number | null;
  i2t: number | null;
  i2tOrigem: string;
  k: number;
  k2s2: number;
  secaoMinCurto: number | null;
  zs: number | null;
  ia: number | null;
  iaOrigem: string;
  tmax: number;
  zsIa: number | null;
  U0: number;
  /** Impedâncias acumuladas no fim do circuito (para o diagrama). */
  zFimMax: Z | null;
  zFimLaco: Z | null;
  verif: {
    sobrecarga: Verif;
    queda: Verif;
    icu: Verif;
    termica: Verif;
    magnetica: Verif;
    choque: Verif;
  };
  avisos: string[];
}

const FASES_MONO: Fase[] = ["A", "B", "C"];
const FASES_BI: Fase[] = ["AB", "BC", "CA"];

export function polosDoEsquema(e: EsquemaCondutores): 1 | 2 | 3 {
  return e === "F+N+PE" ? 1 : e === "2F+PE" || e === "2F+N+PE" ? 2 : 3;
}

export function temNeutro(e: EsquemaCondutores): boolean {
  return e === "F+N+PE" || e === "2F+N+PE" || e === "3F+N+PE";
}

/** Fase coerente com o esquema (um circuito trifásico só pode estar em ABC). */
export function faseCoerente(e: EsquemaCondutores, f: Fase): Fase {
  const polos = polosDoEsquema(e);
  if (polos === 3) return "ABC";
  if (polos === 2) return FASES_BI.includes(f) ? f : f === "B" ? "BC" : f === "C" ? "CA" : "AB";
  return FASES_MONO.includes(f) ? f : (f.charAt(0) as Fase);
}

/** Corrente fundamental do circuito pela potência aparente. */
export function correnteDe(S: number, e: EsquemaCondutores, U0: number, UL: number): number {
  switch (e) {
    case "F+N+PE":
      return S / U0;
    case "2F+PE":
      return S / UL;
    case "2F+N+PE":
      return S / (2 * U0);
    default:
      return S / (Math.sqrt(3) * UL);
  }
}

/** Fator b e tensão de referência da queda de tensão. */
export function parametrosQueda(e: EsquemaCondutores, U0: number, UL: number): { b: number; U: number } {
  switch (e) {
    case "F+N+PE":
      return { b: 2, U: U0 };
    case "2F+PE":
      return { b: 2, U: UL };
    case "2F+N+PE":
      return { b: 1.5, U: U0 };
    default:
      return { b: Math.sqrt(3), U: UL };
  }
}

export function quedaPercentual(e: EsquemaCondutores, U0: number, UL: number, Ib: number, comprimento: number, rKm: number, xKm: number, n: number, fp: number): number {
  const { b, U } = parametrosQueda(e, U0, UL);
  const sen = Math.sqrt(Math.max(0, 1 - fp * fp));
  return ((b * Ib * (comprimento / 1000) * (rKm * fp + xKm * sen)) / Math.max(1, n) / U) * 100;
}

function proximo<T extends number>(lista: readonly T[], minimo: number): T | null {
  return lista.find((v) => v + 1e-9 >= minimo) ?? null;
}

export function potenciaCircuito(c: Circuito, q: Quadro): { P: number; especial: number } {
  if (c.reserva) return { P: 0, especial: 0 };
  let P = 0;
  for (const t of q.tiposCarga) P += num(c.quantidades[t.id]) * num(t.potencia);
  const especial = num(c.cargaEspecial);
  return { P: P + especial, especial };
}

interface ContextoFonte {
  U0: number;
  UL: number;
  esquema: ConfigQuadro["esquema"];
  situacao: 1 | 2;
  RA: number | null;
  /** Ik máximo no ponto de origem do trecho (kA). */
  ikInicio: number | null;
  zMax: Z | null;
  z1Min: Z | null;
  zLacoPE: Z | null;
  zLacoN: Z | null;
  dvMontante: number;
  /** Limite da norma só para o trecho: 4% no terminal (6.2.7.2); o alimentador só tem o global. */
  limiteTrecho: number;
  limiteGlobal: number;
  /**
   * Alvo da seção automática para a queda acumulada. No alimentador, global − 4%,
   * para deixar os 4% aos terminais; se nenhuma seção chegar lá, vale o limite da norma.
   */
  alvoAcumulado: number;
}

interface EntradaTrecho {
  id: string;
  tag: string;
  descricao: string;
  grupo: string;
  esquema: EsquemaCondutores;
  fase: Fase;
  reserva: boolean;
  P: number;
  especial: number;
  fp: number;
  thd: number;
  uso: "iluminacao" | "forca";
  protecao: Protecao;
  cond: Condutores;
  comprimento: number | null;
  /** Corrente de projeto imposta (alimentador: a fase mais carregada com demanda). */
  ibImposto?: number;
}

function calcularTrecho(t: EntradaTrecho, ctx: ContextoFonte): ResultadoCircuito {
  const { U0, UL } = ctx;
  const avisos: string[] = [];
  const fp = Math.min(1, Math.max(0.1, t.fp || 1));
  const S = t.P / fp;
  const Q = Math.sqrt(Math.max(0, S * S - t.P * t.P));
  const thd = Math.max(0, num(t.thd));
  const I1 = t.ibImposto ?? correnteDe(S, t.esquema, U0, UL);
  const Ib = t.ibImposto ?? I1 * Math.sqrt(1 + (thd / 100) ** 2);

  // Condutores carregados (Tabela 46 e 6.2.5.6.1).
  let carregados: 2 | 3 | 4 = t.esquema === "F+N+PE" || t.esquema === "2F+PE" ? 2 : 3;
  if (t.esquema === "3F+N+PE" && thd > 15) carregados = 4;
  const f4 = carregados === 4 ? 0.86 : 1;

  const c = t.cond;
  const n = Math.max(1, Math.round(c.condutoresPorFase || 1));
  const metodoRef = metodoReferencia(c.metodo, c.config);
  const enterrado = metodoRef === "D";
  const k1 = tem(c.k1Manual) ? c.k1Manual : fatorTemperatura(c.temperatura || 30, c.isolacao, enterrado);
  // Tabela 42, nota 3: cada conjunto de condutores em paralelo conta como um circuito no agrupamento.
  const k2 = tem(c.k2Manual) ? c.k2Manual : fatorAgrupamento((c.agrupados || 1) + (n - 1), metodoInstalacao(c.metodo).agrupamento);
  const thServ = temperaturaServico(c.isolacao);

  // Disjuntor: Ib ≤ In.
  const inAuto = t.protecao.inModo === "auto" || !tem(t.protecao.In);
  // Reserva sem carga ainda leva um disjuntor de uso geral (10 A) no quadro.
  const In = inAuto ? proximo(CORRENTES_DISJUNTOR, Math.max(Ib, t.reserva ? 10 : 2)) ?? CORRENTES_DISJUNTOR[CORRENTES_DISJUNTOR.length - 1] : (t.protecao.In as number);
  const Im = multiploCurva(t.protecao.curva) * In;
  const icuAuto = t.protecao.icuModo === "auto" || !tem(t.protecao.icu);
  const icu = icuAuto ? (ctx.ikInicio != null ? proximo(CAPACIDADES_INTERRUPCAO, ctx.ikInicio) : null) : (t.protecao.icu as number);
  const drIn = t.protecao.dr ? proximo(CORRENTES_DR, In) ?? In : null;

  const comprimento = tem(t.comprimento) ? t.comprimento : null;
  const limiteTrecho = ctx.limiteTrecho;

  const avaliar = (secao: number) => {
    const izTab = izTabelado({ material: c.material, isolacao: c.isolacao, metodo: metodoRef, config: c.config, carregados: carregados === 4 ? 3 : carregados, secao }) ?? 0;
    const iz = izTab * k1 * k2 * f4 * n;
    const rKm = resistenciaA(c.material, c.classe, secao, thServ);
    const xKm = reatancia(c.config);
    const secaoN = temNeutro(t.esquema)
      ? t.esquema === "3F+N+PE" && c.neutroReduzido && thd <= 15
        ? neutroReduzido(secao)
        : secao
      : null;
    const sPE = secaoPE(secao * n, c.material);
    const dvTrecho = comprimento != null ? quedaPercentual(t.esquema, U0, UL, Ib, comprimento, rKm, xKm, n, fp) : null;

    // Impedâncias do trecho.
    let ikMaxFim: number | null = null;
    let ikMinFim: number | null = null;
    let zs: number | null = null;
    let zFimMax: Z | null = null;
    let zFimLaco: Z | null = null;
    if (comprimento != null && ctx.zMax && ctx.z1Min && ctx.zLacoPE && ctx.zLacoN) {
      const fase20 = zCabo(c, secao, comprimento, n, 20);
      const faseQ = zCabo(c, secao, comprimento, n, thServ);
      const neutro20 = secaoN ? zCabo(c, secaoN, comprimento, n, 20) : null;
      const neutroQ = secaoN ? zCabo(c, secaoN, comprimento, n, thServ) : null;
      const peQ = zCabo(c, sPE, comprimento, 1, thServ);
      zFimMax = soma(ctx.zMax, fase20);
      const polos = polosDoEsquema(t.esquema);
      if (polos === 3) ikMaxFim = (C_MAX * UL) / (Math.sqrt(3) * modulo(zFimMax)) / 1000;
      else if (polos === 2 && !neutro20) ikMaxFim = (C_MAX * UL) / (2 * modulo(zFimMax)) / 1000;
      else ikMaxFim = (C_MAX * U0) / modulo(soma(ctx.zLacoN, fase20, neutro20 ?? fase20)) / 1000;
      // Curto mínimo para a atuação magnética: fase-neutro se houver neutro, senão fase-fase.
      ikMinFim = neutroQ
        ? (C_MIN * U0) / modulo(soma(ctx.zLacoN, faseQ, neutroQ)) / 1000
        : (C_MIN * UL) / (2 * modulo(soma(ctx.z1Min, faseQ))) / 1000;
      zFimLaco = soma(ctx.zLacoPE, faseQ, peQ);
      zs = modulo(zFimLaco);
    }

    const k = fatorK(c.material, c.isolacao, secao);
    const k2s2 = k * k * secao * secao * n * n;
    // Neutro reduzido sem detecção de sobrecorrente própria: precisa estar protegido
    // contra curtos pelo disjuntor das fases (5.3.2.2.1.2 a).
    const kN = secaoN != null && secaoN < secao ? fatorK(c.material, c.isolacao, secaoN) : null;
    const k2s2N = kN != null && secaoN != null ? kN * kN * secaoN * secaoN * n * n : null;
    let i2t: number | null = null;
    let i2tOrigem = "";
    if (tem(t.protecao.i2tManual)) {
      i2t = t.protecao.i2tManual;
      i2tOrigem = "Catálogo do fabricante (informado)";
    } else if (ctx.ikInicio != null) {
      const e = energiaPassante(In, t.protecao.curva, ctx.ikInicio * 1000);
      i2t = e.i2t;
      i2tOrigem = e.origem;
    }
    return { secao, izTab, iz, rKm, xKm, secaoN, sPE, dvTrecho, ikMaxFim, ikMinFim, zs, zFimMax, zFimLaco, k, k2s2, k2s2N, i2t, i2tOrigem };
  };

  type Aval = ReturnType<typeof avaliar>;
  const suportaCurto = (a: Aval) => a.i2t == null || (a.i2t <= a.k2s2 && (a.k2s2N == null || a.i2t <= a.k2s2N));
  const atende = (a: Aval, alvo: number) => {
    if (In > a.iz + 1e-9) return false;
    if (a.dvTrecho != null && (a.dvTrecho > limiteTrecho + 1e-9 || ctx.dvMontante + a.dvTrecho > alvo + 1e-9)) return false;
    if (a.ikMinFim != null && a.ikMinFim * 1000 < Im) return false;
    if (!suportaCurto(a)) return false;
    return true;
  };

  const secoes = secoesDe(c.material);
  const smin = secaoMinima(t.uso, c.material);
  const secaoAuto = c.secaoModo === "auto" || !tem(c.secao);
  let av: Aval;
  if (secaoAuto) {
    const candidatas = secoes.filter((s) => s >= smin - 1e-9);
    const avaliadas = candidatas.map(avaliar);
    // Primeiro o alvo de projeto; se nenhuma seção chega lá, o limite da norma.
    const alvos = Array.from(new Set([Math.min(ctx.alvoAcumulado, ctx.limiteGlobal), ctx.limiteGlobal]));
    av = alvos.map((alvo) => avaliadas.find((a) => atende(a, alvo))).find((a) => a != null) ?? avaliadas[avaliadas.length - 1];
  } else {
    av = avaliar(c.secao as number);
    if ((c.secao as number) < smin) avisos.push(`Seção abaixo do mínimo da Tabela 47 (${fmtSecao(smin)} mm²).`);
  }

  if (thd > 33 && temNeutro(t.esquema) && polosDoEsquema(t.esquema) > 1) {
    avisos.push("THD acima de 33%: o neutro pode precisar de seção maior que a fase (6.2.6.2.5 e Anexo F).");
  }
  if (Ib > In + 1e-9) avisos.push("Corrente de projeto maior que a corrente nominal do disjuntor.");
  // 5.1.3.2.2 a): pontos de utilização em locais com banheira ou chuveiro
  // exigem DR de alta sensibilidade (IΔn ≤ 30 mA), qualquer que seja o esquema.
  if (t.grupo === "b1" && !(t.protecao.dr && t.protecao.drSens <= 30)) {
    avisos.push("Local com chuveiro/banheira: DR com IΔn ≤ 30 mA é obrigatório (5.1.3.2.2 a).");
  }

  // Verificações.
  const sobrecarga: Verif = Ib <= In + 1e-9 && In <= av.iz + 1e-9 ? "ok" : "falha";
  const queda: Verif = av.dvTrecho == null ? "sem-dados" : av.dvTrecho <= limiteTrecho + 1e-9 && ctx.dvMontante + av.dvTrecho <= ctx.limiteGlobal + 1e-9 ? "ok" : "falha";
  const icuV: Verif = ctx.ikInicio == null || icu == null ? "sem-dados" : icu + 1e-9 >= ctx.ikInicio ? "ok" : "falha";
  const termica: Verif = av.i2t == null ? "sem-dados" : suportaCurto(av) ? "ok" : "falha";
  if (av.i2t != null && av.i2t <= av.k2s2 && av.k2s2N != null && av.i2t > av.k2s2N) {
    avisos.push("Neutro reduzido não fica protegido contra curto-circuito pelo disjuntor das fases (I²t > k²·SN²): aumente o neutro ou preveja detecção de sobrecorrente nele (5.3.2.2.1.2).");
  }
  const magnetica: Verif = av.ikMinFim == null ? "sem-dados" : av.ikMinFim * 1000 >= Im ? "ok" : "falha";

  const tmax = tempoSeccionamento(U0, ctx.situacao);
  let choque: Verif = "sem-dados";
  let ia: number | null = null;
  let iaOrigem = "";
  let zsIa: number | null = null;
  if (ctx.esquema === "TN-S") {
    ia = t.protecao.dr ? t.protecao.drSens / 1000 : Im;
    iaOrigem = t.protecao.dr ? `DR IΔn = ${t.protecao.drSens} mA` : `Disparo magnético (${multiploCurva(t.protecao.curva)}·In)`;
    if (av.zs != null) {
      zsIa = av.zs * ia;
      choque = zsIa <= U0 + 1e-9 ? "ok" : "falha";
    }
  } else {
    const UL_ = tensaoContatoLimite(ctx.situacao);
    if (!t.protecao.dr) {
      choque = "falha";
      iaOrigem = "Esquema TT exige dispositivo DR (5.1.2.2.4.3)";
    } else {
      ia = t.protecao.drSens / 1000;
      iaOrigem = `DR IΔn = ${t.protecao.drSens} mA`;
      if (tem(ctx.RA)) {
        zsIa = ctx.RA * ia;
        choque = zsIa <= UL_ + 1e-9 ? "ok" : "falha";
      }
    }
  }

  // Reserva: o que depende de cabo e comprimento ainda não existe — não
  // se aplica, em vez de "faltam dados" (que pediria um dado que não há).
  const naoAplica = (x: Verif): Verif => (t.reserva && x === "sem-dados" ? "ok" : x);

  return {
    id: t.id,
    tag: t.tag,
    descricao: t.descricao,
    grupo: t.grupo,
    esquema: t.esquema,
    fase: t.fase,
    reserva: t.reserva,
    P: t.P,
    S,
    Q,
    especial: t.especial,
    fp,
    thd,
    I1,
    Ib,
    carregados,
    f4,
    In,
    inAuto,
    curva: t.protecao.curva,
    Im,
    icu,
    dr: t.protecao.dr,
    drIn,
    drSens: t.protecao.drSens,
    material: c.material,
    isolacao: c.isolacao,
    tensaoIsolacao: c.tensaoIsolacao,
    classe: c.classe,
    metodo: c.metodo,
    metodoRef,
    config: c.config,
    condPorFase: n,
    secao: av.secao,
    secaoAuto,
    secaoN: av.secaoN,
    secaoPE: av.sPE,
    k1,
    k2,
    izTab: av.izTab,
    iz: av.iz,
    rKm: av.rKm,
    xKm: av.xKm,
    R: comprimento != null ? (av.rKm * comprimento) / 1000 / n : 0,
    X: comprimento != null ? (av.xKm * comprimento) / 1000 / n : 0,
    comprimento,
    dvTrecho: av.dvTrecho,
    dvMontante: ctx.dvMontante,
    dvAcumulada: av.dvTrecho != null ? ctx.dvMontante + av.dvTrecho : null,
    limiteTrecho,
    limiteGlobal: ctx.limiteGlobal,
    ikInicio: ctx.ikInicio,
    ikMaxFim: av.ikMaxFim,
    ikMinFim: av.ikMinFim,
    i2t: av.i2t,
    i2tOrigem: av.i2tOrigem,
    k: av.k,
    k2s2: av.k2s2,
    secaoMinCurto: av.i2t != null ? Math.sqrt(av.i2t) / av.k : null,
    zs: av.zs,
    ia,
    iaOrigem,
    tmax,
    zsIa,
    U0,
    zFimMax: av.zFimMax,
    zFimLaco: av.zFimLaco,
    verif: { sobrecarga, queda: naoAplica(queda), icu: naoAplica(icuV), termica: naoAplica(termica), magnetica: naoAplica(magnetica), choque: naoAplica(choque) },
    avisos,
  };
}

export function fmtSecao(s: number): string {
  return s.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// ------------------------------------------------------------------ quadro

export interface CargaFase {
  I: number;
  kVA: number;
}

export interface ResultadoQuadro {
  id: string;
  nome: string;
  potencias: { Pinst: number; Sinst: number; Qinst: number; Pdem: number; Sdem: number; Qdem: number; fp: number; especial: number };
  grupos: { id: string; nome: string; Pinst: number; fd: number; Pdem: number }[];
  fases: { A: CargaFase; B: CargaFase; C: CargaFase; desequilibrio: number };
  geral: ResultadoCircuito;
  ikBarramento: number | null;
  circuitos: ResultadoCircuito[];
  resumo: {
    n: number;
    falhas: number;
    semDados: number;
    choque: { ok: number; falha: number; semDados: number };
    curto: { icu: Verif; termica: number; magnetica: number };
  };
}

export interface ResultadoQuadros {
  U0: number;
  UL: number;
  origem: ResultadoOrigem;
  limiteGlobal: number;
  /**
   * Queda no cabo do transformador até a origem, com a soma das demandas de
   * todos os quadros. Só entra quando o limite é contado a partir dos terminais
   * do transformador ou do gerador (6.2.7.1 a, b, d).
   */
  quedaOrigem: { Ib: number; fp: number; dv: number } | null;
  quadros: ResultadoQuadro[];
}

/** Distribuição da carga de um circuito nas fases (corrente e kVA). */
export function cargaNasFases(S: number, esquema: EsquemaCondutores, fase: Fase, U0: number, UL: number): Record<"A" | "B" | "C", CargaFase> {
  const out = { A: { I: 0, kVA: 0 }, B: { I: 0, kVA: 0 }, C: { I: 0, kVA: 0 } };
  const f = faseCoerente(esquema, fase);
  const I = correnteDe(S, esquema, U0, UL);
  const letras = f.split("") as ("A" | "B" | "C")[];
  for (const l of letras) {
    out[l].I += I;
    out[l].kVA += S / 1000 / letras.length;
  }
  return out;
}

export function calcularQuadros(d: DadosQuadro): ResultadoQuadros {
  const { U0, UL } = tensoes(d.config.tensao);
  const origem = calcularOrigem(d.config);
  const limiteGlobal = ORIGENS_QUEDA.find((o) => o.id === d.config.origemQueda)?.limite ?? 5;
  const quedaOrigem = calcularQuedaOrigem(d, U0, UL);
  const quadros = d.quadros.map((q) => calcularQuadro(q, d.config, origem, U0, UL, limiteGlobal, quedaOrigem?.dv ?? 0));
  return { U0, UL, origem, limiteGlobal, quedaOrigem, quadros };
}

/** Cargas do quadro e correntes por fase com os fatores de demanda. */
function demandaPorFase(q: Quadro, U0: number, UL: number) {
  const cargas = q.circuitos.map((c) => {
    const { P, especial } = potenciaCircuito(c, q);
    const fp = Math.min(1, Math.max(0.1, c.fp || 1));
    return { c, P, especial, S: P / fp, Q: Math.sqrt(Math.max(0, (P / fp) ** 2 - P * P)) };
  });
  const fd = (g: string) => (q.fatoresDemanda[g] ?? 100) / 100;
  const fases = { A: { I: 0, kVA: 0 }, B: { I: 0, kVA: 0 }, C: { I: 0, kVA: 0 } };
  for (const x of cargas) {
    const f = cargaNasFases(x.S * fd(x.c.grupo), x.c.esquema, x.c.fase, U0, UL);
    for (const l of ["A", "B", "C"] as const) {
      fases[l].I += f[l].I;
      fases[l].kVA += f[l].kVA;
    }
  }
  const Pdem = cargas.reduce((s, x) => s + x.P * fd(x.c.grupo), 0);
  const Qdem = cargas.reduce((s, x) => s + x.Q * fd(x.c.grupo), 0);
  return { cargas, fd, fases, Pdem, Qdem };
}

function calcularQuedaOrigem(d: DadosQuadro, U0: number, UL: number): ResultadoQuadros["quedaOrigem"] {
  const cfg = d.config;
  const c = cfg.caboOrigem;
  if (cfg.ikModo !== "calculado" || cfg.origemQueda === "ponto-entrega-bt" || !tem(c.comprimento) || !tem(c.secao)) return null;
  const I = { A: 0, B: 0, C: 0 };
  let P = 0;
  let Q = 0;
  for (const q of d.quadros) {
    const dem = demandaPorFase(q, U0, UL);
    for (const l of ["A", "B", "C"] as const) I[l] += dem.fases[l].I;
    P += dem.Pdem;
    Q += dem.Qdem;
  }
  const Ib = Math.max(I.A, I.B, I.C);
  const S = Math.hypot(P, Q);
  const fp = S > 0 ? P / S : 1;
  const rKm = resistenciaA(c.material, c.classe, c.secao, temperaturaServico(c.isolacao));
  const dv = quedaPercentual("3F+N+PE", U0, UL, Ib, c.comprimento, rKm, reatancia(c.config), Math.max(1, c.condutoresPorFase), fp);
  return { Ib, fp, dv };
}

function calcularQuadro(q: Quadro, cfg: ConfigQuadro, origem: ResultadoOrigem, U0: number, UL: number, limiteGlobal: number, dvOrigem: number): ResultadoQuadro {
  // 1. cargas e 2. demanda
  const { cargas, fd, fases } = demandaPorFase(q, U0, UL);
  const gruposUsados = Array.from(new Set(cargas.map((x) => x.c.grupo)));
  const grupos = gruposUsados.map((g) => {
    const Pinst = cargas.filter((x) => x.c.grupo === g).reduce((s, x) => s + x.P, 0);
    return { id: g, nome: nomeGrupo(g), Pinst, fd: fd(g) * 100, Pdem: Pinst * fd(g) };
  });
  const Pinst = cargas.reduce((s, x) => s + x.P, 0);
  const Qinst = cargas.reduce((s, x) => s + x.Q, 0);
  const Pdem = cargas.reduce((s, x) => s + x.P * fd(x.c.grupo), 0);
  const Qdem = cargas.reduce((s, x) => s + x.Q * fd(x.c.grupo), 0);
  const Sdem = Math.hypot(Pdem, Qdem);
  const especial = cargas.reduce((s, x) => s + x.especial, 0);
  const correntes = [fases.A.I, fases.B.I, fases.C.I];
  const maxI = Math.max(...correntes);
  const minI = Math.min(...correntes);
  const desequilibrio = maxI > 0 ? ((maxI - minI) / maxI) * 100 : 0;

  // 3. alimentador (linha GERAL)
  const g = q.geral;
  const esquemaGeral: EsquemaCondutores = g.tipo === "mono" ? "F+N+PE" : g.tipo === "bi" ? "2F+N+PE" : "3F+N+PE";
  const ibGeral = g.tipo === "mono" ? Sdem / U0 : g.tipo === "bi" ? Math.max(fases.A.I, fases.B.I) : maxI;
  const ctxGeral: ContextoFonte = {
    U0,
    UL,
    esquema: cfg.esquema,
    situacao: cfg.situacao,
    RA: cfg.RA,
    ikInicio: origem.ikMax,
    zMax: origem.completo ? origem.zMax : null,
    z1Min: origem.completo ? origem.z1Min : null,
    zLacoPE: origem.completo ? origem.zLacoPE : null,
    zLacoN: origem.completo ? origem.zLacoN : null,
    // 6.2.7.1: o alimentador só tem o limite global, contado desde os terminais
    // do transformador/gerador ou do ponto de entrega.
    dvMontante: dvOrigem,
    limiteTrecho: limiteGlobal,
    limiteGlobal,
    alvoAcumulado: limiteGlobal - LIMITE_TERMINAL,
  };
  const geral = calcularTrecho(
    {
      id: `${q.id}-geral`,
      tag: "GERAL",
      descricao: `Alimentador ${q.nome}`,
      grupo: "",
      esquema: esquemaGeral,
      fase: g.tipo === "mono" ? "A" : g.tipo === "bi" ? "AB" : "ABC",
      reserva: false,
      P: Pdem,
      especial: 0,
      fp: Sdem > 0 ? Pdem / Sdem : 1,
      thd: 0,
      uso: "forca",
      protecao: g.protecao,
      cond: g.cond,
      comprimento: g.comprimento,
      ibImposto: ibGeral,
    },
    ctxGeral,
  );

  // Barramento do quadro: fonte + alimentador.
  let ikBarramento: number | null = null;
  let zMax: Z | null = null;
  let z1Min: Z | null = null;
  let zLacoPE: Z | null = null;
  let zLacoN: Z | null = null;
  if (origem.completo) {
    if (tem(g.comprimento)) {
      const c = g.cond;
      const n = Math.max(1, Math.round(c.condutoresPorFase || 1));
      const th = temperaturaServico(c.isolacao);
      const f20 = zCabo(c, geral.secao, g.comprimento, n, 20);
      const fQ = zCabo(c, geral.secao, g.comprimento, n, th);
      const nQ = zCabo(c, geral.secaoN ?? geral.secao, g.comprimento, n, th);
      const peQ = zCabo(c, geral.secaoPE, g.comprimento, 1, th);
      zMax = soma(origem.zMax, f20);
      z1Min = soma(origem.z1Min, fQ);
      zLacoPE = soma(origem.zLacoPE, fQ, peQ);
      zLacoN = soma(origem.zLacoN, fQ, nQ);
    } else {
      // Sem comprimento do alimentador, o quadro é tomado junto à origem.
      zMax = origem.zMax;
      z1Min = origem.z1Min;
      zLacoPE = origem.zLacoPE;
      zLacoN = origem.zLacoN;
    }
    ikBarramento = (C_MAX * UL) / (Math.sqrt(3) * modulo(zMax)) / 1000;
  }

  // 4. circuitos
  const ctxCirc: ContextoFonte = {
    ...ctxGeral,
    ikInicio: ikBarramento,
    zMax,
    z1Min,
    zLacoPE,
    zLacoN,
    dvMontante: dvOrigem + (geral.dvTrecho ?? 0),
    limiteTrecho: LIMITE_TERMINAL,
    alvoAcumulado: limiteGlobal,
  };
  const circuitos = cargas.map(({ c, P, especial: esp }) =>
    calcularTrecho(
      {
        id: c.id,
        tag: c.tag,
        descricao: c.descricao,
        grupo: c.grupo,
        esquema: c.esquema,
        fase: faseCoerente(c.esquema, c.fase),
        reserva: Boolean(c.reserva),
        P,
        especial: esp,
        fp: c.fp,
        thd: c.thd,
        uso: c.uso,
        protecao: c.protecao,
        cond: c.cond,
        comprimento: c.comprimento,
      },
      ctxCirc,
    ),
  );

  const todos = [geral, ...circuitos];
  const vs = (r: ResultadoCircuito) => Object.values(r.verif);
  const choque = {
    ok: circuitos.filter((r) => r.verif.choque === "ok").length,
    falha: circuitos.filter((r) => r.verif.choque === "falha").length,
    semDados: circuitos.filter((r) => r.verif.choque === "sem-dados").length,
  };
  return {
    id: q.id,
    nome: q.nome,
    potencias: { Pinst, Sinst: Math.hypot(Pinst, Qinst), Qinst, Pdem, Sdem, Qdem, fp: Sdem > 0 ? Pdem / Sdem : 1, especial },
    grupos,
    fases: { ...fases, desequilibrio },
    geral,
    ikBarramento,
    circuitos,
    resumo: {
      n: circuitos.length,
      falhas: todos.filter((r) => vs(r).includes("falha")).length,
      semDados: todos.filter((r) => vs(r).includes("sem-dados")).length,
      choque,
      curto: {
        icu: todos.some((r) => r.verif.icu === "falha") ? "falha" : todos.some((r) => r.verif.icu === "sem-dados") ? "sem-dados" : "ok",
        termica: todos.filter((r) => r.verif.termica === "falha").length,
        magnetica: todos.filter((r) => r.verif.magnetica === "falha").length,
      },
    },
  };
}

/**
 * Balanceamento de fases: do maior circuito para o menor, cada um vai para a
 * fase (ou par de fases) que terminar com a menor carga. Trifásicos ficam
 * onde estão. Devolve o novo mapa id → fase.
 */
export function balancearFases(q: Quadro, tensao: ClasseTensao): Record<string, Fase> {
  const { U0, UL } = tensoes(tensao);
  const carga = { A: 0, B: 0, C: 0 };
  const lista = q.circuitos
    .map((c) => ({ c, S: potenciaCircuito(c, q).P / Math.min(1, Math.max(0.1, c.fp || 1)) }))
    .sort((a, b) => b.S - a.S);
  const out: Record<string, Fase> = {};
  for (const { c, S } of lista) {
    const polos = polosDoEsquema(c.esquema);
    let escolha: Fase;
    if (polos === 3) escolha = "ABC";
    else {
      const opcoes = polos === 2 ? FASES_BI : FASES_MONO;
      escolha = opcoes[0];
      let melhor = Infinity;
      for (const f of opcoes) {
        const dist = cargaNasFases(S, c.esquema, f, U0, UL);
        const pico = Math.max(carga.A + dist.A.I, carga.B + dist.B.I, carga.C + dist.C.I);
        if (pico < melhor - 1e-9) {
          melhor = pico;
          escolha = f;
        }
      }
    }
    const dist = cargaNasFases(S, c.esquema, escolha, U0, UL);
    carga.A += dist.A.I;
    carga.B += dist.B.I;
    carga.C += dist.C.I;
    out[c.id] = escolha;
  }
  return out;
}

export const ROTULO_VERIF: Record<keyof ResultadoCircuito["verif"], string> = {
  sobrecarga: "Sobrecarga",
  queda: "Queda de tensão",
  icu: "Capacidade de interrupção",
  termica: "Suportabilidade térmica",
  magnetica: "Atuação magnética",
  choque: "Proteção contra choques",
};
