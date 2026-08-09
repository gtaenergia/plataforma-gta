"use client";

import Link from "next/link";
import { PRODUTOS, type Produto } from "@/lib/produtos/registry";

/**
 * Alternador entre as duas ferramentas da conta (Operações e CRM) — versão da
 * GAVETA do celular. No dedo, esconder as ferramentas atrás de um segundo
 * toque num menu que já é suspenso seria um menu dentro de outro; aqui as
 * duas ficam à vista, no topo da gaveta.
 *
 * No desktop a troca vive no menu do perfil ("Sessão"), como item de texto —
 * o botão próprio que existia ao lado do sino saía caro no cabeçalho, que já
 * carrega engrenagem, sino e perfil. O produto ativo chega por prop: quem o
 * calcula é o cabeçalho, a partir da rota, e assim os dois lugares concordam.
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
