"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import { ClienteInput } from "@/components/clientes/ClienteInput";
import { Badge, EmptyState, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import { CATEGORIAS_PADRAO_TAREFA, type Task } from "@/lib/tasks/types";
import { duracaoMin, formatarDuracao, type TimeEntry } from "@/lib/tracker/types";
import {
  addDias, DIA_SEMANA, fmtCurta, formatarHMS, segundaDaSemana, useEntradas, ymdLocal, type Usuario,
} from "./comum";

interface NovoForm {
  descricao: string;
  tarefaId: string; // "" = avulso
  cliente: string;
  categoria: string;
  tagsTexto: string; // "tag1, tag2"
}
const FORM_VAZIO: NovoForm = { descricao: "", tarefaId: "", cliente: "", categoria: "", tagsTexto: "" };

export function AbaTracker({
  meEmail, usuarioSelecionado, tarefas, usuarios, nomeDe,
}: {
  meEmail: string;
  usuarioSelecionado: string;
  tarefas: Task[];
  usuarios: Usuario[];
  nomeDe: (email: string) => string;
}) {
  const [semanaBase, setSemanaBase] = useState(() => segundaDaSemana(new Date()));
  const semanaFim = useMemo(() => addDias(semanaBase, 7), [semanaBase]);
  const { entradas, carregando, erro: erroLista, recarregar, setEntradas } = useEntradas(semanaBase, semanaFim, usuarioSelecionado);

  const [rodando, setRodando] = useState<TimeEntry | null>(null);
  const [form, setForm] = useState<NovoForm>(FORM_VAZIO);
  const [modoManual, setModoManual] = useState(false);
  const [manual, setManual] = useState({ data: ymdLocal(new Date()), inicio: "", fim: "" });
  const [agora, setAgora] = useState(new Date());
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const souEuMesmo = usuarioSelecionado === meEmail;

  useEffect(() => {
    fetch("/api/tracker/rodando").then((r) => r.json()).then((d) => setRodando(d.entrada ?? null)).catch(() => {});
  }, []);

  // relógio do cronômetro ao vivo
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, [rodando]);

  /**
   * Tarefas separadas em "minhas" (atribuídas a mim) e o resto. Concluídas
   * ficam de fora: não faz sentido lançar hora nova em algo já encerrado.
   */
  const { minhas, outras } = useMemo(() => {
    const ativas = tarefas.filter((t) => t.status !== "concluida");
    const meu = meEmail.trim().toLowerCase();
    return {
      minhas: ativas.filter((t) => (t.responsavel ?? "").trim().toLowerCase() === meu),
      outras: ativas.filter((t) => (t.responsavel ?? "").trim().toLowerCase() !== meu),
    };
  }, [tarefas, meEmail]);

  /** Tarefas que podem receber lançamento (mesma regra do seletor principal). */
  const tarefasAtivas = useMemo(() => [...minhas, ...outras], [minhas, outras]);

  /**
   * Cliente/categoria de uma tarefa. Tarefas antigas podem não ter esses
   * campos no registro — `?? ""` porque o tipo promete string mas o dado real
   * nem sempre cumpre. Retorna null para "avulso" (id vazio).
   */
  function dadosDaTarefa(tarefaId: string): { cliente: string; categoria: string } | null {
    const t = tarefas.find((x) => x.id === tarefaId);
    return t ? { cliente: t.cliente ?? "", categoria: t.categoria ?? "" } : null;
  }

  function setTarefaId(tarefaId: string) {
    const t = dadosDaTarefa(tarefaId);
    setForm((f) => ({ ...f, tarefaId, cliente: t ? t.cliente : f.cliente, categoria: t ? t.categoria : f.categoria }));
  }

  function payloadBase() {
    return {
      descricao: (form.descricao || "").trim(),
      tarefaId: form.tarefaId || undefined,
      cliente: (form.cliente || "").trim(),
      categoria: (form.categoria || "").trim(),
      tags: (form.tagsTexto || "").split(",").map((t) => t.trim()).filter(Boolean),
    };
  }

  async function iniciar() {
    setProcessando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadBase()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao iniciar.");
      setRodando(data.entrada);
      setForm(FORM_VAZIO);
      if (souEuMesmo) recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar o cronômetro.");
    } finally {
      setProcessando(false);
    }
  }

  async function parar() {
    if (!rodando) return;
    setProcessando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/tracker/${rodando.id}/parar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao parar.");
      setRodando(null);
      if (souEuMesmo) recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao parar o cronômetro.");
    } finally {
      setProcessando(false);
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payloadBase(), inicio, fim }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao lançar.");
      setForm(FORM_VAZIO);
      setManual({ data: ymdLocal(new Date()), inicio: "", fim: "" });
      setModoManual(false);
      if (souEuMesmo) recarregar();
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
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setEntradas((es) => es.map((x) => (x.id === id ? data.entrada : x)));
      setEditandoId(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar edição.");
    }
  }

  /** Retoma uma atividade: repopula o formulário e já inicia o cronômetro. */
  async function retomar(e: TimeEntry) {
    setProcessando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tracker", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: e.descricao, tarefaId: e.tarefaId, cliente: e.cliente,
          categoria: e.categoria, tags: e.tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao retomar.");
      setRodando(data.entrada);
      if (souEuMesmo) recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao retomar a atividade.");
    } finally {
      setProcessando(false);
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
  const inputCls = "field-input";

  return (
    <div className="space-y-6">
      {(erro || erroLista) && <p className="field-error">{erro ?? erroLista}</p>}

      {/* Cronômetro / lançamento manual — sempre do usuário logado */}
      <SectionCard title="Registrar tempo">
        {rodando ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gta-indigo/30 bg-indigo-50/60 p-3 dark:border-indigo-500/30 dark:bg-indigo-900/20">
            <div className="min-w-0">
              <div className="truncate font-medium text-gta-navy dark:text-slate-100">{rodando.descricao || "(sem descrição)"}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {rodando.cliente && <span>{rodando.cliente}</span>}
                {rodando.categoria && <span>· {rodando.categoria}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-semibold tabular-nums text-gta-navy dark:text-slate-100">
                {formatarHMS(Math.floor((agora.getTime() - new Date(rodando.inicio).getTime()) / 1000))}
              </span>
              <button type="button" className="btn-danger" onClick={parar} disabled={processando}>
                <Pause className="h-4 w-4" aria-hidden /> Parar
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Todo campo tem rótulo visível — sem depender só de placeholder. */}
            <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="tracker-descricao">Descrição</label>
                <input
                  id="tracker-descricao"
                  className={inputCls}
                  placeholder="Em que você está trabalhando?"
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="tracker-tarefa">Tarefa</label>
                <select id="tracker-tarefa" className={inputCls} value={form.tarefaId} onChange={(e) => setTarefaId(e.target.value)}>
                  <option value="">Avulso (sem tarefa)</option>
                  {minhas.length > 0 && (
                    <optgroup label="Minhas tarefas">
                      {minhas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                    </optgroup>
                  )}
                  {outras.length > 0 && (
                    <optgroup label="Outras tarefas da equipe">
                      {outras.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="tracker-cliente">Cliente</label>
                {form.tarefaId ? (
                  <input
                    id="tracker-cliente"
                    className={`${inputCls} bg-slate-50 dark:bg-slate-900/50`}
                    value={form.cliente}
                    placeholder="(a tarefa não tem cliente)"
                    readOnly
                    title="Vem da tarefa selecionada"
                  />
                ) : (
                  <ClienteInput id="tracker-cliente" placeholder="Ex.: CPDF" className={inputCls} value={form.cliente} onNome={(v) => setForm((f) => ({ ...f, cliente: v }))} listId="tracker-clientes" />
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="tracker-categoria">Categoria</label>
                {form.tarefaId ? (
                  <input
                    id="tracker-categoria"
                    className={`${inputCls} bg-slate-50 dark:bg-slate-900/50`}
                    value={form.categoria}
                    placeholder="(a tarefa não tem categoria)"
                    readOnly
                    title="Vem da tarefa selecionada"
                  />
                ) : (
                  <>
                    <input id="tracker-categoria" className={inputCls} list="tracker-categorias" placeholder="Ex.: Projetos" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} />
                    <datalist id="tracker-categorias">
                      {CATEGORIAS_PADRAO_TAREFA.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="tracker-tags">Tags</label>
                <input id="tracker-tags" className={inputCls} placeholder="Separadas por vírgula" value={form.tagsTexto} onChange={(e) => setForm((f) => ({ ...f, tagsTexto: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => setModoManual((v) => !v)}>
                  {modoManual ? "Cancelar lançamento manual" : "Lançar manualmente"}
                </button>
                {!modoManual && (
                  <button type="button" className="btn-primary" onClick={iniciar} disabled={processando}>
                    <Play className="h-4 w-4" aria-hidden /> Iniciar
                  </button>
                )}
              </div>
            </div>
            {modoManual && (
              <form onSubmit={adicionarManual} className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-900/50">
                <div>
                  <label className="field-label" htmlFor="tracker-data">Data</label>
                  <input id="tracker-data" type="date" className={inputCls} value={manual.data} onChange={(e) => setManual((m) => ({ ...m, data: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label" htmlFor="tracker-inicio">Início</label>
                  <input id="tracker-inicio" type="time" className={inputCls} value={manual.inicio} onChange={(e) => setManual((m) => ({ ...m, inicio: e.target.value }))} required />
                </div>
                <div>
                  <label className="field-label" htmlFor="tracker-fim">Fim</label>
                  <input id="tracker-fim" type="time" className={inputCls} value={manual.fim} onChange={(e) => setManual((m) => ({ ...m, fim: e.target.value }))} required />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="btn-primary w-full">Adicionar</button>
                </div>
              </form>
            )}
          </>
        )}
      </SectionCard>

      {/* Navegação de semana */}
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

      <KpiGrid>
        <Kpi label="Total da semana" value={formatarDuracao(totalSemanaMin)} destaque />
        <Kpi label="Média por dia" value={formatarDuracao(grupos.length ? Math.round(totalSemanaMin / grupos.length) : 0)} />
        <Kpi label="Lançamentos" value={String(entradas.length)} />
        <Kpi label="Dias com registro" value={String(grupos.length)} />
      </KpiGrid>

      {carregando ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Carregando…</p>
      ) : grupos.length === 0 ? (
        <EmptyState>Nenhum lançamento nesta semana.</EmptyState>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const d = new Date(`${g.dia}T12:00:00`);
            return (
              <SectionCard
                key={g.dia}
                title={`${DIA_SEMANA[d.getDay()]} · ${fmtCurta(d)}`}
                actions={<span className="text-sm font-medium text-slate-500 dark:text-slate-400">{formatarDuracao(g.totalMin)}</span>}
              >
                <div className="space-y-2">
                  {g.itens.map((it) => (
                    <LinhaLancamento
                      key={it.id}
                      entrada={it}
                      agora={agora}
                      podeEditar={souEuMesmo}
                      editando={editandoId === it.id}
                      onEditar={() => setEditandoId(it.id)}
                      onCancelar={() => setEditandoId(null)}
                      onSalvar={(patch) => salvarEdicao(it.id, patch)}
                      onExcluir={() => excluir(it.id)}
                      onRetomar={() => retomar(it)}
                      podeRetomar={souEuMesmo && !rodando}
                      nomeDe={nomeDe}
                      mostrarUsuario={!souEuMesmo}
                      tarefas={tarefasAtivas}
                      onEscolherTarefa={dadosDaTarefa}
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

/** "14:30" a partir de um ISO — para preencher <input type="time">. */
function hhmmLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function LinhaLancamento({
  entrada, agora, podeEditar, editando, onEditar, onCancelar, onSalvar, onExcluir, onRetomar, podeRetomar, nomeDe, mostrarUsuario, tarefas, onEscolherTarefa,
}: {
  entrada: TimeEntry;
  agora: Date;
  podeEditar: boolean;
  editando: boolean;
  onEditar: () => void;
  onCancelar: () => void;
  onSalvar: (patch: Partial<TimeEntry>) => void;
  onExcluir: () => void;
  onRetomar: () => void;
  podeRetomar: boolean;
  nomeDe: (email: string) => string;
  mostrarUsuario: boolean;
  tarefas: Task[];
  onEscolherTarefa: (id: string) => { cliente: string; categoria: string } | null;
}) {
  const min = duracaoMin(entrada, agora);
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (editando) {
    return (
      <EdicaoLancamento
        entrada={entrada}
        tarefas={tarefas}
        onEscolherTarefa={onEscolherTarefa}
        onSalvar={onSalvar}
        onCancelar={onCancelar}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md px-1 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/30">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="toque text-left font-medium text-gta-navy hover:text-gta-indigo disabled:cursor-default disabled:hover:text-gta-navy dark:text-slate-100"
          onClick={podeEditar ? onEditar : undefined}
          disabled={!podeEditar}
        >
          {entrada.descricao || "(sem descrição)"}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {mostrarUsuario && <span className="font-medium">{nomeDe(entrada.usuarioEmail)}</span>}
          {entrada.cliente && <span>· {entrada.cliente}</span>}
          {entrada.categoria && <span>· {entrada.categoria}</span>}
          {entrada.tags.map((t) => <Badge key={t} tone="slate">{t}</Badge>)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs tabular-nums text-slate-400 sm:inline dark:text-slate-500">
          {hora(entrada.inicio)}{entrada.fim ? `–${hora(entrada.fim)}` : ""}
        </span>
        <span className="text-sm font-medium tabular-nums text-slate-600 dark:text-slate-300">{formatarDuracao(min)}</span>
        {podeRetomar && (
          <button type="button" className="icon-btn hover:!bg-indigo-50 hover:!text-gta-indigo dark:hover:!bg-indigo-900/20" onClick={onRetomar} aria-label="Retomar esta atividade" title="Retomar esta atividade">
            <Play className="h-4 w-4" aria-hidden />
          </button>
        )}
        {podeEditar && (
          <button type="button" className="icon-btn" onClick={onExcluir} aria-label="Excluir lançamento">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Edição completa de um lançamento — todos os campos, não só a descrição:
 * tarefa (com cliente/categoria herdados), cliente, categoria, tags, e o
 * horário (data + início + fim).
 */
function EdicaoLancamento({
  entrada, tarefas, onEscolherTarefa, onSalvar, onCancelar,
}: {
  entrada: TimeEntry;
  tarefas: Task[];
  onEscolherTarefa: (id: string) => { cliente: string; categoria: string } | null;
  onSalvar: (patch: Partial<TimeEntry>) => void;
  onCancelar: () => void;
}) {
  const [descricao, setDescricao] = useState(entrada.descricao);
  const [tarefaId, setTarefaId] = useState(entrada.tarefaId ?? "");
  const [cliente, setCliente] = useState(entrada.cliente);
  const [categoria, setCategoria] = useState(entrada.categoria);
  const [tagsTexto, setTagsTexto] = useState(entrada.tags.join(", "));
  const [data, setData] = useState(ymdLocal(new Date(entrada.inicio)));
  const [inicio, setInicio] = useState(hhmmLocal(entrada.inicio));
  // Lançamento em andamento não tem fim — o campo fica vazio e opcional.
  const [fim, setFim] = useState(entrada.fim ? hhmmLocal(entrada.fim) : "");
  const [erro, setErro] = useState<string | null>(null);

  function trocarTarefa(id: string) {
    setTarefaId(id);
    const t = onEscolherTarefa(id);
    if (t) { setCliente(t.cliente); setCategoria(t.categoria); }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const novoInicio = new Date(`${data}T${inicio}`);
    if (Number.isNaN(novoInicio.getTime())) { setErro("Horário de início inválido."); return; }
    let novoFim: Date | null = null;
    if (fim) {
      novoFim = new Date(`${data}T${fim}`);
      if (Number.isNaN(novoFim.getTime())) { setErro("Horário de fim inválido."); return; }
      if (novoFim <= novoInicio) { setErro("O fim precisa ser depois do início."); return; }
    }
    onSalvar({
      descricao: descricao.trim(),
      // "" desvincula a tarefa (contrato LIMPAR do store).
      tarefaId: tarefaId || "",
      cliente: cliente.trim(),
      categoria: categoria.trim(),
      tags: tagsTexto.split(",").map((t) => t.trim()).filter(Boolean),
      inicio: novoInicio.toISOString(),
      ...(novoFim ? { fim: novoFim.toISOString() } : {}),
    });
  }

  const id = (campo: string) => `edit-${entrada.id}-${campo}`;
  const inputCls = "field-input";

  return (
    <form onSubmit={salvar} className="rounded-md border border-gta-indigo/30 bg-indigo-50/40 p-3 dark:border-indigo-500/30 dark:bg-indigo-900/10">
      <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <label className="field-label" htmlFor={id("desc")}>Descrição</label>
          <input id={id("desc")} className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus />
        </div>
        <div className="sm:col-span-3">
          <label className="field-label" htmlFor={id("tarefa")}>Tarefa</label>
          <select id={id("tarefa")} className={inputCls} value={tarefaId} onChange={(e) => trocarTarefa(e.target.value)}>
            <option value="">Avulso (sem tarefa)</option>
            {tarefas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="field-label" htmlFor={id("cliente")}>Cliente</label>
          <input id={id("cliente")} className={inputCls} value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className="field-label" htmlFor={id("categoria")}>Categoria</label>
          <input id={id("categoria")} className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor={id("data")}>Data</label>
          <input id={id("data")} type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} required />
        </div>
        <div className="sm:col-span-1">
          <label className="field-label" htmlFor={id("inicio")}>Início</label>
          <input id={id("inicio")} type="time" className={inputCls} value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </div>
        <div className="sm:col-span-1">
          <label className="field-label" htmlFor={id("fim")}>Fim</label>
          <input id={id("fim")} type="time" className={inputCls} value={fim} onChange={(e) => setFim(e.target.value)} placeholder="em andamento" />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor={id("tags")}>Tags</label>
          <input id={id("tags")} className={inputCls} value={tagsTexto} onChange={(e) => setTagsTexto(e.target.value)} placeholder="Separadas por vírgula" />
        </div>
      </div>
      {erro && <p className="field-error mt-2">{erro}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary !py-1.5 text-xs">Salvar</button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
