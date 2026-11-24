/**
 * Entrada do quadro de cargas (NBR 5410), como o assistente a grava no
 * projeto. Valores calculados (corrente, seção automática, disjuntor
 * automático) NÃO ficam aqui: saem do motor a cada render, para que a tela e o
 * memorial nunca discordem.
 */

import type { ConfigCabos, Isolacao, Material } from "./tabelas";

export type ClasseTensao = "127/220" | "220/380";
export type EsquemaAterramento = "TN-S" | "TT";
export type OrigemQueda = "trafo-proprio" | "trafo-distribuidora" | "ponto-entrega-bt" | "gerador";
export type EsquemaCondutores = "F+N+PE" | "2F+PE" | "2F+N+PE" | "3F+PE" | "3F+N+PE";
export type Fase = "A" | "B" | "C" | "AB" | "BC" | "CA" | "ABC";
export type Curva = "B" | "C" | "D";

export interface CaboTrecho {
  material: Material;
  isolacao: Isolacao;
  classe: 2 | 5;
  config: ConfigCabos;
  comprimento: number | null;
  secao: number | null;
  condutoresPorFase: number;
}

export interface ConfigQuadro {
  tensao: ClasseTensao;
  esquema: EsquemaAterramento;
  situacao: 1 | 2;
  /** Resistência de aterramento das massas RA (Ω) — esquema TT. */
  RA: number | null;
  ikModo: "manual" | "calculado";
  /** Ik máximo presumido na origem (kA). */
  ikManual: number | null;
  /** cos φ de curto-circuito na origem, quando o Ik é informado. */
  cosCc: number;
  trafo: { kva: number | null; z: number | null; pk: number | null };
  caboOrigem: CaboTrecho;
  origemQueda: OrigemQueda;
}

export interface Protecao {
  inModo: "auto" | "manual";
  In: number | null;
  curva: Curva;
  icuModo: "auto" | "manual";
  icu: number | null;
  dr: boolean;
  drSens: number;
  /** I²t do catálogo do fabricante (A²s); vazio = estimativa. */
  i2tManual: number | null;
}

export interface Condutores {
  material: Material;
  isolacao: Isolacao;
  tensaoIsolacao: "450/750 V" | "0,6/1 kV";
  classe: 2 | 5;
  metodo: string;
  config: ConfigCabos;
  condutoresPorFase: number;
  temperatura: number;
  agrupados: number;
  k1Manual: number | null;
  k2Manual: number | null;
  secaoModo: "auto" | "manual";
  secao: number | null;
  neutroReduzido: boolean;
}

export interface Circuito {
  id: string;
  tag: string;
  descricao: string;
  grupo: string;
  uso: "iluminacao" | "forca";
  quantidades: Record<string, number>;
  cargaEspecial: number | null;
  esquema: EsquemaCondutores;
  fase: Fase;
  fp: number;
  thd: number;
  protecao: Protecao;
  cond: Condutores;
  comprimento: number | null;
  /** Reserva: aparece no quadro e no diagrama, mas sem carga. */
  reserva?: boolean;
}

export interface TipoCarga {
  id: string;
  nome: string;
  potencia: number;
}

export interface Geral {
  tipo: "mono" | "bi" | "tri";
  protecao: Protecao;
  cond: Condutores;
  comprimento: number | null;
  /** Fator de potência mínimo de referência — a demanda usa o fp de cada circuito. */
}

export interface Quadro {
  id: string;
  nome: string;
  descricao: string;
  geral: Geral;
  fatoresDemanda: Record<string, number>;
  tiposCarga: TipoCarga[];
  circuitos: Circuito[];
}

export interface DadosQuadro {
  config: ConfigQuadro;
  quadros: Quadro[];
  ativo: string | null;
}

let seq = 0;
export function novoIdQ(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function protecaoPadrao(): Protecao {
  return { inModo: "auto", In: null, curva: "C", icuModo: "auto", icu: null, dr: false, drSens: 30, i2tManual: null };
}

export function condutoresPadrao(): Condutores {
  return {
    material: "Cu",
    isolacao: "PVC",
    tensaoIsolacao: "450/750 V",
    classe: 5,
    metodo: "7",
    config: "unipolar-trifolio",
    condutoresPorFase: 1,
    temperatura: 30,
    agrupados: 1,
    k1Manual: null,
    k2Manual: null,
    secaoModo: "auto",
    secao: null,
    neutroReduzido: false,
  };
}

export function novoCircuito(n: number, tipos: TipoCarga[] = []): Circuito {
  return {
    id: novoIdQ("circ"),
    tag: `C${n}`,
    descricao: "",
    grupo: "a",
    uso: "forca",
    quantidades: Object.fromEntries(tipos.map((t) => [t.id, 0])),
    cargaEspecial: null,
    esquema: "F+N+PE",
    fase: "A",
    fp: 0.92,
    thd: 0,
    protecao: protecaoPadrao(),
    cond: condutoresPadrao(),
    comprimento: null,
  };
}

export function novoQuadro(n: number): Quadro {
  const tiposCarga: TipoCarga[] = [
    { id: "tug", nome: "Tomadas (TUG)", potencia: 100 },
    { id: "ilum", nome: "Iluminação", potencia: 60 },
  ];
  return {
    id: novoIdQ("qd"),
    nome: `QD-${String(n).padStart(2, "0")}`,
    descricao: "",
    geral: {
      tipo: "tri",
      protecao: { ...protecaoPadrao(), curva: "C" },
      cond: { ...condutoresPadrao(), tensaoIsolacao: "0,6/1 kV", isolacao: "EPR", metodo: "61A", config: "unipolar-trifolio" },
      comprimento: null,
    },
    fatoresDemanda: {},
    tiposCarga,
    circuitos: [novoCircuito(1, tiposCarga)],
  };
}

export function quadroVazio(): DadosQuadro {
  const q = novoQuadro(1);
  return {
    config: {
      tensao: "127/220",
      esquema: "TN-S",
      situacao: 1,
      RA: null,
      ikModo: "manual",
      ikManual: null,
      cosCc: 0.3,
      trafo: { kva: null, z: null, pk: null },
      caboOrigem: { material: "Cu", isolacao: "EPR", classe: 5, config: "unipolar-trifolio", comprimento: null, secao: null, condutoresPorFase: 1 },
      origemQueda: "ponto-entrega-bt",
    },
    quadros: [q],
    ativo: q.id,
  };
}

export const ORIGENS_QUEDA: { id: OrigemQueda; rotulo: string; limite: number; ref: string }[] = [
  { id: "trafo-proprio", rotulo: "Transformador MT/BT próprio (da unidade consumidora)", limite: 7, ref: "6.2.7.1 a)" },
  { id: "trafo-distribuidora", rotulo: "Transformador da distribuidora, com ponto de entrega nele", limite: 7, ref: "6.2.7.1 b)" },
  { id: "ponto-entrega-bt", rotulo: "Ponto de entrega em tensão secundária de distribuição", limite: 5, ref: "6.2.7.1 c)" },
  { id: "gerador", rotulo: "Grupo gerador próprio", limite: 7, ref: "6.2.7.1 d)" },
];

export const LIMITE_TERMINAL = 4;
