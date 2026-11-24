/**
 * Datas do Financeiro, sempre como texto AAAA-MM-DD / AAAA-MM.
 *
 * Texto, e não Date, porque o dia de vencimento não tem fuso: "05/12" é 05/12
 * em qualquer lugar. As contas usam Date.UTC só por dentro, para o horário de
 * verão (ou o fuso do servidor na Vercel, que é UTC) nunca empurrar um dia.
 */

export const pad = (n: number) => String(n).padStart(2, "0");

const toUtc = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function addDias(s: string, n: number): string {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (s: string) => toUtc(s).getUTCDay();

export function proximoMes(m: string): string {
  let y = +m.slice(0, 4);
  let mo = +m.slice(5, 7) + 1;
  if (mo > 12) {
    y++;
    mo = 1;
  }
  return `${y}-${pad(mo)}`;
}

export function mesAnterior(m: string): string {
  let y = +m.slice(0, 4);
  let mo = +m.slice(5, 7) - 1;
  if (mo < 1) {
    y--;
    mo = 12;
  }
  return `${y}-${pad(mo)}`;
}

export const ultimoDia = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();

/** O dia `dia` do mês `m`; em mês curto, o último dia (31 → 30/28). */
export const diaNoMes = (m: string, dia: number) => `${m}-${pad(Math.min(Math.max(1, dia), ultimoDia(m)))}`;

/** Hoje no horário de Brasília — o servidor roda em UTC. */
export function hojeBrasilia(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Hoje no relógio de quem está olhando (o navegador). */
export function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

/** Último dia do horizonte: dezembro do ano seguinte (mínimo dez/2027). */
export const fimDoHorizonte = (hoje: string) => `${Math.max(2027, +hoje.slice(0, 4) + 1)}-12-31`;

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_CURTOS = MES;
export const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-12" → "dez/26" */
export const rotuloMes = (m: string) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`;
/** "2026-12-05" → "05/12" */
export const diaMes = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** "2026-12-05" → "05/12/26" */
export const diaMesAno = (s: string) => `${diaMes(s)}/${s.slice(2, 4)}`;
