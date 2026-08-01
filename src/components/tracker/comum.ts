"use client";

import { useCallback, useEffect, useState } from "react";
import type { TimeEntry } from "@/lib/tracker/types";

/** Helpers de data e busca compartilhados pelas abas do Tracker. */

/** Segunda-feira 00:00 LOCAL da semana que contém `d`. */
export function segundaDaSemana(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const diaSemana = r.getDay(); // 0=dom ... 6=sáb
  r.setDate(r.getDate() + (diaSemana === 0 ? -6 : 1 - diaSemana));
  return r;
}

export function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Primeiro dia do mês de `d`, 00:00 local. */
export function inicioDoMes(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), 1);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** "2026-08-01" no fuso LOCAL (não UTC — evita o dia "voltar" no Brasil). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "01/08" */
export function fmtCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const DIA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export const DIA_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "01:23:45" — cronômetro ao vivo, precisão de segundo. */
export function formatarHMS(totalSeg: number): string {
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** "8,5h" — para eixos e totais compactos. */
export function horasDecimais(min: number): string {
  return (min / 60).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "h";
}

export interface Usuario {
  email: string;
  name: string;
}

/**
 * Busca lançamentos de um intervalo. `recarregar` permite atualizar a lista
 * depois de criar/editar/excluir sem remontar o componente.
 */
export function useEntradas(desde: Date, ate: Date, usuario: string) {
  const [entradas, setEntradas] = useState<TimeEntry[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const desdeISO = desde.toISOString();
  const ateISO = ate.toISOString();

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({ desde: desdeISO, ate: ateISO, usuario });
      const res = await fetch(`/api/tracker?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setEntradas(data.entradas ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os lançamentos.");
    } finally {
      setCarregando(false);
    }
  }, [desdeISO, ateISO, usuario]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  return { entradas, carregando, erro, recarregar, setEntradas };
}

/** Agrupa por uma chave e soma os minutos, maior primeiro. */
export function agruparPor(
  entradas: TimeEntry[],
  chave: (e: TimeEntry) => string,
  minutos: (e: TimeEntry) => number,
): { nome: string; min: number }[] {
  const mapa = new Map<string, number>();
  for (const e of entradas) {
    const k = chave(e) || "(sem)";
    mapa.set(k, (mapa.get(k) ?? 0) + minutos(e));
  }
  return [...mapa.entries()].map(([nome, min]) => ({ nome, min })).sort((a, b) => b.min - a.min);
}
