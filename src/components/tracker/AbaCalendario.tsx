"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { duracaoMin, formatarDuracao, type TimeEntry } from "@/lib/tracker/types";
import { addDias, DIA_SEMANA_CURTO, fmtCurta, segundaDaSemana, useEntradas } from "./comum";

/** Altura de uma hora na grade, em px. */
const PX_POR_HORA = 44;

/**
 * Grade semanal: 7 colunas (dias) × horas, com cada lançamento posicionado
 * pelo horário real. A faixa de horas exibida se adapta aos lançamentos da
 * semana (nunca menor que 8h–18h) para não mostrar madrugada vazia à toa.
 */
export function AbaCalendario({ usuarioSelecionado, nomeDe, mostrarUsuario }: {
  usuarioSelecionado: string;
  nomeDe: (email: string) => string;
  mostrarUsuario: boolean;
}) {
  const [semanaBase, setSemanaBase] = useState(() => segundaDaSemana(new Date()));
  const semanaFim = useMemo(() => addDias(semanaBase, 7), [semanaBase]);
  const { entradas, carregando, erro } = useEntradas(semanaBase, semanaFim, usuarioSelecionado);
  const agora = new Date();

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(semanaBase, i)), [semanaBase]);

  /** Faixa de horas a exibir, ajustada aos lançamentos (mín. 8h–18h). */
  const { horaIni, horaFim } = useMemo(() => {
    let min = 8;
    let max = 18;
    for (const e of entradas) {
      const ini = new Date(e.inicio);
      const fim = e.fim ? new Date(e.fim) : agora;
      min = Math.min(min, ini.getHours());
      max = Math.max(max, fim.getHours() + (fim.getMinutes() > 0 ? 1 : 0));
    }
    return { horaIni: Math.max(0, min), horaFim: Math.min(24, Math.max(max, min + 1)) };
  }, [entradas]);

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaIni }, (_, i) => horaIni + i),
    [horaIni, horaFim],
  );

  /** Lançamentos de um dia, com posição/altura já calculadas. */
  function blocosDoDia(dia: Date) {
    return entradas
      .filter((e) => new Date(e.inicio).toDateString() === dia.toDateString())
      .map((e) => {
        const ini = new Date(e.inicio);
        const fim = e.fim ? new Date(e.fim) : agora;
        const inicioMin = ini.getHours() * 60 + ini.getMinutes() - horaIni * 60;
        const durMin = Math.max(1, (fim.getTime() - ini.getTime()) / 60000);
        return {
          entrada: e,
          top: (inicioMin / 60) * PX_POR_HORA,
          // piso de 18px para um lançamento curto continuar clicável/legível
          altura: Math.max(18, (durMin / 60) * PX_POR_HORA),
        };
      });
  }

  const totalSemana = entradas.reduce((s, e) => s + duracaoMin(e, agora), 0);

  return (
    <div className="space-y-4">
      {erro && <p className="field-error">{erro}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => setSemanaBase((d) => addDias(d, -7))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-medium text-gta-navy dark:text-slate-100">
            {fmtCurta(semanaBase)} – {fmtCurta(addDias(semanaBase, 6))}
          </span>
          <button type="button" className="icon-btn" onClick={() => setSemanaBase((d) => addDias(d, 7))} aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="toque text-xs text-gta-indigo hover:underline" onClick={() => setSemanaBase(segundaDaSemana(new Date()))}>
            Esta semana
          </button>
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Total da semana: <strong className="text-gta-navy dark:text-slate-100">{formatarDuracao(totalSemana)}</strong>
        </span>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Carregando…</p>
      ) : entradas.length === 0 ? (
        <EmptyState>Nenhum lançamento nesta semana.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-3">
          {/* min-w garante que a grade role lateralmente no celular em vez de espremer. */}
          <div className="min-w-[640px]">
            <div className="flex">
              {/* régua de horas */}
              <div className="w-12 shrink-0" aria-hidden>
                <div className="h-8" />
                {horas.map((h) => (
                  <div key={h} className="relative text-[10px] tabular-nums text-slate-400 dark:text-slate-500" style={{ height: PX_POR_HORA }}>
                    <span className="absolute -top-1.5 right-1">{String(h).padStart(2, "0")}h</span>
                  </div>
                ))}
              </div>

              {dias.map((dia, i) => {
                const ehHoje = dia.toDateString() === new Date().toDateString();
                const totalDia = entradas
                  .filter((e) => new Date(e.inicio).toDateString() === dia.toDateString())
                  .reduce((s, e) => s + duracaoMin(e, agora), 0);
                return (
                  <div key={i} className="min-w-0 flex-1 border-l border-slate-100 dark:border-slate-800">
                    <div className={`h-8 px-1 text-center ${ehHoje ? "text-gta-indigo" : "text-slate-500 dark:text-slate-400"}`}>
                      <div className="text-[11px] font-semibold">{DIA_SEMANA_CURTO[dia.getDay()]} {fmtCurta(dia)}</div>
                      <div className="text-[10px] tabular-nums">{totalDia > 0 ? formatarDuracao(totalDia) : ""}</div>
                    </div>
                    <div className="relative" style={{ height: horas.length * PX_POR_HORA }}>
                      {/* linhas de hora */}
                      {horas.map((h) => (
                        <div key={h} className="border-t border-slate-100 dark:border-slate-800" style={{ height: PX_POR_HORA }} />
                      ))}
                      {blocosDoDia(dia).map(({ entrada, top, altura }) => (
                        <div
                          key={entrada.id}
                          className={`absolute inset-x-0.5 overflow-hidden rounded px-1 py-0.5 text-[10px] leading-tight text-white ${entrada.billable ? "bg-green-600" : "bg-gta-indigo"} ${!entrada.fim ? "animate-pulse" : ""}`}
                          style={{ top, height: altura }}
                          title={`${entrada.descricao || "(sem descrição)"}${mostrarUsuario ? ` — ${nomeDe(entrada.usuarioEmail)}` : ""}\n${formatarDuracao(duracaoMin(entrada, agora))}${entrada.cliente ? `\n${entrada.cliente}` : ""}`}
                        >
                          <div className="truncate font-medium">{entrada.descricao || "(sem descrição)"}</div>
                          {altura > 30 && entrada.cliente && <div className="truncate opacity-80">{entrada.cliente}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-gta-indigo" /> Não faturável</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-600" /> Faturável</span>
            <span>Pisca = cronômetro em andamento</span>
          </p>
        </div>
      )}
    </div>
  );
}
