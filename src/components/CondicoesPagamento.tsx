"use client";

import { X } from "lucide-react";
import { parseNumber, formatBRL, formatDecimal } from "@/lib/format";

/**
 * Seção compartilhada de "Condições de pagamento", usada por todos os
 * configuradores. Dois modos:
 *  - "parcelas": tabela de parcelas (% do total + texto), com o valor em R$ de
 *    cada uma calculado a partir do total; validação de soma 100%.
 *  - "combinar": sai como "A combinar" na proposta.
 * O configurador guarda o estado `CondPag` (persistido em dados.cond) e usa
 * `montarFormaPagamento(cond, total)` para preencher {formaPagamento} no .docx.
 */

export type Parcela = { pct: string; texto: string };
export type CondPag = { modo: "parcelas" | "combinar"; parcelas: Parcela[] };

export const COND_PADRAO: CondPag = {
  modo: "parcelas",
  parcelas: [
    { pct: "50", texto: "na contratação" },
    { pct: "50", texto: "na entrega" },
  ],
};

function juntarPt(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

/** Texto da forma de pagamento para o .docx (com o R$ de cada parcela). */
export function montarFormaPagamento(cond: CondPag | undefined, total: number): string {
  if (!cond || cond.modo === "combinar") return "A combinar";
  const linhas = cond.parcelas
    .filter((p) => parseNumber(p.pct) > 0 || p.texto.trim())
    .map((p) => `${String(p.pct).trim()}% (${formatBRL((parseNumber(p.pct) / 100) * total)}) ${p.texto.trim()}`.replace(/\s+/g, " ").trim());
  return linhas.length ? juntarPt(linhas) + "." : "A combinar";
}

export function CondicoesPagamento({ total, value, onChange }: { total: number; value: CondPag; onChange: (c: CondPag) => void }) {
  const cond = value ?? COND_PADRAO;
  const { modo, parcelas } = cond;
  const somaPct = parcelas.reduce((s, p) => s + parseNumber(p.pct), 0);
  const pctOk = Math.abs(somaPct - 100) < 0.01;
  const setModo = (m: CondPag["modo"]) => onChange({ ...cond, modo: m });
  const setParcela = (i: number, campo: keyof Parcela, v: string) => onChange({ ...cond, parcelas: parcelas.map((p, idx) => (idx === i ? { ...p, [campo]: v } : p)) });
  const addParcela = () => onChange({ ...cond, parcelas: [...parcelas, { pct: "", texto: "" }] });
  const removeParcela = (i: number) => onChange({ ...cond, parcelas: parcelas.filter((_, idx) => idx !== i) });

  const inputCls = "field-input";

  return (
    <section className="section-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Condições de pagamento</h2>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          <button type="button" onClick={() => setModo("parcelas")} className={`toque justify-center rounded-md px-2.5 py-1 font-medium transition ${modo ==="parcelas" ? "bg-gta-indigo text-white" : "text-slate-500 hover:text-gta-indigo dark:text-slate-400"}`}>Parcelado</button>
          <button type="button" onClick={() => setModo("combinar")} className={`toque justify-center rounded-md px-2.5 py-1 font-medium transition ${modo ==="combinar" ? "bg-gta-indigo text-white" : "text-slate-500 hover:text-gta-indigo dark:text-slate-400"}`}>A combinar</button>
        </div>
      </div>

      {modo === "combinar" ? (
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
          A forma de pagamento será definida no fechamento — sairá como <strong>“A combinar”</strong> na proposta.
        </p>
      ) : (
        <>
          <p className="mt-1 subtitle">Cada parcela é uma % do total; o app calcula o valor em reais. As porcentagens devem somar 100%.</p>
          <div className="mt-4 space-y-2">
            {parcelas.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex w-24 shrink-0 items-center gap-1">
                  <input className={`${inputCls} text-right`} inputMode="decimal" value={p.pct} onChange={(e) => setParcela(i, "pct", e.target.value)} placeholder="0" />
                  <span className="text-sm text-slate-400">%</span>
                </div>
                <input className={`${inputCls} flex-1`} value={p.texto} onChange={(e) => setParcela(i, "texto", e.target.value)} placeholder="Ex.: na assinatura do contrato" />
                <div className="w-28 shrink-0 text-right text-sm font-medium text-slate-600 dark:text-slate-300">{formatBRL((parseNumber(p.pct) / 100) * total)}</div>
                <button type="button" className="icon-btn" onClick={() => removeParcela(i)} aria-label="Remover parcela"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" className="btn-link" onClick={addParcela}>+ Adicionar parcela</button>
            {/* Quando as parcelas somam 100% não há o que informar — só o total.
                Fora disso o aviso fica, senão a proposta sai com parcelas que
                não fecham o valor. */}
            <div className="text-xs">
              {!pctOk && (
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  Soma: {formatDecimal(somaPct, Number.isInteger(somaPct) ? 0 : 1)}% — deveria ser 100%
                </span>
              )}
              <span className={`text-slate-500 dark:text-slate-400 ${pctOk ? "" : "ml-3"}`}>Total: {formatBRL(total)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
