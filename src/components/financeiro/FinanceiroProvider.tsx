"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { hojeLocal } from "@/lib/financeiro/datas";
import { contasPorDia, eventos, meses, projetar, type DiaCaixa, type DiaDeConta, type Evento, type MesCaixa } from "@/lib/financeiro/motor";
import type { ConfigFinanceiro, HistoricoBanco, Lancamento, ReceitaCrm, Recorrente, SaldoConferido } from "@/lib/financeiro/tipos";

/**
 * Estado compartilhado das telas do Financeiro.
 *
 * Mora no layout de /financeiro, então trocar de aba não busca tudo de novo.
 * No artefato os dados chegavam em tempo real; aqui a tela pergunta de novo a
 * cada 30 segundos (só com a aba visível) e ao voltar para a janela — o
 * bastante para três sócios lançando no mesmo dia verem o lançamento um do
 * outro sem recarregar.
 *
 * Os cálculos (projeção, mês a mês, contas por dia) rodam aqui, no navegador,
 * com o "hoje" de quem está olhando — como no artefato.
 *
 * Cadeado: qualquer resposta 423 do servidor fecha a tela e APAGA os dados da
 * memória — o que estava na tela some, não fica atrás de um aviso. As
 * consultas automáticas só contam como uso se alguém mexeu na tela desde a
 * anterior; assim a aba esquecida aberta fecha sozinha em 30 minutos.
 */

export interface DadosBrutos {
  lanc: Lancamento[];
  rec: Recorrente[];
  saldo: SaldoConferido | null;
  historico: HistoricoBanco | null;
  config: ConfigFinanceiro;
  crm: ReceitaCrm[];
  /** Nomes de quem tem acesso (tela de Configurações). */
  acesso: string[];
  souAdmin: boolean;
}

export interface Resultado {
  ok: boolean;
  erro?: string;
  json?: Record<string, unknown>;
}

interface Ctx {
  carregado: boolean;
  erroCarga: string | null;
  dados: DadosBrutos;
  hoje: string;
  evs: Evento[];
  serie: DiaCaixa[];
  mesesCx: MesCaixa[];
  contas: DiaDeConta[];
  recarregar: () => Promise<void>;
  enviar: (url: string, metodo: string, corpo?: unknown) => Promise<Resultado>;
  pagar: (e: Evento) => Promise<Resultado>;
  desfazer: (e: Evento) => Promise<Resultado>;
  /** Abre o cartão "Conferir saldo com o banco". */
  conferindo: boolean;
  setConferindo: (v: boolean) => void;
  /** Cadeado fechado: o texto diz por quê. null = aberto. */
  bloqueio: string | null;
  abrirCadeado: (senha: string) => Promise<Resultado>;
  bloquear: () => Promise<void>;
}

const VAZIO: DadosBrutos = {
  lanc: [],
  rec: [],
  saldo: null,
  historico: null,
  config: { mapa: { d: {}, r: {} }, bens: [], prazoCrmDias: 30 },
  crm: [],
  acesso: [],
  souAdmin: false,
};

const TEXTO_FECHADO = "Digite sua senha para abrir o Financeiro.";

const Contexto = createContext<Ctx | null>(null);

export function useFinanceiro(): Ctx {
  const c = useContext(Contexto);
  if (!c) throw new Error("useFinanceiro fora do FinanceiroProvider");
  return c;
}

