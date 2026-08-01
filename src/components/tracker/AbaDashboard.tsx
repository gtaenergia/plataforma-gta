"use client";

import { useMemo, useState } from "react";
import { EmptyState, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import { duracaoMin, formatarDuracao, type TimeEntry } from "@/lib/tracker/types";
import {
  addDias, agruparPor, DIA_SEMANA_CURTO, fmtCurta, horasDecimais, inicioDoMes, segundaDaSemana, useEntradas,
} from "./comum";

type Periodo = "semana" | "mes";

/** Visão agregada do período: por dia, por cliente e por categoria. */
export function AbaDashboard({ usuarioSelecionado }: { usuarioSelecionado: string }) {
  const [periodo, setPeriodo] = useState<Periodo>("semana");

  const { desde, ate, rotulo } = useMemo(() => {
    const hoje = new Date();
    if (periodo === "semana") {
      const ini = segundaDaSemana(hoje);
      return { desde: ini, ate: addDias(ini, 7), rotulo: `${fmtCurta(ini)} – ${fmtCurta(addDias(ini, 6))}` };
    }
    const ini = inicioDoMes(hoje);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
    return { desde: ini, ate: fim, rotulo: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }, [periodo]);

  const { entradas, carregando, erro } = useEntradas(desde, ate, usuarioSelecionado);
  const agora = new Date();
  const min = (e: TimeEntry) => duracaoMin(e, agora);

  const totalMin = entradas.reduce((s, e) => s + min(e), 0);

  /** Um bucket por dia do período — dias sem lançamento aparecem zerados. */
  const porDia = useMemo(() => {
    const dias: { data: Date; min: number }[] = [];
    for (let d = new Date(desde); d < ate; d = addDias(d, 1)) dias.push({ data: new Date(d), min: 0 });
    for (const e of entradas) {
      const inicio = new Date(e.inicio);
      const i = dias.findIndex((x) => x.data.toDateString() === inicio.toDateString());
      if (i >= 0) dias[i].min += min(e);
    }
    return dias;
  }, [entradas, desde, ate]);

  const maxDia = Math.max(1, ...porDia.map((d) => d.min));
  const porCliente = useMemo(() => agruparPor(entradas, (e) => e.cliente, min).slice(0, 8), [entradas]);
  const porCategoria = useMemo(() => agruparPor(entradas, (e) => e.categoria, min).slice(0, 8), [entradas]);
  const mediaDiaria = porDia.filter((d) => d.min > 0).length > 0
    ? Math.round(totalMin / porDia.filter((d) => d.min > 0).length)
    : 0;

  return (
    <div className="space-y-6">
      {erro && <p className="field-error">{erro}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium capitalize text-gta-navy dark:text-slate-100">{rotulo}</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {(["semana", "mes"] as Periodo[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodo(p)}
              className={`toque justify-center rounded-md px-3 py-1 font-medium transition ${periodo === p ? "bg-gta-indigo text-white" : "text-slate-500 hover:text-gta-indigo dark:text-slate-400"}`}
            >
              {p === "semana" ? "Esta semana" : "Este mês"}
            </button>
          ))}
        </div>
      </div>

      <KpiGrid>
        <Kpi label="Total" value={formatarDuracao(totalMin)} destaque />
        <Kpi label="Lançamentos" value={String(entradas.length)} />
        <Kpi label="Dias com registro" value={String(porDia.filter((d) => d.min > 0).length)} />
        <Kpi label="Média por dia trabalhado" value={formatarDuracao(mediaDiaria)} />
      </KpiGrid>

      {carregando ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Carregando…</p>
      ) : entradas.length === 0 ? (
        <EmptyState>Nenhum lançamento neste período.</EmptyState>
      ) : (
        <>
          <SectionCard title="Horas por dia">
            {/* Barras em CSS puro — sem lib de gráfico, mesmo padrão do resto do projeto. */}
            <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 160 }}>
              {porDia.map((d, i) => (
                <div key={i} className="flex min-w-[36px] flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                    {d.min > 0 ? horasDecimais(d.min) : ""}
                  </span>
                  <div
                    className={`w-full rounded-t ${d.min > 0 ? "bg-gta-indigo" : "bg-slate-100 dark:bg-slate-800"}`}
                    style={{ height: `${Math.max(d.min > 0 ? 4 : 2, (d.min / maxDia) * 110)}px` }}
                    title={`${fmtCurta(d.data)}: ${formatarDuracao(d.min)}`}
                  />
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {DIA_SEMANA_CURTO[d.data.getDay()]}
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{fmtCurta(d.data)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard title="Por cliente">
              <ListaProporcional itens={porCliente} total={totalMin} />
            </SectionCard>
            <SectionCard title="Por categoria">
              <ListaProporcional itens={porCategoria} total={totalMin} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

/** Lista com barra proporcional ao total — leitura rápida de "onde foi o tempo". */
function ListaProporcional({ itens, total }: { itens: { nome: string; min: number }[]; total: number }) {
  if (itens.length === 0) return <p className="text-sm text-slate-400 dark:text-slate-500">Sem dados.</p>;
  return (
    <div className="space-y-2">
      {itens.map((it) => {
        const pct = total > 0 ? Math.round((it.min / total) * 100) : 0;
        return (
          <div key={it.nome}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">{it.nome}</span>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                {formatarDuracao(it.min)} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-gta-indigo" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
