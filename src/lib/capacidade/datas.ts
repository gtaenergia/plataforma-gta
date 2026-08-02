/**
 * Aritmética de dias úteis para o cálculo de capacidade.
 *
 * Regras que valem para o arquivo inteiro:
 *
 * 1. A unidade é a string `yyyy-mm-dd` ("Ymd"), nunca um `Date`. Data com hora
 *    embutida atravessa fuso e some um dia — o Tracker já pagou esse pedágio.
 * 2. Todo `Date` intermediário nasce ao MEIO-DIA local. Às 00:00, um horário de
 *    verão que atrase o relógio joga o dia para o anterior e `.getDay()` passa a
 *    responder o dia da semana errado.
 * 3. Nenhuma função aqui lê o relógio. Quem precisa de "hoje" recebe de fora —
 *    é o que torna o motor testável com data fixa.
 */

/** Data no formato `yyyy-mm-dd`. */
export type Ymd = string;

/** Quantos dias o motor anda antes de desistir (ver `truncada` em motor.ts). */
export const HORIZONTE_DIAS = 365;

export function ymd(d: Date): Ymd {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** `Date` ao meio-dia local — ver regra 2 no topo do arquivo. */
export function paraData(s: Ymd): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function ehYmd(s: unknown): s is Ymd {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function somarDias(s: Ymd, n: number): Ymd {
  const d = paraData(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** 0=domingo … 6=sábado. */
export function diaDaSemana(s: Ymd): number {
  return paraData(s).getDay();
}

/** Diferença em dias corridos (b − a). */
export function diasEntre(a: Ymd, b: Ymd): number {
  return Math.round((paraData(b).getTime() - paraData(a).getTime()) / 86_400_000);
}

export interface CalendarioTrabalho {
  /** Dias da semana trabalhados: 0=dom … 6=sáb. */
  diasUteis: number[];
  /** Feriados e pontos facultativos, em Ymd. */
  feriados: readonly Ymd[];
}

export function ehDiaUtil(dia: Ymd, cal: CalendarioTrabalho): boolean {
  if (!cal.diasUteis.includes(diaDaSemana(dia))) return false;
  return !cal.feriados.includes(dia);
}

/**
 * Primeiro dia útil a partir de `dia` (inclusive).
 *
 * Devolve `null` quando não existe nenhum dentro do horizonte — caso de
 * `diasUteis: []`, que é aceitável na configuração (alguém que não executa
 * tarefas). Sem esse retorno, todo laço que procura "o próximo dia útil"
 * rodaria para sempre, e o lugar onde isso acontece é dentro de um render.
 */
export function proximoDiaUtil(dia: Ymd, cal: CalendarioTrabalho): Ymd | null {
  if (cal.diasUteis.length === 0) return null;
  let atual = dia;
  for (let i = 0; i <= HORIZONTE_DIAS; i++) {
    if (ehDiaUtil(atual, cal)) return atual;
    atual = somarDias(atual, 1);
  }
  return null;
}

/** Todos os dias úteis de `de` até `ate`, inclusive nas duas pontas. */
export function diasUteisEntre(de: Ymd, ate: Ymd, cal: CalendarioTrabalho): Ymd[] {
  const total = diasEntre(de, ate);
  if (total < 0 || cal.diasUteis.length === 0) return [];
  const r: Ymd[] = [];
  for (let i = 0; i <= Math.min(total, HORIZONTE_DIAS); i++) {
    const dia = somarDias(de, i);
    if (ehDiaUtil(dia, cal)) r.push(dia);
  }
  return r;
}

/**
 * As janelas de ocupação são ROLANTES (a partir de hoje), não a sobra da
 * semana ou do mês do calendário.
 *
 * A versão por calendário parecia mais natural e degenera na prática: num
 * domingo, "o que resta desta semana" são zero dias úteis, a capacidade é zero
 * e o painel inteiro fica em branco. Na sexta à tarde, qualquer tarefa aparece
 * como estouro. A janela rolante sempre tem dia útil dentro e responde à
 * pergunta que interessa — "o que está em aberto cabe no próximo período?".
 */
export const DIAS_JANELA_CURTA = 7;
export const DIAS_JANELA_LONGA = 30;

/** Fim da janela curta ("semana"): hoje + 6 dias, contando hoje. */
export function fimJanelaCurta(hoje: Ymd): Ymd {
  return somarDias(hoje, DIAS_JANELA_CURTA - 1);
}

/** Fim da janela longa ("mês"). */
export function fimJanelaLonga(hoje: Ymd): Ymd {
  return somarDias(hoje, DIAS_JANELA_LONGA - 1);
}

/** "11/08" — rótulo curto para a sugestão. */
export function fmtDiaMes(dia: Ymd): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}
