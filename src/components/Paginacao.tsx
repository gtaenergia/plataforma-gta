"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Paginação client-side compartilhada pelas listas (propostas, clientes,
 * aprovações — mesmo padrão já usado em Tarefas). Recebe a lista JÁ filtrada e
 * devolve a fatia da página atual + os controles do rodapé.
 */

export interface PaginacaoControles {
  total: number;
  inicio: number;
  fim: number;
  pagina: number;
  totalPaginas: number;
  porPagina: number;
  setPagina: (n: number) => void;
  setPorPagina: (n: number) => void;
}

export function usePaginacao<T>(itens: T[], porPaginaInicial = 20): { paginados: T[]; controles: PaginacaoControles } {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(porPaginaInicial);

  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);

  // Volta para a 1ª página quando os filtros mudam o total, ou o tamanho de página muda.
  useEffect(() => {
    setPagina(1);
  }, [itens.length, porPagina]);

  const p0 = paginaAtual - 1;
  const paginados = useMemo(() => itens.slice(p0 * porPagina, (p0 + 1) * porPagina), [itens, p0, porPagina]);
  const inicio = itens.length === 0 ? 0 : p0 * porPagina + 1;
  const fim = Math.min(paginaAtual * porPagina, itens.length);

  return {
    paginados,
    controles: { total: itens.length, inicio, fim, pagina: paginaAtual, totalPaginas, porPagina, setPagina, setPorPagina },
  };
}

const btnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700";

export function Paginacao({ total, inicio, fim, pagina, totalPaginas, porPagina, setPagina, setPorPagina }: PaginacaoControles) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-3 dark:text-slate-300">
      <div className="flex items-center gap-2">
        <span className="text-slate-600 dark:text-slate-400">
          {inicio}–{fim} de {total}
        </span>
        <select className="field-input !w-auto !py-1 text-xs" value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}>
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{n} por página</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button className={btnCls} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-1 text-slate-600 dark:text-slate-400">Página {pagina} de {totalPaginas}</span>
        <button className={btnCls} disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)} aria-label="Próxima">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
