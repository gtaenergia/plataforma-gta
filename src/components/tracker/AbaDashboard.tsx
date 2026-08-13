"use client";

import { useMemo, useState } from "react";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, SectionCard, Segmented } from "@/components/ui";
import { fatiarPorDia, ymdLocal } from "@/lib/tracker/dias";
import { formatarDuracao, type TimeEntry } from "@/lib/tracker/types";
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

  /** Os dias do período, em `ymd` — define o que é "dentro". */
  const diasDoPeriodo = useMemo(() => {
    const lista: Date[] = [];
    for (let d = new Date(desde); d < ate; d = addDias(d, 1)) lista.push(new Date(d));
    return lista;
  }, [desde, ate]);

  /**
   * Os minutos DESTE período, somados a partir das MESMAS fatias que alimentam
   * o gráfico. Um turno de 31/08 22:00 a 01/09 02:00 entrega 2 h para agosto e
   * 2 h para setembro — antes agosto recebia as quatro e setembro nenhuma.
   *
   * Vem das fatias, e não de uma medida própria do intervalo, porque as duas
   * arredondam em pontos diferentes: o KPI "Total" e as barras "Por cliente"
   * apareciam lado a lado com minutos de diferença, e as porcentagens dos
   * clientes passavam de 100%.
   */
  const min = useMemo(() => {
    const dentro = new Set(diasDoPeriodo.map(ymdLocal));
    return (e: TimeEntry) =>
      fatiarPorDia(e, agora).reduce((s, f) => s + (dentro.has(f.dia) ? f.min : 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `agora` é recriado a cada render de propósito
  }, [diasDoPeriodo]);

  /** Um bucket por dia do período — dias sem lançamento aparecem zerados. */
  const porDia = useMemo(() => {
    const dias = diasDoPeriodo.map((data) => ({ data, min: 0 }));
    const indice = new Map(diasDoPeriodo.map((d, i) => [ymdLocal(d), i]));
    for (const e of entradas) {
      for (const fatia of fatiarPorDia(e, agora)) {
        const i = indice.get(fatia.dia);
        if (i !== undefined) dias[i].min += fatia.min;
      }
    }
    return dias;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `agora` é recriado a cada render de propósito
  }, [entradas, diasDoPeriodo]);

  /** Soma das mesmas fatias: por construção, fecha com "Por cliente". */
  const totalMin = porDia.reduce((s, d) => s + d.min, 0);

  const maxDia = Math.max(1, ...porDia.map((d) => d.min));
  const porCliente = useMemo(() => agruparPor(entradas, (e) => e.cliente, min).slice(0, 8), [entradas, min]);
  const porCategoria = useMemo(() => agruparPor(entradas, (e) => e.categoria, min).slice(0, 8), [entradas, min]);
  /** Lançamentos com ao menos um minuto dentro do período. */
  const lancamentos = useMemo(() => entradas.filter((e) => min(e) > 0).length, [entradas, min]);
  const mediaDiaria = porDia.filter((d) => d.min > 0).length > 0
    ? Math.round(totalMin / porDia.filter((d) => d.min > 0).length)
    : 0;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium capitalize text-gta-navy dark:text-slate-100">{rotulo}</span>
        <Segmented
          aria="Período"
          value={periodo}
          onChange={setPeriodo}
          options={[{ value: "semana", label: "Esta semana" }, { value: "mes", label: "Este mês" }]}
        />
      </div>

      <KpiGrid>
        <Kpi label="Total" value={formatarDuracao(totalMin)} destaque />
        <Kpi label="Lançamentos" value={String(lancamentos)} />
        <Kpi label="Dias com registro" value={String(porDia.filter((d) => d.min > 0).length)} />
        <Kpi label="Média por dia trabalhado" value={formatarDuracao(mediaDiaria)} />
      </KpiGrid>

      {carregando ? (
        <Loading />
      ) : entradas.length === 0 ? (
        <EmptyState>Nenhum lançamento neste período.</EmptyState>
      ) : (
        <>
          <SectionCard title="Horas por dia">
            {/* Barras em CSS puro — sem lib de gráfico, mesmo padrão do resto do projeto. */}
            <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 160 }}>
              {porDia.map((d, i) => (
                <div key={i} className="flex min-w-[36px] flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                    {d.min > 0 ? horasDecimais(d.min) : ""}
                  </span>
                  <div
                    className={`w-full rounded-t ${d.min > 0 ? "bg-gta-indigo" : "bg-slate-100 dark:bg-slate-800"}`}
                    style={{ height: `${Math.max(d.min > 0 ? 4 : 2, (d.min / maxDia) * 110)}px` }}
                    title={`${fmtCurta(d.data)}: ${formatarDuracao(d.min)}`}
                  />
                  <span className="text-[10px] text-slate-600 dark:text-slate-400">
                    {DIA_SEMANA_CURTO[d.data.getDay()]}
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">{fmtCurta(d.data)}</span>
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
  if (itens.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">Sem dados.</p>;
  return (
    <div className="space-y-2">
      {itens.map((it) => {
        const pct = total > 0 ? Math.round((it.min / total) * 100) : 0;
        return (
          <div key={it.nome}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">{it.nome}</span>
              <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
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
