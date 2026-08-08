"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PRODUTOS, type Produto } from "@/lib/produtos/registry";

/**
 * Alternador entre as duas ferramentas da conta (Operações e CRM).
 *
 * Fica colado na marca, e não no menu do perfil, porque trocar de ferramenta é
 * navegação — não é uma preferência da conta. O produto ativo chega por prop:
 * quem o calcula é o cabeçalho, a partir da rota, e assim os dois modos (menu
 * no desktop, lista na gaveta do celular) concordam sempre.
 */

/** Menu suspenso — cabeçalho no desktop. */
export function SeletorProduto({ ativo }: { ativo: Produto }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Icone = ativo.icone;

  // fecha ao clicar fora — mesmo padrão do menu de perfil
  useEffect(() => {
    if (!aberto) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [aberto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="acao-cabecalho gap-1.5 border border-white/25 px-2.5 text-sm"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ferramenta: ${ativo.label}. Trocar de ferramenta`}
      >
        <Icone className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="font-semibold">{ativo.label}</span>
        <svg className={`h-3 w-3 transition ${aberto ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          /* Ancorado à DIREITA: o seletor fica no canto direito do cabeçalho,
             ao lado do perfil — aberto para a esquerda ele vazava da tela. */
          className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <div className="hint">Ferramentas</div>
          </div>
          {PRODUTOS.map((p) => {
            const IconeItem = p.icone;
            const atual = p.key === ativo.key;
            return (
              <Link
                key={p.key}
                href={p.home}
                role="menuitem"
                aria-current={atual ? "page" : undefined}
                onClick={() => setAberto(false)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <IconeItem
                  className={`mt-0.5 h-5 w-5 shrink-0 ${atual ? "text-gta-indigo dark:text-indigo-300" : "text-slate-400"}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gta-navy dark:text-slate-100">{p.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{p.descricao}</span>
                </span>
                {atual && <Check className="mt-0.5 h-4 w-4 shrink-0 text-gta-indigo dark:text-indigo-300" aria-hidden />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Lista aberta — topo da gaveta do celular. No dedo, esconder as ferramentas
 * atrás de um segundo toque num menu que já é suspenso seria um menu dentro de
 * outro; aqui as duas ficam à vista.
 */
export function SeletorProdutoLista({ ativo, onNavigate }: { ativo: Produto; onNavigate: () => void }) {
  return (
    <div className="border-b border-white/10 pb-2">
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ferramentas</div>
      <div className="flex gap-2">
        {PRODUTOS.map((p) => {
          const IconeItem = p.icone;
          const atual = p.key === ativo.key;
          return (
            <Link
              key={p.key}
              href={p.home}
              onClick={onNavigate}
              aria-current={atual ? "page" : undefined}
              className={`toque flex-1 justify-center gap-2 rounded px-3 py-2 text-sm transition ${
                atual ? "bg-white/15 font-semibold text-white" : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              <IconeItem className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {p.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
