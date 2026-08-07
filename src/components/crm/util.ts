/** Utilidades de exibição compartilhadas pelas telas do CRM (puras, testáveis). */

/** "2026-08-07" → "07/08/2026"; entrada vazia ou torta sai como veio. */
export function dataCurta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
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
