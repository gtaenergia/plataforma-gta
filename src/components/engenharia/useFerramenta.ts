"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast, type EstadoSalvo } from "./comum";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";

/**
 * Estado de uma ferramenta (risco ou quadro) com salvamento automático.
 *
 * - Toda alteração vai na hora para um rascunho local (localStorage) e, 1,5 s
 *   depois da última, para o servidor.
 * - Ao abrir, se houver rascunho local mais novo que o salvo no servidor (a
 *   aba fechou antes de salvar, a rede caiu), a tela oferece recuperar.
 * - Ctrl+S salva na hora.
 */
export function useFerramenta<T>({
  projetoId,
  chave,
  inicial,
  salvoEm: salvoInicial,
}: {
  projetoId: string;
  chave: "risco" | "quadro";
  inicial: T;
  salvoEm: string;
}) {
  const [valor, setValorBruto] = useState<T>(inicial);
  const [estado, setEstado] = useState<EstadoSalvo>("salvo");
  const [salvoEm, setSalvoEm] = useState<string | null>(salvoInicial);
  const [rascunho, setRascunho] = useState<{ valor: T; em: string } | null>(null);
  const chaveLocal = `gta-eng:${projetoId}:${chave}`;
  const ultimo = useRef<T>(inicial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emVoo = useRef(false);
  const deNovo = useRef(false);

  // Rascunho local mais novo que o servidor?
  useEffect(() => {
    try {
      const bruto = localStorage.getItem(chaveLocal);
      if (!bruto) return;
      const r = JSON.parse(bruto) as { valor: T; em: string };
      if (r.em > salvoInicial && JSON.stringify(r.valor) !== JSON.stringify(inicial)) setRascunho(r);
      else localStorage.removeItem(chaveLocal);
    } catch {
      /* armazenamento indisponível */
    }
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const salvar = useCallback(
    async (manual = false) => {
      if (timer.current) clearTimeout(timer.current);
      if (emVoo.current) {
        deNovo.current = true;
        return;
      }
      emVoo.current = true;
      setEstado("salvando");
      const enviado = ultimo.current;
      try {
        const res = await fetch(`/api/engenharia/projetos/${projetoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [chave]: enviado }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Falha ao salvar.");
        setSalvoEm(j.projeto?.atualizadoEm ?? new Date().toISOString());
        if (ultimo.current === enviado) {
          setEstado("salvo");
          try {
            localStorage.removeItem(chaveLocal);
          } catch {
            /* ignora */
          }
        } else setEstado("pendente");
        if (manual) toast("Projeto salvo.");
      } catch (e) {
        setEstado("erro");
        toast(e instanceof Error ? e.message : "Falha ao salvar.", "erro");
      } finally {
        emVoo.current = false;
        if (deNovo.current) {
          deNovo.current = false;
          void salvar();
        }
      }
    },
    [chave, chaveLocal, projetoId],
  );

  const setValor = useCallback(
    (fn: T | ((v: T) => T)) => {
      setValorBruto((atual) => {
        const novo = typeof fn === "function" ? (fn as (v: T) => T)(atual) : fn;
        ultimo.current = novo;
        try {
          localStorage.setItem(chaveLocal, JSON.stringify({ valor: novo, em: new Date().toISOString() }));
        } catch {
          /* cheio ou indisponível: o servidor ainda recebe */
        }
        return novo;
      });
      setEstado("pendente");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void salvar(), 1500);
    },
    [chaveLocal, salvar],
  );

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void salvar(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [salvar]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useAvisoNaoSalvo(estado === "pendente" || estado === "salvando" || estado === "erro");

  const recuperar = useCallback(() => {
    if (!rascunho) return;
    setValor(rascunho.valor);
    setRascunho(null);
    toast("Rascunho recuperado.", "info");
  }, [rascunho, setValor]);

  const descartar = useCallback(() => {
    setRascunho(null);
    try {
      localStorage.removeItem(chaveLocal);
    } catch {
      /* ignora */
    }
  }, [chaveLocal]);

  return { valor, setValor, estado, salvoEm, salvar: () => salvar(true), rascunho, recuperar, descartar };
}
