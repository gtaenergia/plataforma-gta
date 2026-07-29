/**
 * Dimensionamento com MICROINVERSORES.
 *
 * O paradigma é diferente do inversor string e por isso vive num módulo à
 * parte: no string existe UM inversor central em kW, escolhido pelo instalador;
 * no micro a potência é por módulo (W), e a QUANTIDADE é derivada do nº de
 * painéis — não se digita. O que se escolhe é o modelo (potência CA + quantos
 * módulos ele atende).
 *
 * Catálogo genérico de propósito (sem marca), igual à lista de materiais: cobre
 * as faixas que de fato existem no mercado (Hoymiles, Deye, APsystems...) sem
 * travar a proposta num fabricante — a GTA cota o kit depois.
 *
 * Módulo leve e sem dependências: é importado também no cliente (configurador).
 */

/** Módulos atendidos por um microinversor (1-em-1, 2-em-1, 4-em-1). */
export type ModulosPorMicro = 1 | 2 | 4;

export interface Microinversor {
  /** Identificador estável usado no formulário (`${potenciaW}-${modulos}`). */
  id: string;
  /** Potência CA de saída (W). */
  potenciaW: number;
  modulos: ModulosPorMicro;
}

/**
 * Potência máxima por ramal (tronco) CA. Os microinversores são ligados em
 * cascata num cabo tronco protegido por um disjuntor, e a soma do ramal não
 * pode estourar esse limite.
 *
 * Base: ramal de 20 A em 220 V, aplicando os 80% que a NBR 5410 exige para
 * carga contínua (geração roda horas seguidas) → 20 × 0,8 × 220 ≈ 3520 W.
 * É uma premissa CONSERVADORA: troncos de 32 A comportam mais micros por
 * ramal. Como todo o resto da lista de materiais, serve de estimativa e o
 * projeto executivo ajusta.
 */
export const POTENCIA_MAX_POR_RAMAL_W = 3500;

/** Catálogo comercial genérico (potência CA × módulos atendidos). */
export const MICROINVERSORES_COMERCIAIS: Microinversor[] = [
  { id: "300-1", potenciaW: 300, modulos: 1 },
  { id: "400-1", potenciaW: 400, modulos: 1 },
  { id: "500-1", potenciaW: 500, modulos: 1 },
  { id: "600-1", potenciaW: 600, modulos: 1 },
  { id: "600-2", potenciaW: 600, modulos: 2 },
  { id: "700-2", potenciaW: 700, modulos: 2 },
  { id: "800-2", potenciaW: 800, modulos: 2 },
  { id: "1000-2", potenciaW: 1000, modulos: 2 },
  { id: "1200-2", potenciaW: 1200, modulos: 2 },
  { id: "1200-4", potenciaW: 1200, modulos: 4 },
  { id: "1600-4", potenciaW: 1600, modulos: 4 },
  { id: "2000-4", potenciaW: 2000, modulos: 4 },
  { id: "2250-4", potenciaW: 2250, modulos: 4 },
];

export function getMicroinversor(id: string): Microinversor | undefined {
  return MICROINVERSORES_COMERCIAIS.find((m) => m.id === id);
}

/** Rótulo de exibição: "800 W · 2 módulos". */
export function microLabel(m: Microinversor): string {
  return `${m.potenciaW} W · ${m.modulos} ${m.modulos === 1 ? "módulo" : "módulos"}`;
}

/**
 * Overload (sobredimensionamento CC/CA) de UM microinversor:
 * (módulos × Wp do painel) / potência CA − 1.
 * Em micro é normal e desejável ser mais alto que no string (o micro é
 * dimensionado para a geração real do módulo, não para o pico de placa).
 */
export function overloadMicro(m: Microinversor, potenciaPainelW: number): number {
  return m.potenciaW > 0 ? (m.modulos * potenciaPainelW) / m.potenciaW - 1 : 0;
}

/**
 * Escolhe o microinversor com overload mais próximo do desejado. Descarta os
 * subdimensionados a ponto de estrangular o módulo (overload acima do teto) e,
 * em empate, prefere o que atende MAIS módulos — menos unidades, kit mais
 * barato e menos pontos de falha.
 */
export function sugerirMicroinversor(potenciaPainelW: number, overloadDesejado: number): Microinversor {
  const TETO_OVERLOAD = 0.6; // acima disso o micro vira gargalo na geração
  const candidatos = MICROINVERSORES_COMERCIAIS.filter(
    (m) => overloadMicro(m, potenciaPainelW) <= TETO_OVERLOAD,
  );
  const lista = candidatos.length > 0 ? candidatos : MICROINVERSORES_COMERCIAIS;

  return lista.reduce((melhor, atual) => {
    const dAtual = Math.abs(overloadMicro(atual, potenciaPainelW) - overloadDesejado);
    const dMelhor = Math.abs(overloadMicro(melhor, potenciaPainelW) - overloadDesejado);
    if (Math.abs(dAtual - dMelhor) < 1e-9) return atual.modulos > melhor.modulos ? atual : melhor;
    return dAtual < dMelhor ? atual : melhor;
  }, lista[0]);
}

export interface MicroSizingInput {
  nPaineis: number;
  potenciaPainelW: number;
  micro: Microinversor;
}

export interface MicroSizingResult {
  micro: Microinversor;
  /** Quantidade de microinversores — DERIVADA do nº de painéis. */
  qtdMicros: number;
  /** Potência CA instalada total (kW) = qtd × potência do micro. */
  potenciaCaTotalKw: number;
  /** Overload de cada microinversor cheio. */
  overload: number;
  /** Módulos ligados no último micro (< modulos = micro parcialmente ocupado). */
  modulosNoUltimo: number;
  /** true quando o último micro fica com folga (sobra de entrada). */
  ultimoParcial: boolean;
  /** Ramais (circuitos de tronco CA) necessários pelo limite de corrente. */
  ramais: number;
  /** Micros por ramal (o último ramal pode ter menos). */
  microsPorRamal: number;
}

/** Dimensiona o conjunto de microinversores para um nº de painéis. */
export function dimensionarMicro(i: MicroSizingInput): MicroSizingResult {
  const nPaineis = Math.max(1, Math.floor(i.nPaineis));
  const { micro } = i;

  const qtdMicros = Math.ceil(nPaineis / micro.modulos);
  const potenciaCaTotalKw = (qtdMicros * micro.potenciaW) / 1000;

  const resto = nPaineis % micro.modulos;
  const modulosNoUltimo = resto === 0 ? micro.modulos : resto;

  // Quantos micros cabem num ramal sem estourar o disjuntor do tronco.
  const microsPorRamal = Math.max(1, Math.floor(POTENCIA_MAX_POR_RAMAL_W / micro.potenciaW));
  const ramais = Math.ceil(qtdMicros / microsPorRamal);

  return {
    micro,
    qtdMicros,
    potenciaCaTotalKw,
    overload: overloadMicro(micro, i.potenciaPainelW),
    modulosNoUltimo,
    ultimoParcial: modulosNoUltimo < micro.modulos,
    ramais,
    microsPorRamal,
  };
}
