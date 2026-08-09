import type { Periodo } from "./relatorios";

/**
 * Atalhos de período dos relatórios (puros, com "hoje" recebido de fora).
 *
 * Recebem a data em vez de chamar `new Date()` para valerem teste com data
 * fixa — mesma disciplina do motor de capacidade.
 */

export type ChavePeriodo = "mes" | "mes_passado" | "trimestre" | "ano" | "tudo";

export const PERIODOS: { chave: ChavePeriodo; label: string }[] = [
  { chave: "mes", label: "Este mês" },
  { chave: "mes_passado", label: "Mês passado" },
  { chave: "trimestre", label: "Últimos 3 meses" },
  { chave: "ano", label: "Este ano" },
  { chave: "tudo", label: "Tudo" },
];

const ymd = (ano: number, mes: number, dia: number) =>
  `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

/** Último dia do mês: dia 0 do mês seguinte. */
const ultimoDia = (ano: number, mes: number) => new Date(ano, mes + 1, 0).getDate();

export function periodoDe(chave: ChavePeriodo, hoje: Date): Periodo {
  const a = hoje.getFullYear();
  const m = hoje.getMonth();

  switch (chave) {
    case "mes":
      return { inicio: ymd(a, m, 1), fim: ymd(a, m, ultimoDia(a, m)) };
    case "mes_passado": {
      // `new Date(ano, -1)` já rola para dezembro do ano anterior.
      const d = new Date(a, m - 1, 1);
      const pa = d.getFullYear();
      const pm = d.getMonth();
      return { inicio: ymd(pa, pm, 1), fim: ymd(pa, pm, ultimoDia(pa, pm)) };
    }
    case "trimestre": {
      const d = new Date(a, m - 2, 1);
      return { inicio: ymd(d.getFullYear(), d.getMonth(), 1), fim: ymd(a, m, ultimoDia(a, m)) };
    }
    case "ano":
      return { inicio: ymd(a, 0, 1), fim: ymd(a, 11, 31) };
    case "tudo":
      // Sem limites: `noPeriodo` aceita qualquer data com registro.
      return { inicio: "", fim: "" };
  }
}

/** Rótulo legível do período, para o cabeçalho do relatório. */
export function rotuloPeriodo(p: Periodo): string {
  const br = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
  };
  if (!p.inicio && !p.fim) return "todo o período";
  if (p.inicio && p.fim) return `${br(p.inicio)} a ${br(p.fim)}`;
  return p.inicio ? `a partir de ${br(p.inicio)}` : `até ${br(p.fim)}`;
}
