import type { TimeEntry } from "./types";

/**
 * Reparte um lançamento entre os dias que ele ATRAVESSA.
 *
 * O Tracker guarda dois instantes — `inicio` e `fim` — e nada mais. Quem lê o
 * dado precisa decidir a que dia aquelas horas pertencem, e enquanto essa
 * decisão foi "o dia do início" um plantão das 22:00 às 02:00 aparecia inteiro
 * na véspera: o dia em que metade do trabalho aconteceu ficava zerado, e o
 * anterior somava quatro horas que não couberam nele.
 *
 * A repartição é em hora LOCAL, porque é o calendário de parede que a pessoa
 * lê. É também por isso que o corte usa `new Date(ano, mês, dia + 1)` em vez de
 * somar 24 h em milissegundos: num dia de horário de verão o dia tem 23 ou 25
 * horas, e só a primeira forma acompanha isso sozinha.
 */

/** "2026-08-01" no fuso LOCAL (não UTC — evita o dia "voltar" no Brasil). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** O pedaço de um lançamento que cabe dentro de UM dia local. */
export interface Fatia {
  /** Dia local a que estes minutos pertencem, em `ymd`. */
  dia: string;
  /** Recorte real, já cortado na meia-noite quando é o caso. */
  inicio: Date;
  fim: Date;
  /** Minutos DESTA fatia — não a duração do lançamento inteiro. */
  min: number;
  /** Minutos desde a meia-noite local: onde a fatia começa na grade do dia. */
  inicioMin: number;
  /** Idem para o fim; vale 1440 quando a fatia vai até a virada. */
  fimMin: number;
  /** O lançamento tem mais de uma fatia? Repetido em todas, para a tela avisar. */
  atravessa: boolean;
}

/**
 * As fatias de um lançamento, da primeira para a última. Sempre devolve ao
 * menos uma — um lançamento de duração zero ainda pertence ao seu dia.
 *
 * `agora` fecha o cronômetro em andamento, que não tem `fim`.
 */
export function fatiarPorDia(
  e: Pick<TimeEntry, "inicio" | "fim">,
  agora: Date = new Date(),
): Fatia[] {
  const ini = new Date(e.inicio);
  if (Number.isNaN(ini.getTime())) return [];

  const bruto = e.fim ? new Date(e.fim) : agora;
  // Relógio do cliente atrasado não pode virar duração negativa — mesma
  // defesa que `duracaoMin` faz com o Math.max.
  const fim = Number.isNaN(bruto.getTime()) || bruto < ini ? ini : bruto;

  const fatias: Fatia[] = [];
  let cursor = ini;
  let atribuidos = 0;
  do {
    const virada = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const corte = virada < fim ? virada : fim;
    const chegouNaVirada = corte.getTime() === virada.getTime();
    /**
     * Os minutos são medidos SEMPRE a partir de `ini`, e a fatia leva a
     * diferença para o que já foi atribuído.
     *
     * Arredondar cada fatia por si dava outro número: `round(a) + round(b)`
     * não é `round(a + b)`, e o cronômetro grava segundos em toda entrada. Um
     * plantão perdia (ou ganhava) um minuto por virada, e a mesma tela exibia
     * as fatias somando 3h58min ao lado da frase "3h59min no total". Medindo
     * do início, a soma telescopa exatamente para `duracaoMin`.
     */
    const ateAqui = Math.round((corte.getTime() - ini.getTime()) / 60000);
    fatias.push({
      dia: ymdLocal(cursor),
      inicio: cursor,
      fim: corte,
      min: ateAqui - atribuidos,
      inicioMin: cursor.getHours() * 60 + cursor.getMinutes(),
      // A virada é 1440 por definição: `getHours()` ali já devolveria 0, do
      // dia seguinte, e a fatia desabaria para o topo da grade.
      fimMin: chegouNaVirada ? 1440 : corte.getHours() * 60 + corte.getMinutes(),
      atravessa: false,
    });
    atribuidos = ateAqui;
    cursor = corte;
  } while (cursor < fim);

  if (fatias.length === 1) return fatias;
  return fatias.map((f) => ({ ...f, atravessa: true }));
}

/** O lançamento ocupa mais de um dia local? */
export function atravessaDia(
  e: Pick<TimeEntry, "inicio" | "fim">,
  agora: Date = new Date(),
): boolean {
  return fatiarPorDia(e, agora).length > 1;
}

/**
 * Quantos minutos deste lançamento caem dentro de [desde, ate).
 *
 * É o que faz o total de um período parar de contar horas do período vizinho:
 * um turno que começa em 31/08 e termina em 01/09 entrega 2 h para agosto e 2 h
 * para setembro, em vez de 4 h para agosto e nada para setembro.
 */
export function minutosNoIntervalo(
  e: Pick<TimeEntry, "inicio" | "fim">,
  desde: Date,
  ate: Date,
  agora: Date = new Date(),
): number {
  const ini = new Date(e.inicio);
  if (Number.isNaN(ini.getTime())) return 0;
  const bruto = e.fim ? new Date(e.fim) : agora;
  const fim = Number.isNaN(bruto.getTime()) || bruto < ini ? ini : bruto;
  const de = Math.max(ini.getTime(), desde.getTime());
  const ateMs = Math.min(fim.getTime(), ate.getTime());
  return Math.max(0, Math.round((ateMs - de) / 60000));
}

/**
 * O lançamento SOBREPÕE a janela [desde, ate)? É o predicado da consulta.
 *
 * A versão antiga perguntava se o `inicio` caía na janela, e com isso o turno
 * da madrugada sumia por completo do dia em que a madrugada aconteceu: não era
 * um total menor, era a linha inteira ausente. Um lançamento em andamento não
 * tem `fim` e por isso alcança o presente — basta ter começado antes de `ate`.
 *
 * Bounds e campos são ISO UTC no mesmo formato, então a comparação de strings
 * ordena igual à de instantes (é o que o Postgres faz com timestamptz).
 */
export function sobrepoe(
  e: Pick<TimeEntry, "inicio" | "fim">,
  desde: string,
  ate: string,
): boolean {
  return e.inicio < ate && (!e.fim || e.fim > desde);
}
