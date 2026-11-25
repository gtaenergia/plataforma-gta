"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CircleAlert, Cloud, CloudOff, Loader2, X } from "lucide-react";
import type { Parametro } from "@/lib/engenharia/risco/tabelas";
import type { DadosProjeto } from "@/lib/engenharia/tipos";
import { fmtData, fmtParam } from "@/lib/engenharia/formato";

// ------------------------------------------------------------------ toasts

type Toast = { id: number; texto: string; tom: "ok" | "erro" | "info" };
let toasts: Toast[] = [];
const ouvintes = new Set<() => void>();
let seqToast = 0;
const avisar = () => ouvintes.forEach((f) => f());

export function toast(texto: string, tom: Toast["tom"] = "ok") {
  const id = ++seqToast;
  toasts = [...toasts, { id, texto, tom }];
  avisar();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    avisar();
  }, tom === "erro" ? 6000 : 3200);
}

export function Toasts() {
  const lista = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {lista.map((t) => (
        <div
          key={t.id}
          role={t.tom === "erro" ? "alert" : "status"}
          className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
            t.tom === "erro"
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              : t.tom === "info"
                ? "border-indigo-200 bg-white text-gta-navy dark:border-indigo-800 dark:bg-slate-800 dark:text-slate-100"
                : "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
          }`}
        >
          {t.tom === "erro" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{t.texto}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ campos

/**
 * Campo numérico que aceita vírgula e guarda `null` quando vazio. O texto
 * digitado é mantido enquanto o foco está no campo — senão "0," viraria "0"
 * no meio da digitação.
 */
export function NumInput({
  value,
  onChange,
  id,
  min,
  max,
  placeholder,
  className = "",
  sufixo,
  disabled,
  ariaLabel,
  largura,
}: {
  largura?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  id?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  sufixo?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const mostrado = texto ?? (value == null || !Number.isFinite(value) ? "" : String(value).replace(".", ","));
  const input = (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`field-input ${className}`}
      // Padding inline: o `.field-input` vem depois dos utilitários no CSS e
      // venceria um `pr-*`, deixando o número correr por baixo da unidade.
      style={{
        ...(sufixo ? { paddingRight: `${Math.max(2.5, sufixo.length * 0.45 + 1.2)}rem` } : {}),
        ...(largura ? { width: largura, paddingLeft: "0.5rem", paddingRight: "0.5rem" } : {}),
      }}
      value={mostrado}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setTexto(mostrado)}
      onBlur={() => setTexto(null)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d,.\-eE]/g, "");
        setTexto(t);
        if (!t.trim()) return onChange(null);
        const n = Number(t.replace(/\./g, (m, off, s: string) => (s.includes(",") ? "" : m)).replace(",", "."));
        if (!Number.isFinite(n)) return;
        let v = n;
        if (min != null && v < min) v = min;
        if (max != null && v > max) v = max;
        onChange(v);
      }}
    />
  );
  if (!sufixo) return input;
  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 dark:text-slate-400">{sufixo}</span>
    </div>
  );
}

/** Rótulo com símbolo e referência de tabela, padrão das duas ferramentas. */
export function Rotulo({ simbolo, nome, refNorma }: { simbolo?: string; nome: ReactNode; refNorma?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      {simbolo && <span className="rounded bg-gta-indigo/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-gta-indigo dark:bg-indigo-500/20 dark:text-indigo-300">{simbolo}</span>}
      <span>{nome}</span>
      {refNorma && <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">· {refNorma}</span>}
    </span>
  );
}

/** Menu de um parâmetro tabelado: opção + valor ao lado. */
export function CampoParametro({
  param,
  value,
  onChange,
  id,
  className = "",
}: {
  param: Parametro;
  value: string;
  onChange: (id: string) => void;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const htmlId = id ?? auto;
  const atual = param.opcoes.find((o) => o.id === value) ?? param.opcoes[0];
  return (
    <div className={className} id={id ? `${id}-wrap` : undefined}>
      <label htmlFor={htmlId} className="field-label">
        <Rotulo simbolo={param.simbolo} nome={param.nome} refNorma={param.ref} />
      </label>
      <div className="flex items-stretch gap-2">
        <select id={htmlId} className="field-input min-w-0 flex-1" value={atual.id} onChange={(e) => onChange(e.target.value)}>
          {param.opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <span className="flex min-w-[64px] items-center justify-center rounded-md bg-slate-100 px-2 font-mono text-sm font-semibold text-gta-navy dark:bg-slate-700 dark:text-slate-100" title="Valor adotado">
          {fmtParam(atual.valor)}
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ assistente

export interface EtapaDef<K extends string> {
  id: K;
  rotulo: string;
  status: "completa" | "pendente" | "resultado";
  bloqueada?: boolean;
}

export function Stepper<K extends string>({ etapas, atual, onIr }: { etapas: EtapaDef<K>[]; atual: K; onIr: (k: K) => void }) {
  return (
    <nav aria-label="Etapas" className="overflow-x-auto">
      <ol className="flex min-w-max items-stretch gap-1">
        {etapas.map((e, i) => {
          const ativa = e.id === atual;
          return (
            <li key={e.id} className="flex items-center">
              <button
                type="button"
                // Bloqueada continua clicável: o clique abre a lista do que falta.
                aria-disabled={e.bloqueada || undefined}
                onClick={() => onIr(e.id)}
                aria-current={ativa ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition aria-disabled:opacity-60 ${
                  ativa
                    ? "border-gta-indigo bg-gta-indigo/10 text-gta-navy dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-gta-indigo/60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    e.status === "completa"
                      ? "bg-green-600 text-white"
                      : e.status === "pendente"
                        ? "bg-amber-500 text-white"
                        : "bg-gta-navy text-white dark:bg-slate-600"
                  }`}
                  aria-hidden
                >
                  {e.status === "completa" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span>
                  <span className="block font-semibold leading-tight">{e.rotulo}</span>
                  <span className="block text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                    {e.status === "completa" ? "completa" : e.status === "pendente" ? "pendências" : e.bloqueada ? "bloqueada" : "liberada"}
                  </span>
                </span>
              </button>
              {i < etapas.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300 dark:bg-slate-600" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function AvisoResponsabilidade() {
  return (
    <p className="mt-10 flex items-start gap-2 rounded-lg border border-slate-200 bg-white/60 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      Ferramenta de apoio ao projeto. Os resultados devem ser conferidos e assinados pelo responsável técnico, que responde pelas premissas adotadas.
    </p>
  );
}

export function CabecalhoProjeto({ projetoId, dados, ferramenta, estado }: { projetoId: string; dados: DadosProjeto; ferramenta: string; estado?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Link href={`/engenharia/${projetoId}`} className="btn-ghost -ml-2.5 mb-1">
          <ArrowLeft className="h-4 w-4" /> {dados.nome || "Projeto"}
        </Link>
        <h1 className="page-title">{ferramenta}</h1>
        <p className="mt-1 subtitle">
          {[dados.cliente, dados.cidade || dados.endereco, fmtData(dados.data)].filter((x) => x && x !== "—").join(" · ")}
        </p>
        <p className="mt-0.5 hint">
          RT: {dados.rt.nome || <em>não informado</em>}
          {dados.rt.registro && ` · CREA/CFT ${dados.rt.registro}`}
          {dados.rt.art && ` · ART/TRT ${dados.rt.art}`}
          {dados.rt.empresa && ` · ${dados.rt.empresa}`}
        </p>
      </div>
      {estado}
    </div>
  );
}

export type EstadoSalvo = "salvo" | "pendente" | "salvando" | "erro";

export function SeloSalvo({ estado, salvoEm, onSalvar }: { estado: EstadoSalvo; salvoEm: string | null; onSalvar: () => void }) {
  const hora = salvoEm ? new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400" role="status">
        {estado === "salvando" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
          </>
        )}
        {estado === "salvo" && (
          <>
            <Cloud className="h-3.5 w-3.5 text-green-600" /> Salvo{hora ? ` às ${hora}` : ""}
          </>
        )}
        {estado === "pendente" && (
          <>
            <Cloud className="h-3.5 w-3.5 text-amber-500" /> Alterações não salvas
          </>
        )}
        {estado === "erro" && (
          <>
            <CloudOff className="h-3.5 w-3.5 text-red-600" /> Falha ao salvar
          </>
        )}
      </span>
      <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={onSalvar} title="Salvar (Ctrl+S)">
        Salvar
      </button>
    </div>
  );
}

/** Diálogo simples (sem dependências): fundo escurecido + cartão. */
export function Dialogo({ aberto, titulo, onFechar, children, largura = "max-w-lg" }: { aberto: boolean; titulo: ReactNode; onFechar: () => void; children: ReactNode; largura?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // `onFechar` chega como função nova a cada render (arrow inline em quem usa).
  // Se ela fosse dependência do efeito que dá o foco, cada tecla digitada num
  // campo do diálogo re-renderizaria, re-rodaria o efeito e devolveria o foco
  // para a caixa — a pessoa só conseguia digitar uma letra. Por isso a função
  // vai num ref, e o foco só acontece quando o diálogo ABRE.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto]);
  useEffect(() => {
    if (aberto) ref.current?.focus();
  }, [aberto]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={`max-h-[90vh] w-full ${largura} overflow-y-auto rounded-xl bg-white shadow-2xl outline-none dark:bg-slate-800`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
          <h2 className="section-title">{titulo}</h2>
          <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Rola até o campo e dá foco — usado pelos links da lista de pendências. */
export function irParaCampo(id: string) {
  setTimeout(() => {
    const el = document.getElementById(id) ?? document.getElementById(`${id}-wrap`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const foco = el.matches("input,select,textarea,button") ? el : el.querySelector<HTMLElement>("input,select,textarea,button");
    foco?.focus({ preventScroll: true });
    el.classList.add("ring-2", "ring-amber-400", "rounded-md");
    setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "rounded-md"), 1800);
  }, 80);
}

/** Selo de verificação: ok / falha / sem dados. */
export function SeloVerif({ v, rotulo }: { v: "ok" | "falha" | "sem-dados"; rotulo?: string }) {
  const cls =
    v === "ok"
      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      : v === "falha"
        ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  const txt = v === "ok" ? "OK" : v === "falha" ? "Não atende" : "Faltam dados";
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {rotulo ? `${rotulo}: ` : ""}
      {txt}
    </span>
  );
}
