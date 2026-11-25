/** Formatação numérica das ferramentas de engenharia (pt-BR). */

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
export const sobrescrito = (s: string | number) => String(s).split("").map((c) => SUP[c] ?? c).join("");

export function fmtNum(v: number | null | undefined, casas = 2, min = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: casas });
}

/** Número fixo de casas (para colunas alinhadas). */
export function fmtFixo(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Notação científica: 0,09875 → "9,875×10⁻²". Zero vira "0". */
export function fmtCient(v: number | null | undefined, casas = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  if (exp === 0) return fmtFixo(v, casas);
  return `${fmtFixo(mant, casas)}×10${sobrescrito(exp)}`;
}

/**
 * Frequência de danos (eventos/ano): três casas a partir de 0,01; abaixo
 * disso, notação científica — com casas fixas, 0,00004 viraria "0,000" e
 * pareceria zero.
 */
export function fmtFreq(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  return Math.abs(v) >= 0.01 ? fmtFixo(v, 3) : fmtCient(v, 2);
}

/** Risco na escala do tolerável: 5,71e-6 com expoente −5 → "0,571 ×10⁻⁵". */
export function fmtRisco(v: number | null | undefined, expoente: number, casas = 3): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  return `${fmtFixo(v / 10 ** expoente, casas)} ×10${sobrescrito(expoente)}`;
}

export function fmtPct(v: number | null | undefined, casas = 1, sinal = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return `${sinal && v > 0 ? "+" : ""}${s.replace("-", "−")}%`;
}

export function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Valor curto de parâmetro (0.001 → "0,001"; 1e-5 → "10⁻⁵"). */
export function fmtParam(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) < 0.001) {
    const exp = Math.round(Math.log10(Math.abs(v)));
    if (Math.abs(v - 10 ** exp) < 1e-12) return `10${sobrescrito(exp)}`;
    return fmtCient(v, 2);
  }
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}
