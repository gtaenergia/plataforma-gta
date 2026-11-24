/** Formatos de dinheiro do Financeiro (os mesmos do artefato). */

const n2 = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const;

/** R$ 1.234,56 — com "−" de verdade para negativo. */
export const brl = (v: number) => (v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", n2);
/** R$ 1.235 — sem centavos. */
export const brl0 = (v: number) => (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR");
/** 1.234,56 — sem o símbolo (tabelas com coluna de sinal). */
export const num2 = (v: number) => Math.abs(v).toLocaleString("pt-BR", n2);
/** Rótulo curto de eixo: "12 mil", "1,5 mil", "800". */
export function kfmt(v: number): string {
  const a = Math.abs(v);
  return (v < 0 ? "−" : "") + (a >= 1000 ? (a / 1000).toLocaleString("pt-BR", { maximumFractionDigits: a >= 10000 ? 0 : 1 }) + " mil" : String(Math.round(a)));
}
/** 25% (fração 0,25). */
export const pct = (f: number) => (isFinite(f) ? Math.round(f * 1000) / 10 : 0).toLocaleString("pt-BR") + "%";

/**
 * "1.500,00", "1500", "1500.5", "R$ 2.000" → número. Positivo por padrão;
 * `aceitaNegativo` para o saldo do banco, que pode estar no vermelho.
 */
export function lerDinheiro(s: string, aceitaNegativo = false): number {
  let t = String(s).trim().replace(/[R$\s]/g, "").replace("−", "-");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = Number(t);
  if (!isFinite(v) || t === "" || t === "-") return NaN;
  if (!aceitaNegativo && !(v > 0)) return NaN;
  return Math.round(v * 100) / 100;
}

export const valorParaCampo = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
