import type { UnidadeRepeticao } from "./types";

/**
 * Quando um compromisso que se repete volta à agenda (puro, sem I/O).
 *
 * A data vem do CALENDÁRIO, não do dia em que o contato foi feito: "todo mês,
 * dia 10" continua no dia 10 mesmo quando o contato de outubro saiu no dia
 * 14. Contar a partir do dia feito faria a cadência escorregar um pouco a cada
 * atraso, até ninguém mais saber qual era o dia combinado.
 *
 * Mas a próxima nunca cai no passado: contato atrasado duas semanas num
 * compromisso semanal pula as ocorrências vencidas em vez de empilhar três
 * cobranças do mesmo cliente para hoje.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(iso: string): [number, number, number] | null {
  const m = ISO.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * `iso` + `n` unidades.
 *
 * Mês soma no calendário, com o dia limitado ao fim do mês: 31/01 + 1 mês é
 * 28/02 (ou 29), não 03/03 — o que o `Date` do JavaScript faria sozinho.
 */
export function somarIntervalo(data: string, n: number, unidade: UnidadeRepeticao): string {
  const p = partes(data);
  if (!p) return data;
  const [ano, mes, dia] = p;
  if (unidade === "meses") {
    const total = ano * 12 + (mes - 1) + n;
    const novoAno = Math.floor(total / 12);
    const novoMes = (total % 12) + 1;
    const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
    return iso(novoAno, novoMes, Math.min(dia, ultimoDia));
  }
  const dias = unidade === "semanas" ? n * 7 : n;
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * A primeira ocorrência DEPOIS de `depoisDe` (o dia em que o contato foi
 * feito), contando a partir da data agendada.
 *
 * Cada salto é calculado a partir da data AGENDADA (k × intervalo), e não do
 * salto anterior: somar um mês de cada vez faria 31/01 virar 28/02 e depois
 * 28/03 — o dia 31 se perderia no primeiro fevereiro.
 */
export function proximaOcorrencia(agendada: string, cada: number, unidade: UnidadeRepeticao, depoisDe: string): string {
  if (!partes(agendada) || cada <= 0) return "";
  // Teto de segurança: um compromisso diário atrasado há anos ainda cabe.
  for (let k = 1; k <= 5000; k++) {
    const candidata = somarIntervalo(agendada, k * cada, unidade);
    if (candidata > depoisDe) return candidata;
  }
  return "";
}

/**
 * As cadências que a tela oferece de cara. Qualquer outra entra por
 * "Personalizado" — a lista curta é para o caso comum não exigir conta.
 */
export const PRESETS_REPETICAO: readonly { cada: number; unidade: UnidadeRepeticao | "" }[] = [
  { cada: 0, unidade: "" },
  { cada: 1, unidade: "semanas" },
  { cada: 15, unidade: "dias" },
  { cada: 1, unidade: "meses" },
  { cada: 3, unidade: "meses" },
  { cada: 6, unidade: "meses" },
];

/** O preset que corresponde à repetição, ou -1 quando ela é personalizada. */
export function indicePreset(cada: number, unidade: UnidadeRepeticao | ""): number {
  if (!cada || !unidade) return 0;
  return PRESETS_REPETICAO.findIndex((p) => p.cada === cada && p.unidade === unidade);
}

/** "Toda semana", "A cada 15 dias", "Todo mês", "A cada 3 meses". */
export function descreverRepeticao(cada: number, unidade: UnidadeRepeticao | ""): string {
  if (!cada || !unidade) return "Não se repete";
  if (cada === 1) return unidade === "dias" ? "Todo dia" : unidade === "semanas" ? "Toda semana" : "Todo mês";
  return `A cada ${cada} ${unidade}`;
}

/**
 * O dia de hoje em São Paulo, em YYYY-MM-DD.
 *
 * No servidor o relógio é UTC: às 22h daqui já é o dia seguinte lá, e a
 * próxima ocorrência sairia calculada a partir de amanhã.
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
