"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { ClienteInput } from "@/components/clientes/ClienteInput";
import { Badge, EmptyState, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import { CATEGORIAS_PADRAO_TAREFA, type Task } from "@/lib/tasks/types";
import { duracaoMin, formatarDuracao, type TimeEntry } from "@/lib/tracker/types";

/**
 * Tracker (registro de horas), inspirado no Clockify: barra de cronômetro +
 * lançamento manual no topo, lista abaixo agrupada por dia com navegação por
 * semana. Lançamento vincula opcionalmente a uma Tarefa (herda cliente/
 * categoria dela) ou fica avulso (cliente/categoria em texto livre).
 */

interface Usuario {
  email: string;
  name: string;
}

/** Segunda-feira 00:00 LOCAL da semana que contém `d`. */
function segundaDaSemana(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const diaSemana = r.getDay(); // 0=dom ... 6=sáb
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana; // volta até a segunda
  r.setDate(r.getDate() + offset);
  return r;
}
function addDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
const DIA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** "01:23:45" — cronômetro ao vivo, precisão de segundo. */
function formatarHMS(totalSeg: number): string {
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

interface NovoForm {
  descricao: string;
  tarefaId: string; // "" = avulso
  cliente: string;
  categoria: string;
  billable: boolean;
  tagsTexto: string; // "tag1, tag2" — separado por vírgula
}
const FORM_VAZIO: NovoForm = { descricao: "", tarefaId: "", cliente: "", categoria: "", billable: false, tagsTexto: "" };

export function TrackerBoard({ meEmail, podeVerEquipe }: { meEmail: string; podeVerEquipe: boolean }) {
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [rodando, setRodando] = useState<TimeEntry | null>(null);
  const [entradas, setEntradas] = useState<TimeEntry[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);

  const [semanaBase, setSemanaBase] = useState(() => segundaDaSemana(new Date()));
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(meEmail);
  const [form, setForm] = useState<NovoForm>(FORM_VAZIO);
  const [modoManual, setModoManual] = useState(false);
  const [manual, setManual] = useState({ data: ymdLocal(new Date()), inicio: "", fim: "" });
  const [agora, setAgora] = useState(new Date());
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const nomeDe = useMemo(() => {
    const map = new Map(usuarios.map((u) => [u.email, u.name]));
    return (email: string) => map.get(email) ?? email;
  }, [usuarios]);

  // relógio do cronômetro ao vivo
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, [rodando]);

  useEffect(() => {
    fetch("/api/tarefas").then((r) => r.json()).then((d) => setTarefas(d.tasks ?? [])).catch(() => {});
    if (podeVerEquipe) {
      fetch("/api/usuarios").then((r) => r.json()).then((d) => setUsuarios(d.usuarios ?? [])).catch(() => {});
    }
    fetch("/api/tracker/rodando").then((r) => r.json()).then((d) => setRodando(d.entrada ?? null)).catch(() => {});
  }, [podeVerEquipe]);

  const semanaFim = useMemo(() => addDias(semanaBase, 7), [semanaBase]);

  async function carregarSemana() {
    setCarregando(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({
        desde: semanaBase.toISOString(),
        ate: semanaFim.toISOString(),
        usuario: usuarioSelecionado,
      });
      const res = await fetch(`/api/tracker?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar.");
      setEntradas(data.entradas ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar o tracker.");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregarSemana();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanaBase, usuarioSelecionado]);

  function setTarefaId(tarefaId: string) {
    // Tarefas antigas (importadas antes do campo `categoria` existir) podem
    // não ter a chave no registro — `?? ""` porque o tipo promete string mas
    // o dado real às vezes não cumpre.
    const t = tarefas.find((x) => x.id === tarefaId);
    setForm((f) => ({ ...f, tarefaId, cliente: t ? (t.cliente ?? "") : f.cliente, categoria: t ? (t.categoria ?? "") : f.categoria }));
  }

  function payloadBase() {
    return {
      descricao: (form.descricao || "").trim(),
      tarefaId: form.tarefaId || undefined,
      cliente: (form.cliente || "").trim(),
      categoria: (form.categoria || "").trim(),
      billable: form.billable,
      tags: (form.tagsTexto || "").split(",").map((t) => t.trim()).filter(Boolean),
    };
  }

  async function iniciar() {
    setIniciando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBase()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao iniciar.");
      setRodando(data.entrada);
      setForm(FORM_VAZIO);
      if (usuarioSelecionado === meEmail) carregarSemana();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar o cronômetro.");
    } finally {
      setIniciando(false);
    }
  }

  async function parar() {
    if (!rodando) return;
    setIniciando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/tracker/${rodando.id}/parar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao parar.");
      setRodando(null);
      if (usuarioSelecionado === meEmail) carregarSemana();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao parar o cronômetro.");
    } finally {
      setIniciando(false);
    }
  }

  async function adicionarManual(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!manual.inicio || !manual.fim) { setErro("Informe início e fim."); return; }
    const inicio = new Date(`${manual.data}T${manual.inicio}`).toISOString();
    const fim = new Date(`${manual.data}T${manual.fim}`).toISOString();
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payloadBase(), inicio, fim }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao lançar.");
      setForm(FORM_VAZIO);
      setManual({ data: ymdLocal(new Date()), inicio: "", fim: "" });
      setModoManual(false);
      if (usuarioSelecionado === meEmail) carregarSemana();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao lançar manualmente.");
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      const res = await fetch(`/api/tracker/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao excluir."); }
      setEntradas((es) => es.filter((x) => x.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  async function salvarEdicao(id: string, patch: Partial<TimeEntry>) {
    try {
      const res = await fetch(`/api/tracker/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setEntradas((es) => es.map((x) => (x.id === id ? data.entrada : x)));
      setEditandoId(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar edição.");
    }
  }

  // agrupamento por dia local, mais recente primeiro
  const grupos = useMemo(() => {
    const porDia = new Map<string, TimeEntry[]>();
    for (const e of entradas) {
      const chave = ymdLocal(new Date(e.inicio));
      if (!porDia.has(chave)) porDia.set(chave, []);
      porDia.get(chave)!.push(e);
    }
    return [...porDia.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dia, itens]) => ({
        dia,
        itens: itens.sort((a, b) => (a.inicio < b.inicio ? 1 : -1)),
        totalMin: itens.reduce((s, it) => s + duracaoMin(it, agora), 0),
      }));
  }, [entradas, agora]);

  const totalSemanaMin = grupos.reduce((s, g) => s + g.totalMin, 0);
  const totalBillableMin = entradas.filter((e) => e.billable).reduce((s, e) => s + duracaoMin(e, agora), 0);
  const souEuMesmo = usuarioSelecionado === meEmail;
  const inputCls = "field-input";

  return (
    <div className="space-y-6">
      {erro && <p className="field-error">{erro}</p>}

      {/* Barra de cronômetro / lançamento manual — sempre do usuário logado */}
      <SectionCard title="Registrar tempo">
        {rodando ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gta-indigo/30 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-900/20">
            <div className="min-w-0">
              <div className="truncate font-medium text-gta-navy dark:text-slate-100">{rodando.descricao || "(sem descrição)"}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {rodando.cliente && <span>{rodando.cliente}</span>}
                {rodando.billable && <Badge tone="green">Faturável</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-semibold tabular-nums text-gta-navy dark:text-slate-100">
                {formatarHMS(Math.floor((agora.getTime() - new Date(rodando.inicio).getTime()) / 1000))}
              </span>
              <button type="button" className="btn-danger" onClick={parar} disabled={iniciando}>
                <Pause className="h-4 w-4" aria-hidden /> Parar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <input
                className={`${inputCls} sm:col-span-2`}
                placeholder="Em que você está trabalhando?"
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
              <select className={`${inputCls} sm:col-span-1`} value={form.tarefaId} onChange={(e) => setTarefaId(e.target.value)}>
                <option value="">Avulso (sem tarefa)</option>
                {tarefas.map((t) => (
                  <option key={t.id} value={t.id}>{t.titulo}</option>
                ))}
              </select>
              {form.tarefaId ? (
                <>
                  <input className={`${inputCls} sm:col-span-1 bg-slate-50 dark:bg-slate-900/50`} value={form.cliente} readOnly title="Vem da tarefa selecionada" />
                  <input className={`${inputCls} sm:col-span-1 bg-slate-50 dark:bg-slate-900/50`} value={form.categoria} readOnly title="Vem da tarefa selecionada" />
                </>
              ) : (
                <>
                  <ClienteInput className={`${inputCls} sm:col-span-1`} value={form.cliente} onNome={(v) => setForm((f) => ({ ...f, cliente: v }))} listId="tracker-clientes" />
                  <input className={`${inputCls} sm:col-span-1`} list="tracker-categorias" placeholder="Categoria" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
                  <datalist id="tracker-categorias">
                    {CATEGORIAS_PADRAO_TAREFA.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </>
              )}
              <input className={`${inputCls} sm:col-span-1`} placeholder="Tags (separadas por vírgula)" value={form.tagsTexto} onChange={(e) => setForm((f) => ({ ...f, tagsTexto: e.target.value }))} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="toque flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-gta-indigo focus:ring-gta-indigo dark:border-slate-600 dark:bg-slate-700" checked={form.billable} onChange={(e) => setForm((f) => ({ ...f, billable: e.target.checked }))} />
                Faturável
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => setModoManual((v) => !v)}>
                  {modoManual ? "Cancelar lançamento manual" : "Lançar manualmente"}
                </button>
                {!modoManual && (
                  <button type="button" className="btn-primary" onClick={iniciar} disabled={iniciando}>
                    <Play className="h-4 w-4" aria-hidden /> Iniciar
                  </button>
                )}
              </div>
            </div>
            {modoManual && (
              <form onSubmit={adicionarManual} className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-900/50">
                <div>
                  <label className="field-label">Data</label>
                  <input type="date" className={inputCls} value={manual.data} onChange={(e) => setManual((m) => ({ ...m, data: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label">Início</label>
                  <input type="time" className={inputCls} value={manual.inicio} onChange={(e) => setManual((m) => ({ ...m, inicio: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label">Fim</label>
                  <input type="time" className={inputCls} value={manual.fim} onChange={(e) => setManual((m) => ({ ...m, fim: e.target.value }))} required />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="btn-primary w-full">Adicionar</button>
                </div>
              </form>
            )}
          </>
        )}
      </SectionCard>

      {/* Navegação de semana + filtro de equipe */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        {podeVerEquipe && (
          <select className="field-input w-full sm:!w-auto" value={usuarioSelecionado} onChange={(e) => setUsuarioSelecionado(e.target.value)}>
            <option value={meEmail}>Eu ({nomeDe(meEmail)})</option>
            <option value="todos">Toda a equipe</option>
            {usuarios.filter((u) => u.email !== meEmail).map((u) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      <KpiGrid>
        <Kpi label="Total da semana" value={formatarDuracao(totalSemanaMin)} destaque />
        <Kpi label="Faturável" value={formatarDuracao(totalBillableMin)} tone="green" />
        <Kpi label="Lançamentos" value={String(entradas.length)} />
        <Kpi label="Dias com registro" value={String(grupos.length)} />
      </KpiGrid>

      {/* Lista agrupada por dia */}
      {carregando ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Carregando…</p>
      ) : grupos.length === 0 ? (
        <EmptyState>Nenhum lançamento nesta semana.</EmptyState>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const d = new Date(`${g.dia}T12:00:00`);
            return (
              <SectionCard key={g.dia} title={`${DIA_SEMANA[d.getDay()]} · ${fmtCurta(d)}`} actions={<span className="text-sm font-medium text-slate-500 dark:text-slate-400">{formatarDuracao(g.totalMin)}</span>}>
                <div className="space-y-2">
                  {g.itens.map((it) => (
                    <TimeEntryRow
                      key={it.id}
                      entrada={it}
                      agora={agora}
                      podeEditar={souEuMesmo}
                      editando={editandoId === it.id}
                      onEditar={() => setEditandoId(it.id)}
                      onCancelar={() => setEditandoId(null)}
                      onSalvar={(patch) => salvarEdicao(it.id, patch)}
                      onExcluir={() => excluir(it.id)}
                      nomeDe={nomeDe}
                      mostrarUsuario={!souEuMesmo}
                    />
                  ))}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimeEntryRow({
  entrada, agora, podeEditar, editando, onEditar, onCancelar, onSalvar, onExcluir, nomeDe, mostrarUsuario,
}: {
  entrada: TimeEntry;
  agora: Date;
  podeEditar: boolean;
  editando: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (patch: Partial<TimeEntry>) => void;
  onExcluir: () => void;
  nomeDe: (email: string) => string;
  mostrarUsuario: boolean;
}) {
  const [descricao, setDescricao] = useState(entrada.descricao);
  const min = duracaoMin(entrada, agora);

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gta-indigo/30 bg-indigo-50/40 p-2 dark:border-indigo-500/30 dark:bg-indigo-900/10">
        <input className="field-input min-w-0 flex-1" value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
        <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => onSalvar({ descricao: descricao.trim() })}>Salvar</button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onCancelar}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/30">
      <div className="min-w-0 flex-1">
        <button type="button" className="toque text-left font-medium text-gta-navy hover:text-gta-indigo disabled:cursor-default disabled:hover:text-gta-navy dark:text-slate-100" onClick={podeEditar ? onEditar : undefined} disabled={!podeEditar}>
          {entrada.descricao || "(sem descrição)"}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {mostrarUsuario && <span className="font-medium">{nomeDe(entrada.usuarioEmail)}</span>}
          {entrada.cliente && <span>· {entrada.cliente}</span>}
          {entrada.categoria && <span>· {entrada.categoria}</span>}
          {entrada.tags.map((t) => <Badge key={t} tone="slate">{t}</Badge>)}
          {entrada.billable && <Badge tone="green">Faturável</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{formatarDuracao(min)}</span>
        {podeEditar && (
          <button type="button" className="icon-btn" onClick={onExcluir} aria-label="Excluir lançamento">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
