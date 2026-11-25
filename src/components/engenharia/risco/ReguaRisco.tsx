"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { META_RISCO, type ResultadoRisco } from "@/lib/engenharia/risco/motor";
import { fmtFreq, fmtNum, fmtRisco } from "@/lib/engenharia/formato";

/**
 * Régua do rodapé: metade esquerda verde (tolerável), metade direita vermelha
 * (acima), traço no limite e o marcador na posição do valor. O limite fica no
 * meio da régua; o fim da régua vale o dobro do tolerável.
 */
function Regua({ valor, limite, rotulo }: { valor: number; limite: number; rotulo: string }) {
  const frac = limite > 0 ? Math.min(1, Math.max(0, valor / (limite * 2))) : 0;
  const acima = valor > limite;
  return (
    <span className="relative inline-block h-2.5 w-24 shrink-0 overflow-visible" role="img" aria-label={`${rotulo}: ${acima ? "acima do tolerável" : "tolerável"}`}>
      <span className="absolute inset-y-0 left-0 w-1/2 rounded-l-full bg-green-500" aria-hidden />
      <span className="absolute inset-y-0 right-0 w-1/2 rounded-r-full bg-red-500" aria-hidden />
      <span className="absolute -top-1 -bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-slate-800 dark:bg-white" aria-hidden />
      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gta-navy shadow dark:border-slate-900 dark:bg-white"
        style={{ left: `${frac * 100}%` }}
        aria-hidden
      />
    </span>
  );
}

export function ReguaRisco({ resultado, pendencias }: { resultado: ResultadoRisco; pendencias: number }) {
  const riscos = (["R1", "R3", "R4"] as const).filter((k) => resultado[k]);
  const ok = resultado.toleravel;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="app-container flex flex-wrap items-center gap-x-5 gap-y-2 py-2.5">
        {pendencias > 0 ? (
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
            Faltam {pendencias} {pendencias === 1 ? "dado" : "dados"} — valores parciais
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
            {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {ok ? "R ≤ RT — tolerável" : "R > RT — proteção necessária"}
          </span>
        )}
        {riscos.map((k) => {
          const r = resultado[k]!;
          const exp = META_RISCO[k].expoente;
          return (
            <div key={k} className="flex min-w-[180px] items-center gap-2">
              <span className="font-mono text-xs font-bold">{k}</span>
              <Regua valor={r.total} limite={r.RT} rotulo={k} />
              <span className={`font-mono text-xs ${r.excede ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                {fmtRisco(r.total, exp)} <span className="text-slate-500">/ {fmtRisco(r.RT, exp, 0)}</span>
              </span>
            </div>
          );
        })}
        {resultado.zonas
          .filter((z) => z.F)
          .map((z) => (
            <div key={z.id} className="flex min-w-[180px] items-center gap-2">
              <span className="font-mono text-xs font-bold">F·{z.nome}</span>
              <Regua valor={z.F!.total} limite={z.F!.FT} rotulo={`Frequência de danos — ${z.nome}`} />
              <span className={`font-mono text-xs ${z.F!.excede ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                {fmtFreq(z.F!.total)} <span className="text-slate-500">/ {fmtNum(z.F!.FT)}</span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
