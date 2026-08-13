import { hspMedia } from "./municipios";

/**
 * Dimensionamento do sistema — codifica as fórmulas da planilha (aba "Inserir Dados").
 */

export type TipoConexao = "mono" | "bi" | "tri";

/** Disponibilidade (custo de disponibilidade em kWh) por tipo de conexão. */
export const DISPONIBILIDADE: Record<TipoConexao, number> = { mono: 30, bi: 50, tri: 100 };

export interface SizingInput {
  consumo: number[]; // 12 meses (kWh)
  tipoConexao: TipoConexao;
  hsp: number[]; // 12 meses do município (kWh/m²·dia)
  potenciaPainel: number; // W
  eficiencia: number; // ex.: 0.75
  overloadDesejado: number; // ex.: 0.15
}

export interface SizingResult {
  consumoMedio: number;
  hspMedia: number;
  disponibilidade: number;
  kwpNecessaria: number;
  nPlacasSugerido: number;
  inversorSugerido: number; // kW
}

export function media(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + Number(v || 0), 0) / arr.length : 0;
}

export function dimensionar(i: SizingInput): SizingResult {
  const consumoMedio = media(i.consumo);
  const hsp = hspMedia(i.hsp);
  const disponibilidade = DISPONIBILIDADE[i.tipoConexao];

  // kWp = ((consumoMédio − disponibilidade)/30 / HSP / eficiência) × 1,15
  //
  // O piso em zero não é cosmético. Consumo médio abaixo da disponibilidade dá
  // resultado NEGATIVO, e isso acontece o tempo todo em uso normal: enquanto os
  // 12 meses estão sendo preenchidos, a média parcial é baixa e a tela chegava a
  // mostrar "necessidade calculada: −0,98 kWp" e "−1 placas". Divisor zerado
  // (município sem HSP, eficiência 0) daria Infinity/NaN pelo mesmo caminho.
  // Quem avisa que o consumo não justifica o sistema é `avaliarSistema`.
  const divisor = 30 * hsp * i.eficiencia;
  const kwpNecessaria = divisor > 0 ? Math.max(0, ((consumoMedio - disponibilidade) / divisor) * 1.15) : 0;

  const nPlacasSugerido = Math.ceil((kwpNecessaria * 1000) / i.potenciaPainel);
  const inversorSugerido = kwpNecessaria / (1 + i.overloadDesejado);

  return {
    consumoMedio,
    hspMedia: hsp,
    disponibilidade,
    kwpNecessaria,
    nPlacasSugerido,
    inversorSugerido,
  };
}

/** Potência total (kWp) a partir do nº de painéis escolhido. */
export function kwpTotal(nPaineis: number, potenciaPainel: number): number {
  return (nPaineis * potenciaPainel) / 1000;
}

/**
 * Potência CA instalada (kW) — a de UMA unidade vezes quantas forem.
 *
 * É o número que a distribuidora enxerga no parecer de acesso, e o denominador
 * do overload. Existe porque `potenciaInversor` é sempre a potência de um
 * inversor: a lista de materiais sempre leu assim ("2 × INVERSOR 75 kW"), mas o
 * overload e as travas normativas liam o mesmo campo como se fosse o total.
 * Dois inversores de 75 kW davam 87% de sobrecarga no lugar de −7%.
 */
export function potenciaCaTotal(potenciaUnitariaKw: number, quantidade: number): number {
  return Math.max(0, potenciaUnitariaKw) * Math.max(1, Math.floor(quantidade || 1));
}

/**
 * Overload real = kWpTotal / potência CA − 1.
 *
 * O segundo argumento é a potência CA TOTAL do conjunto, não a de uma unidade
 * — use `potenciaCaTotal` para chegar nela quando houver mais de um inversor.
 */
export function overloadReal(kwp: number, potenciaCaTotalKw: number): number {
  return potenciaCaTotalKw > 0 ? kwp / potenciaCaTotalKw - 1 : 0;
}
