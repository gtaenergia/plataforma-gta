"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { Notificacao } from "@/lib/notificacoes/types";

/** Tempo relativo curto em pt-BR (ex.: "agora", "há 5 min", "há 2 h", "há 3 d"). */
function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function NotificacoesSino() {
  const router = useRouter();
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function carregar() {
    try {
      const r = await fetch("/api/notificacoes");
      if (!r.ok) return;
      const d = await r.json();
      setItens(d.notificacoes ?? []);
      setNaoLidas(d.naoLidas ?? 0);
    } catch {
      /* silencioso — o sino não pode quebrar o cabeçalho */
    }
  }

  // Carrega ao montar e a cada 60s (atualização passiva do contador).
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    return () => clearInterval(t);
  }, []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [aberto]);

  function abrir() {
    const novo = !aberto;
    setAberto(novo);
    if (novo) carregar(); // pega o estado mais recente ao abrir
  }

  async function marcarTodas() {
    setItens((prev) => prev.map((n) => ({ ...n, lida: true })));
    setNaoLidas(0);
    try {
      await fetch("/api/notificacoes/marcar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    } catch {
      /* ignora */
    }
  }

  async function abrirNotificacao(n: Notificacao) {
    setAberto(false);
    if (!n.lida) {
      setItens((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      setNaoLidas((c) => Math.max(0, c - 1));
      fetch("/api/notificacoes/marcar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      }).catch(() => {});
    }
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={abrir}
        className="relative flex h-9 w-9 items-center justify-center rounded border border-white/25 hover:bg-white/10"
        aria-label="Notificações"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Bell className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        {naoLidas > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gta-orange px-1 text-[10px] font-bold leading-none text-white">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {/*
        No celular o sino não fica na borda da tela (o menu do usuário vem
        depois), então ancorar por `right-0` jogava os 320px do painel para
        fora pela ESQUERDA. Abaixo de `sm` ele passa a ser fixo, ocupando a
        largura da tela com margem. De `sm` para cima volta a ser o dropdown
        ancorado no sino, como no desktop.
      */}
      {aberto && (
        <div
          role="menu"
          className="fixed inset-x-3 top-[70px] z-20 overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-1.5rem)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-700">
            <span className="text-sm font-semibold text-gta-navy dark:text-slate-100">Notificações</span>
            {naoLidas > 0 && (
              <button onClick={marcarTodas} className="text-xs font-medium text-gta-indigo hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma notificação.</p>
            ) : (
              itens.map((n) => (
                <button
                  key={n.id}
                  onClick={() => abrirNotificacao(n)}
                  className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-4 py-3 text-left transition last:border-0 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/50 ${
                    n.lida ? "" : "bg-indigo-50/60 dark:bg-indigo-500/10"
                  }`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lida ? "bg-transparent" : "bg-gta-orange"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gta-navy dark:text-slate-100">{n.titulo}</span>
                    {n.mensagem && <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">{n.mensagem}</span>}
                    <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{tempoRelativo(n.criadoEm)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
