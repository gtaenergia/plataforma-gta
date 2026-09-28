/** Utilidades de exibição compartilhadas pelas telas do CRM (puras, testáveis). */

/** "2026-08-07" → "07/08/2026"; entrada vazia ou torta sai como veio. */
export function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Classe de agenda de uma tarefa em relação ao dia de hoje. */
export type ClasseTarefa = "atrasada" | "hoje" | "proxima" | "concluida";

/** Onde a tarefa cai na agenda. `hojeISO` chega de fora para a função ser pura. */
export function classificarTarefa(t: { data: string; concluida: boolean }, hojeISO: string): ClasseTarefa {
  if (t.concluida) return "concluida";
  if (t.data < hojeISO) return "atrasada";
  if (t.data === hojeISO) return "hoje";
  return "proxima";
}

/** O dia de hoje no fuso local, em YYYY-MM-DD (para comparar com `TarefaCrm.data`). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * A data de um momento, no fuso de quem está olhando ("29/09/2026").
 *
 * Cortar o texto do carimbo ("2026-09-29T01:30:00Z".slice(0, 10)) dá o dia
 * em UTC: o contato concluído às 22h30 de Goiânia apareceria como feito no
 * dia seguinte. Data pura (YYYY-MM-DD) não tem fuso e sai como veio.
 */
export function diaLocal(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return dataCurta(valor);
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Carimbo de data e hora ("07/08/2026 14:32") para o histórico. */
export function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}