export function FinanceiroProvider({ children, cadeadoAberto }: { children: ReactNode; cadeadoAberto: boolean }) {
  const [dados, setDados] = useState<DadosBrutos>(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [hoje, setHoje] = useState(() => hojeLocal());
  const [conferindo, setConferindo] = useState(false);
  const [bloqueio, setBloqueio] = useState<string | null>(cadeadoAberto ? null : TEXTO_FECHADO);
  const emVoo = useRef<Promise<void> | null>(null);
  const bloqueado = useRef(!cadeadoAberto);
  /** Alguém mexeu na tela desde a última consulta automática? */
  const mexeu = useRef(true);

  /** Fecha a tela e esquece os dados. */
  const fechar = useCallback((texto: string) => {
    bloqueado.current = true;
    setBloqueio(texto || TEXTO_FECHADO);
    setDados(VAZIO);
    setCarregado(false);
    setConferindo(false);
  }, []);

  const recarregar = useCallback((automatico = false) => {
    if (bloqueado.current) return Promise.resolve();
    if (emVoo.current) return emVoo.current;
    const p = (async () => {
      try {
        // Consulta automática sem ninguém ter mexido não estica o cadeado.
        const auto = automatico && !mexeu.current;
        mexeu.current = false;
        const res = await fetch("/api/financeiro", { cache: "no-store", headers: auto ? { "x-fin-auto": "1" } : undefined });
        const json = await res.json().catch(() => ({}));
        if (res.status === 423) {
          fechar(json.error);
          return;
        }
        if (!res.ok) {
          setErroCarga(json.error ?? "Não foi possível carregar os dados do Financeiro.");
          return;
        }
        setDados({
          lanc: json.lanc ?? [],
          rec: json.rec ?? [],
          saldo: json.saldo ?? null,
          historico: json.historico ?? null,
          config: json.config ?? VAZIO.config,
          crm: json.crm ?? [],
          acesso: json.acesso ?? [],
          souAdmin: json.souAdmin === true,
        });
        setErroCarga(null);
        setCarregado(true);
        setHoje(hojeLocal());
      } catch {
        setErroCarga("A conexão caiu. O que aparece pode estar desatualizado; a tela tenta de novo sozinha.");
      } finally {
        emVoo.current = null;
      }
    })();
    emVoo.current = p;
    return p;
  }, [fechar]);

  useEffect(() => {
    void recarregar();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void recarregar(true);
    }, 30000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void recarregar(true);
    };
    const uso = () => {
      mexeu.current = true;
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"] as const) window.addEventListener(ev, uso, { passive: true });
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
      for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"] as const) window.removeEventListener(ev, uso);
    };
  }, [recarregar]);

  const enviar = useCallback(
    async (url: string, metodo: string, corpo?: unknown): Promise<Resultado> => {
      try {
        const res = await fetch(url, {
          method: metodo,
          headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
          body: corpo === undefined ? undefined : JSON.stringify(corpo),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 423) {
          fechar(json.error);
          return { ok: false, erro: json.error ?? TEXTO_FECHADO, json };
        }
        if (!res.ok) {
          const extra = Array.isArray(json.problemas) ? " " + (json.problemas as string[]).slice(0, 5).join(" · ") : "";
          return { ok: false, erro: (json.error ?? "Não foi possível salvar agora. Tente de novo em instantes.") + extra, json };
        }
        await recarregar();
        return { ok: true, json };
      } catch {
        return { ok: false, erro: "Sem conexão. Nada foi salvo." };
      }
    },
    [recarregar, fechar],
  );

  const abrirCadeado = useCallback(
    async (senha: string): Promise<Resultado> => {
      try {
        const res = await fetch("/api/financeiro/cadeado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ senha }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, erro: json.error ?? "Não foi possível abrir.", json };
        bloqueado.current = false;
        setBloqueio(null);
        mexeu.current = true;
        await recarregar();
        return { ok: true, json };
      } catch {
        return { ok: false, erro: "Sem conexão. Tente de novo." };
      }
    },
    [recarregar],
  );

  const bloquear = useCallback(async () => {
    fechar("Financeiro bloqueado. Digite sua senha para abrir de novo.");
    await fetch("/api/financeiro/cadeado", { method: "DELETE" }).catch(() => undefined);
  }, [fechar]);

  const pagar = useCallback(
    (e: Evento) => {
      if (!e.virt) return enviar(`/api/financeiro/lancamentos/${encodeURIComponent(e.id)}`, "PATCH", { pago: true, pagoEm: hojeLocal() });
      // Ocorrência de recorrente ou "falta receber" do CRM: nasce um lançamento pago no lugar.
      return enviar("/api/financeiro/lancamentos", "POST", {
        k: e.k,
        desc: e.desc,
        valor: e.valor,
        data: e.crm ? hojeLocal() : e.data,
        nat: e.nat,
        cat: e.cat,
        quem: e.quem,
        proj: e.proj,
        rec: e.rec,
        mes: e.mes,
        negociacaoId: e.negociacaoId,
        dre: e.dre,
        pago: true,
        pagoEm: hojeLocal(),
      });
    },
    [enviar],
  );

  const desfazer = useCallback(
    (e: Evento) => enviar(`/api/financeiro/lancamentos/${encodeURIComponent(e.id)}`, "PATCH", { pago: false }),
    [enviar],
  );

  const calc = useMemo(() => {
    const evs = eventos({ ...dados, prazoCrmDias: dados.config.prazoCrmDias }, hoje);
    const serie = projetar(evs, dados.saldo, hoje);
    return { evs, serie, mesesCx: meses(serie, dados.saldo), contas: contasPorDia(serie, dados.saldo, hoje) };
  }, [dados, hoje]);

  const valor: Ctx = {
    carregado,
    erroCarga,
    dados,
    hoje,
    ...calc,
    recarregar: () => recarregar(),
    enviar,
    pagar,
    desfazer,
    conferindo,
    setConferindo,
    bloqueio,
    abrirCadeado,
    bloquear,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
