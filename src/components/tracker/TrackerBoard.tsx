"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, FileText, Timer } from "lucide-react";
import type { Task } from "@/lib/tasks/types";
import { AbaTracker } from "./AbaTracker";
import { AbaDashboard } from "./AbaDashboard";
import { AbaRelatorios } from "./AbaRelatorios";
import { AbaCalendario } from "./AbaCalendario";
import type { Usuario } from "./comum";

/**
 * Casca do Tracker: abas (Tracker / Dashboard / Relatórios / Calendário) e o
 * filtro de usuário, que vale para todas elas. Cada aba busca os próprios
 * dados no período que ela controla.
 */

type Aba = "tracker" | "dashboard" | "relatorios" | "calendario";

const ABAS: { id: Aba; label: string; Icone: typeof Timer }[] = [
  { id: "tracker", label: "Lançamentos", Icone: Timer },
  { id: "dashboard", label: "Dashboard", Icone: BarChart3 },
  { id: "relatorios", label: "Relatórios", Icone: FileText },
  { id: "calendario", label: "Calendário", Icone: CalendarDays },
];

export function TrackerBoard({ meEmail, podeVerEquipe }: { meEmail: string; podeVerEquipe: boolean }) {
  const [aba, setAba] = useState<Aba>("tracker");
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(meEmail);
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);

  useEffect(() => {
    fetch("/api/tarefas").then((r) => r.json()).then((d) => setTarefas(d.tasks ?? [])).catch(() => {});
    // A lista de usuários só serve ao filtro de equipe e à coluna "Usuário".
    if (podeVerEquipe) {
      fetch("/api/usuarios").then((r) => r.json()).then((d) => setUsuarios(d.usuarios ?? [])).catch(() => {});
    }
  }, [podeVerEquipe]);

  const nomeDe = useMemo(() => {
    const map = new Map(usuarios.map((u) => [u.email, u.name]));
    return (email: string) => map.get(email) ?? email;
  }, [usuarios]);

  const mostrarUsuario = usuarioSelecionado !== meEmail;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Abas */}
        <div className="sem-barra-rolagem flex overflow-x-auto border-b border-slate-200 dark:border-slate-700">
          {ABAS.map(({ id, label, Icone }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              aria-current={aba === id ? "page" : undefined}
              /* `inline-flex` explícito: o `gap-1.5` dependia do `.toque`, que
                 só existe dentro da media query de dedo. No desktop a aba
                 ficava `display:block` — e o preflight do Tailwind torna todo
                 <svg> um bloco, então o ícone caía numa linha própria, colado
                 no rótulo, em vez de ficar ao lado dele. */
              className={`toque -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                aba === id
                  ? "border-gta-indigo text-gta-indigo dark:border-indigo-400 dark:text-indigo-300"
                  /* `slate-600`: em `slate-500` a aba inativa ficava em 4,4:1
                     sobre o fundo claro, logo abaixo do mínimo — e aba é
                     navegação, não texto secundário. */
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-gta-navy dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icone className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {podeVerEquipe && (
          <div className="shrink-0">
            <label className="sr-only" htmlFor="tracker-usuario">Usuário</label>
            <select
              id="tracker-usuario"
              className="field-input w-full sm:!w-auto"
              value={usuarioSelecionado}
              onChange={(e) => setUsuarioSelecionado(e.target.value)}
            >
              <option value={meEmail}>Eu ({nomeDe(meEmail)})</option>
              <option value="todos">Toda a equipe</option>
              {usuarios.filter((u) => u.email !== meEmail).map((u) => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {aba === "tracker" && (
        <AbaTracker
          meEmail={meEmail}
          usuarioSelecionado={usuarioSelecionado}
          tarefas={tarefas}
          usuarios={usuarios}
          nomeDe={nomeDe}
        />
      )}
      {aba === "dashboard" && <AbaDashboard usuarioSelecionado={usuarioSelecionado} />}
      {aba === "relatorios" && (
        <AbaRelatorios usuarioSelecionado={usuarioSelecionado} nomeDe={nomeDe} mostrarUsuario={mostrarUsuario} />
      )}
      {aba === "calendario" && (
        <AbaCalendario
          usuarioSelecionado={usuarioSelecionado}
          usuarios={usuarios}
          nomeDe={nomeDe}
          mostrarUsuario={mostrarUsuario}
        />
      )}
    </div>
  );
}
