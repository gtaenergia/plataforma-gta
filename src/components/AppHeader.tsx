"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Moon, Settings, Sun } from "lucide-react";
import { NotificacoesSino } from "./NotificacoesSino";
import { SeletorProduto, SeletorProdutoLista } from "./SeletorProduto";
import { Avatar } from "./ui";
import { itemAtivo, produtoDaRota } from "@/lib/produtos/registry";

/**
 * `avatarUrl` chega por prop, e não por fetch. A versão anterior buscava
 * `/api/conta` num efeito, em TODAS as páginas, para obter um campo que o
 * componente de servidor já tinha em mãos — `requirePageUser()` devolve o
 * usuário inteiro. Era uma ida ao servidor por página só para isso, com a
 * consulta de sessão junto, e ainda fazia a foto aparecer depois do resto.
 */
export function AppHeader({ userName, avatarUrl, isAdmin }: { userName?: string; avatarUrl?: string; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  /* A ferramenta ativa sai da rota, não de uma prop: assim as ~22 páginas que
     montam esta casca seguem intocadas, e um link direto abre no lugar certo. */
  const produto = produtoDaRota(pathname);
  const [menuAberto, setMenuAberto] = useState(false);
  const [navAberto, setNavAberto] = useState(false);
  const [dark, setDark] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // estado inicial do tema (o script no <head> já aplicou a classe)
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // fecha o menu do usuário ao clicar fora
  useEffect(() => {
    if (!menuAberto) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuAberto]);

  // fecha o menu mobile ao trocar de rota
  useEffect(() => {
    setNavAberto(false);
  }, [pathname]);

  function alternarTema() {
    const novo = !dark;
    setDark(novo);
    document.documentElement.classList.toggle("dark", novo);
    try {
      localStorage.setItem("tema", novo ? "dark" : "light");
    } catch {
      /* localStorage indisponível — ignora */
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="bg-gradient-to-r from-gta-navy to-gta-navy2 text-white">
      <div className="app-container flex items-center justify-between gap-2 py-3">
        {/* `min-w-0` para que a navegação possa encolher em vez de empurrar o
            perfil para fora da tela: o CRM tem sete itens, e num tablet eles
            não cabem inteiros ao lado da marca e do seletor. */}
        <div className="flex min-w-0 items-center gap-2 md:gap-4 lg:gap-6">
          {/* Hamburguer — só no mobile */}
          {userName && (
            <button
              type="button"
              onClick={() => setNavAberto((v) => !v)}
              className="acao-cabecalho acao-cabecalho-icone -ml-1 md:hidden"
              aria-label="Menu"
              aria-expanded={navAberto}
              aria-controls="mobile-nav"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
                {navAberto ? (
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
            </button>
          )}
          {/* `toque` só existe dentro da media query de dedo: no celular o link
              da marca tinha 32px de altura, abaixo do alvo mínimo. */}
          <Link href={produto.home} className="toque flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gta-icon.png" alt="GTA" className="h-8 w-8" />
            {/* Com o seletor de ferramenta ao lado, o nome por extenso só cabe a
                partir do desktop; abaixo disso o ícone já identifica a marca. */}
            <span className="text-base font-bold tracking-tight sm:text-lg md:hidden lg:inline">GTA Energia</span>
          </Link>
          {/* O seletor só aparece logado: na tela de login não há ferramenta a trocar. */}
          {userName && (
            <div className="hidden shrink-0 md:block">
              <SeletorProduto ativo={produto} />
            </div>
          )}
          <nav className="sem-barra-rolagem hidden min-w-0 items-center gap-1 overflow-x-auto text-sm md:flex">
            {produto.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 whitespace-nowrap rounded px-3 py-1.5 transition ${
                  itemAtivo(pathname, item)
                    ? "bg-white/15 font-semibold text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {userName && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Como no RD Station, as configurações da ferramenta ficam atrás de
                uma engrenagem, fora do menu principal. */}
            {produto.config && (
              <Link
                href={produto.config.href}
                className="acao-cabecalho acao-cabecalho-icone"
                aria-label={`${produto.config.label} do ${produto.label}`}
                aria-current={itemAtivo(pathname, produto.config) ? "page" : undefined}
              >
                <Settings className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </Link>
            )}
            <NotificacoesSino />
            <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuAberto((v) => !v)}
              className="acao-cabecalho gap-2 border border-white/25 px-2.5 text-sm sm:px-3"
              aria-haspopup="menu"
              aria-expanded={menuAberto}
            >
              <Avatar src={avatarUrl || undefined} name={userName} size={24} tone="header" />
              <span className="hidden max-w-[160px] truncate sm:inline">{userName}</span>
              <svg className={`h-3 w-3 transition ${menuAberto ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {menuAberto && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                  <div className="hint">Sessão</div>
                  <div className="truncate text-sm font-semibold text-gta-navy dark:text-slate-100">{userName}</div>
                </div>
                <MenuLink href="/conta" onNavigate={() => setMenuAberto(false)}>
                  Minha conta
                </MenuLink>
                <MenuLink href="/calendario" onNavigate={() => setMenuAberto(false)}>
                  Calendário
                </MenuLink>
                {isAdmin && (
                  <MenuLink href="/admin/usuarios" onNavigate={() => setMenuAberto(false)}>
                    Gerenciar usuários
                  </MenuLink>
                )}
                {isAdmin && (
                  <MenuLink href="/admin/cargos" onNavigate={() => setMenuAberto(false)}>
                    Cargos e permissões
                  </MenuLink>
                )}
                {isAdmin && (
                  <MenuLink href="/admin/planejamento" onNavigate={() => setMenuAberto(false)}>
                    Planejamento e capacidade
                  </MenuLink>
                )}
                {isAdmin && (
                  <MenuLink href="/admin/armazenamento" onNavigate={() => setMenuAberto(false)}>
                    Armazenamento
                  </MenuLink>
                )}
                <button
                  onClick={alternarTema}
                  role="menuitem"
                  className="toque flex w-full items-center justify-between border-t border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  <span>Tema {dark ? "escuro" : "claro"}</span>
                  {dark ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
                </button>
                <button
                  onClick={logout}
                  role="menuitem"
                  className="toque block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-slate-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-slate-700"
                >
                  Sair
                </button>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Navegação mobile (gaveta) */}
      {userName && navAberto && (
        <nav id="mobile-nav" className="border-t border-white/10 px-2 pb-2 md:hidden">
          <SeletorProdutoLista ativo={produto} onNavigate={() => setNavAberto(false)} />
          {produto.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setNavAberto(false)}
              className={`block rounded px-3 py-2.5 text-sm transition ${
                itemAtivo(pathname, item)
                  ? "bg-white/15 font-semibold text-white"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {produto.config && (
            <Link
              href={produto.config.href}
              onClick={() => setNavAberto(false)}
              className={`block rounded px-3 py-2.5 text-sm transition ${
                itemAtivo(pathname, produto.config)
                  ? "bg-white/15 font-semibold text-white"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              {produto.config.label}
            </Link>
          )}
        </nav>
      )}
      <div className="h-1 w-full bg-gta-orange" />
    </header>
  );
}

function MenuLink({ href, onNavigate, children }: { href: string; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      /* `toque` só age no celular: os itens tinham 40px, abaixo do alvo. */
      className="toque block w-full px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
    >
      {children}
    </Link>
  );
}
