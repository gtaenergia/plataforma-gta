"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { NotificacoesSino } from "./NotificacoesSino";
import { Avatar } from "./ui";

const NAV = [
  { href: "/", label: "Nova proposta" },
  { href: "/propostas", label: "Propostas" },
  { href: "/aprovacoes", label: "Aprovações" },
  { href: "/clientes", label: "Clientes" },
  { href: "/tarefas", label: "Tarefas" },
  { href: "/apontamentos", label: "Apontamentos" },
];

export function AppHeader({ userName, isAdmin }: { userName?: string; isAdmin?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [navAberto, setNavAberto] = useState(false);
  const [dark, setDark] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // estado inicial do tema (o script no <head> já aplicou a classe)
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  // busca a foto de perfil (não vem por prop — evita ter que passar por todas as páginas)
  useEffect(() => {
    if (!userName) return;
    fetch("/api/conta")
      .then((r) => r.json())
      .then((d) => setAvatarUrl(d.avatarUrl ?? ""))
      .catch(() => {});
  }, [userName]);

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

  function isActive(href: string) {
    return href === "/" ? pathname === "/" || pathname.startsWith("/nova") : pathname.startsWith(href);
  }

  return (
    <header className="bg-gradient-to-r from-gta-navy to-gta-navy2 text-white">
      <div className="app-container flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-2 md:gap-6">
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
          <Link href="/" className="toque flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gta-icon.png" alt="GTA" className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight sm:text-lg">GTA Energia</span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-1.5 transition ${
                  isActive(item.href)
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
          <div className="flex items-center gap-2">
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
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setNavAberto(false)}
              className={`block rounded px-3 py-2.5 text-sm transition ${
                isActive(item.href)
                  ? "bg-white/15 font-semibold text-white"
                  : "text-slate-200 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
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
