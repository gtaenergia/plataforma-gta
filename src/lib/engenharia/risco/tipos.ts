/**
 * Entrada da análise de risco (NBR 5419-2:2026), do jeito que o assistente a
 * grava no projeto. Números ainda não informados ficam `null` — é isso que a
 * barra de progresso e a lista de pendências enxergam.
 */

export type TipoLinha = "energia" | "sinal";

export interface EstruturaRisco {
  cidade: { nome: string; uf: string } | null;
  NG: number | null;
  L: number | null;
  W: number | null;
  H: number | null;
  CD: string;
  PB: string;
  PEB: string;
  rS: string;
  /** true = sem blindagem espacial em malha (KS1 = 1). */
  semBlindagemKs1: boolean;
  KS1: number | null;
  /** Total de pessoas na estrutura (nt). */
  nt: number | null;
}

export interface EstruturaAdjacente {
  L: number | null;
  W: number | null;
  H: number | null;
  CDJ: string;
}

export interface LinhaRisco {
  id: string;
  nome: string;
  tipo: TipoLinha;
  LL: number | null;
  CE: string;
  CT: string;
  CI: string;
  blindagem: string;
  clc: string;
  UW: number;
  /** Condutores ativos da linha — dividem a corrente de impulso no dimensionamento do DPS. */
  condutores: number;
  adjacente: EstruturaAdjacente | null;
}

export interface FiacaoInterna {
  KS3: string;
  /** Comprimento do circuito interno, em m. KS3 é dado para 100 m e reduz na proporção (nota e da Tabela B.5). */
  comprimento: number | null;
  PSPD: string;
}

export interface ZonaRisco {
  id: string;
  nome: string;
  nz: number | null;
  tz: number | null;
  perdas: { L1: boolean; L3: boolean; L4: boolean; F: boolean };
  rt: string;
  PTA: string;
  PTU: string;
  rf: string;
  rp: string;
  hz: string;
  semBlindagemKs2: boolean;
  KS2: number | null;
  energia: FiacaoInterna;
  sinal: FiacaoInterna;
  L1: { LT: string; LF: string; LO: string };
  L3: { LF: string; cz: number | null };
  /** Valores em milhões de R$. */
  L4: { LT: string; LF: string; LO: string; ca: number | null; cb: number | null; cc: number | null; cs: number | null };
  FT: string;
  /** Equipamentos na ZPR 0A (expostos à descarga direta): só então FB entra na soma. */
  equipamentosExpostos: boolean;
}

export interface EntradaRisco {
  estrutura: EstruturaRisco;
  linhas: LinhaRisco[];
  zonas: ZonaRisco[];
}

/** Fotografia de uma análise: a entrada exatamente como estava e quando foi feita. */
export interface Fotografia {
  em: string;
  entrada: EntradaRisco;
}

export interface DadosRisco extends EntradaRisco {
  /** "Análise preliminar": a estrutura sem as medidas de proteção. */
  preliminar: Fotografia | null;
  /** "Analisar": a análise com as medidas adotadas. */
  analise: Fotografia | null;
}

let seq = 0;
export function novoId(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function novaLinha(tipo: TipoLinha = "energia", n = 1): LinhaRisco {
  return {
    id: novoId("linha"),
    nome: tipo === "energia" ? `Linha de energia ${n}` : `Linha de sinal ${n}`,
    tipo,
    LL: 1000,
    CE: "rural",
    CT: "bt-sinal",
    CI: "aereo",
    blindagem: "nao-blindada",
    clc: "aerea-nao-blindada",
    UW: tipo === "energia" ? 2.5 : 1.5,
    condutores: tipo === "energia" ? 4 : 2,
    adjacente: null,
  };
}

export function novaZona(n = 1): ZonaRisco {
  return {
    id: novoId("zona"),
    nome: `Zona ${n}`,
    nz: null,
    tz: 8760,
    perdas: { L1: true, L3: false, L4: false, F: n === 1 },
    rt: "terra-concreto",
    PTA: "nenhuma",
    PTU: "nenhuma",
    rf: "incendio-normal",
    rp: "nenhuma",
    hz: "sem",
    semBlindagemKs2: true,
    KS2: null,
    energia: { KS3: "sem-preocupacao", comprimento: null, PSPD: "sem" },
    sinal: { KS3: "sem-preocupacao", comprimento: null, PSPD: "sem" },
    L1: { LT: "todos", LF: "outros", LO: "nao-aplicavel" },
    L3: { LF: "museus", cz: null },
    L4: { LT: "sem-animais", LF: "outros", LO: "outros", ca: null, cb: null, cc: null, cs: null },
    FT: "nao-critico",
    equipamentosExpostos: false,
  };
}

export function riscoVazio(NG: number | null = null): DadosRisco {
  return {
    estrutura: {
      cidade: null,
      NG,
      L: null,
      W: null,
      H: null,
      CD: "isolada",
      PB: "sem-spda",
      PEB: "sem",
      rS: "robusta",
      semBlindagemKs1: true,
      KS1: null,
      nt: null,
    },
    linhas: [novaLinha("energia", 1)],
    zonas: [novaZona(1)],
    preliminar: null,
    analise: null,
  };
}

/** Só a entrada (sem as fotografias) — o que o motor consome. */
export function soEntrada(d: EntradaRisco): EntradaRisco {
  return { estrutura: d.estrutura, linhas: d.linhas, zonas: d.zonas };
}
