"use client";

import { useEffect, useState } from "react";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade } from "@/lib/capacidade/types";
import { fimJanelaCurta, fimJanelaLonga, ymd, type Ymd } from "@/lib/capacidade/datas";

/** Ponte entre a tela e o motor de capacidade (que é puro e não faz fetch). */

/**
 * Parâmetros de planejamento vigentes.
 *
 * Falha vira o padrão em vez de erro na tela: a indicação de responsável é um
 * auxílio, e abrir uma tarefa precisa continuar funcionando mesmo sem ela.
 *
 * Em compensação, a falha é REGISTRADA no console. Sem isso, uma rota renomeada
 * degrada em silêncio — a tela continua de pé, mas com o catálogo vazio e as
 * durações perdidas, e ninguém descobre até um prazo sair errado.
 */
export function useCapacidade() {
  const [config, setConfig] = useState<ConfigCapacidade>(CONFIG_CAPACIDADE_PADRAO);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/planejamento")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (vivo && d?.config) setConfig(d.config);
      })
      .catch((e) => {
        console.error("Planejamento: falha ao carregar os parâmetros, usando o padrão —", e);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // `setConfig` sai daqui para a tela poder refletir um cadastro feito no meio
  // do caminho (um tipo de demanda novo, por exemplo) sem recarregar tudo.
  return { config, carregando, setConfig };
}

/**
 * "Hoje" no fuso local. Fica aqui, e não no motor, justamente para o motor
 * continuar sem relógio — é o que torna o cálculo testável com data fixa.
 */
export function hojeYmd(): Ymd {
  return ymd(new Date());
}

/** As janelas de ocupação: próximos 7 e 30 dias, a partir de hoje. */
export function janelasDe(hoje: Ymd) {
  return { fimSemana: fimJanelaCurta(hoje), fimMes: fimJanelaLonga(hoje) };
}

/** Texto em horas → minutos. Vazio = 0 (não informado). */
export function horasParaMin(txt: string): number {
  const t = txt.trim().replace(",", ".");
  if (t === "") return 0;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 60);
}

/** Minutos → texto para o input de horas. `0` vira vazio (é "não informado"). */
export function minParaHoras(min: number): string {
  if (!min) return "";
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : String(Number(h.toFixed(2)));
}

/** "6 h" / "1,5 h" / "45 min" — para leitura corrida dentro de uma frase. */
export function fmtHoras(min: number): string {
  if (min <= 0) return "0 h";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

/** "11/08" a partir de yyyy-mm-dd. */
export function fmtData(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

/** Cor da ocupação. `null` (sem capacidade) é neutro, não verde. */
export function tomDaOcupacao(pct: number | null): "slate" | "green" | "amber" | "red" {
  if (pct === null) return "slate";
  if (pct > 100) return "red";
  if (pct >= 85) return "amber";
  return "green";
}
