import type { Ymd } from "@/lib/capacidade/datas";

/**
 * Distribuição de intervalos em faixas dentro de uma semana do calendário.
 *
 * Puro e sem React de propósito: é a única parte do calendário com risco
 * algorítmico — recorte na borda da semana, colisão entre intervalos — e a
 * única que dá para provar sem abrir o navegador. Um intervalo que atravessa a
 * virada da semana só aparece na tela em certas combinações de data, então
 * conferir "no olho" não cobre o caso.
 */

/** Qualquer coisa que ocupe um intervalo fechado de dias. */
export interface Intervalo {
  inicio: Ymd;
  fim: Ymd;
}

export interface Segmento<T extends Intervalo> {
  item: T;
  /** Coluna (0–6) onde o pedaço começa nesta semana. */
  col: number;
  /** Quantos dias o pedaço ocupa nesta semana (≥ 1). */
  span: number;
  /** O começo REAL do intervalo cai nesta semana (senão, vem de antes). */
  abre: boolean;
  /** O fim REAL do intervalo cai nesta semana (senão, segue adiante). */
  fecha: boolean;
  /** Linha dentro da semana, contando de 0. */
  faixa: number;
}

/**
 * Recorta os intervalos que tocam a semana e os empilha em faixas, de modo que
 * dois intervalos que dividem um dia nunca fiquem na mesma linha.
 *
 * `desempate` decide a ordem entre intervalos que começam e terminam junto —
 * sem ele a ordem viria do array de entrada, e a mesma semana poderia ser
 * desenhada diferente a cada carregamento.
 */
export function segmentarSemana<T extends Intervalo>(
  itens: T[],
  semana: Ymd[],
  desempate: (a: T, b: T) => number = () => 0,
): Segmento<T>[] {
  const [d0] = semana;
  const d6 = semana[semana.length - 1];

  const naSemana = itens
    .filter((i) => i.inicio <= d6 && i.fim >= d0)
    // Os que começam antes e duram mais primeiro: assim quem atravessa a semana
    // fica nas faixas de cima e não é partido pelos curtos.
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || b.fim.localeCompare(a.fim) || desempate(a, b));

  /** Por faixa, a primeira coluna ainda livre. */
  const livreEm: number[] = [];

  return naSemana.map((item) => {
    const ini = item.inicio < d0 ? d0 : item.inicio;
    const fim = item.fim > d6 ? d6 : item.fim;
    const col = semana.indexOf(ini);
    const span = semana.indexOf(fim) - col + 1;

    let faixa = livreEm.findIndex((c) => c <= col);
    if (faixa === -1) {
      faixa = livreEm.length;
      livreEm.push(0);
    }
    livreEm[faixa] = col + span;

    return { item, col, span, faixa, abre: item.inicio >= d0, fecha: item.fim <= d6 };
  });
}

/**
 * Quantos intervalos ficaram escondidos em cada dia da semana, dado o limite de
 * faixas visíveis. É por DIA, e não por semana, porque é assim que a pessoa lê
 * o calendário: "neste dia há mais coisa do que cabe".
 */
export function excedentePorDia<T extends Intervalo>(segmentos: Segmento<T>[], maxFaixas: number): number[] {
  const conta = Array<number>(7).fill(0);
  for (const s of segmentos) {
    if (s.faixa < maxFaixas) continue;
    for (let i = s.col; i < s.col + s.span; i++) conta[i]++;
  }
  return conta;
}
