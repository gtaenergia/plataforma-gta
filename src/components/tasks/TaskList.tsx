"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquare, X } from "lucide-react";
import {
  PRIORIDADES,
  STATUS_TAREFA,
  DEMANDANTES,
  CATEGORIAS_PADRAO_TAREFA,
  demandanteLabel,
  type Demandante,
  type Prioridade,
  type StatusTarefa,
  type Task,
} from "@/lib/tasks/types";
import { Alert, Badge, Loading, type Tone } from "@/components/ui";

interface Usuario {
  email: string;
  name: string;
}

const PRIORIDADE_PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };

const PRIORIDADE_TONE: Record<Prioridade, Tone> = { alta: "red", media: "amber", baixa: "slate" };

const STATUS_BADGE: Record<StatusTarefa, string> = {
  afazer: "border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  andamento: "border-gta-indigo/40 bg-indigo-50 text-gta-indigo dark:bg-indigo-900/40 dark:text-indigo-300",
  atraso: "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-300",
  continuo: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  concluida: "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/40 dark:text-green-300",
};

function hoje(): string {
  // Data LOCAL do navegador (não UTC) — evita marcar como atrasada 1 dia antes no Brasil.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Um prazo está vencido se a data — ou data+hora, quando há hora — já passou e a tarefa não foi concluída. */
function prazoAtrasado(data: string, hora: string, status: StatusTarefa): boolean {
  if (status === "concluida" || !data) return false;
  if (hora) return new Date(`${data}T${hora}`).getTime() < Date.now();
  return data < hoje();
}
/** Prazo operacional efetivo: o campo novo, com fallback ao prazo legado. */
function prazoOp(t: Task): string {
  return t.prazoOperacional || t.prazo || "";
}
/** Os prazos preenchidos da tarefa (comercial + operacional). */
function prazosDe(t: Task): string[] {
  return [t.prazoComercial, prazoOp(t)].filter(Boolean);
}
/** Algum dos prazos está vencido (para ordenar as vencidas primeiro). */
function algumAtrasado(t: Task): boolean {
  return prazoAtrasado(t.prazoComercial, t.horaComercial, t.status) || prazoAtrasado(prazoOp(t), t.horaOperacional, t.status);
}
/** Prazo mais próximo entre os dois (para ordenação). */
function prazoMin(t: Task): string {
  const ps = prazosDe(t);
  return ps.length ? ps.reduce((a, b) => (a < b ? a : b)) : "9999-12-31";
}

function formatPrazo(prazo: string): string {
  if (!prazo) return "—";
  const [y, m, d] = prazo.split("-");
  return `${d}/${m}/${y}`;
}

/** "dd/mm/yyyy" + " HH:mm" quando há hora. */
function formatPrazoHora(data: string, hora: string): string {
  if (!data) return "—";
  return formatPrazo(data) + (hora ? ` ${hora}` : "");
}

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

interface FormState {
  titulo: string;
  descricao: string;
  cliente: string;
  categoria: string;
  demandante: Demandante;
  responsavel: string;
  prioridade: Prioridade;
  prazoComercial: string;
  prazoOperacional: string;
  horaComercial: string;
  horaOperacional: string;
}

const FORM_VAZIO: FormState = { titulo: "", descricao: "", cliente: "", categoria: "", demandante: "operacional", responsavel: "", prioridade: "media", prazoComercial: "", prazoOperacional: "", horaComercial: "", horaOperacional: "" };

export function TaskList({ currentUserEmail }: { currentUserEmail: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // filtros
  const [fStatus, setFStatus] = useState<string>("ativas");
  const [fResp, setFResp] = useState<string>("todos");
  const [fCliente, setFCliente] = useState<string>("todos");
  const [fCategoria, setFCategoria] = useState<string>("todos");
  const [fDemandante, setFDemandante] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  // paginação
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(20);

  // formulário de nova tarefa
  const [novaAberta, setNovaAberta] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  // linha expandida
  const [abertaId, setAbertaId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rt, ru] = await Promise.all([fetch("/api/tarefas"), fetch("/api/usuarios")]);
        const dt = await rt.json();
        const du = await ru.json();
        setTasks(dt.tasks ?? []);
        setUsuarios(du.usuarios ?? []);
      } catch {
        setErro("Falha ao carregar as tarefas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const nomeDe = useMemo(() => {
    const map = new Map(usuarios.map((u) => [u.email, u.name]));
    return (email: string) => map.get(email) ?? email;
  }, [usuarios]);

  // clientes distintos presentes nas tarefas (para o filtro e o autocomplete)
  const clientes = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.cliente && set.add(t.cliente));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks]);

  // categorias: semente padrão + qualquer valor já usado em alguma tarefa —
  // basta criar uma tarefa com categoria nova para ela aparecer aqui depois.
  const categorias = useMemo(() => {
    const set = new Set<string>(CATEGORIAS_PADRAO_TAREFA);
    tasks.forEach((t) => t.categoria && set.add(t.categoria));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks]);

  // responsáveis distintos presentes nas tarefas (nomes importados ou e-mails de usuários)
  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.responsavel && set.add(t.responsavel));
    return Array.from(set).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR"));
  }, [tasks, nomeDe]);

  const visiveis = useMemo(() => {
    let list = [...tasks];
    if (fStatus === "ativas") list = list.filter((t) => t.status !== "concluida");
    else if (fStatus !== "todas") list = list.filter((t) => t.status === fStatus);
    if (fResp !== "todos") list = list.filter((t) => t.responsavel === fResp);
    if (fCliente !== "todos") list = list.filter((t) => t.cliente === fCliente);
    if (fCategoria !== "todos") list = list.filter((t) => t.categoria === fCategoria);
    if (fDemandante !== "todos") list = list.filter((t) => t.demandante === fDemandante);
    const q = busca.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.titulo.toLowerCase().includes(q) ||
          t.descricao.toLowerCase().includes(q) ||
          (t.cliente ?? "").toLowerCase().includes(q),
      );
    }
    // ordenação: concluídas por último; depois atrasadas primeiro; prazo mais próximo; prioridade
    list.sort((a, b) => {
      const ca = a.status === "concluida" ? 1 : 0;
      const cb = b.status === "concluida" ? 1 : 0;
      if (ca !== cb) return ca - cb;
      const aa = algumAtrasado(a) ? 0 : 1;
      const ab = algumAtrasado(b) ? 0 : 1;
      if (aa !== ab) return aa - ab;
      const pa = prazoMin(a);
      const pb = prazoMin(b);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return PRIORIDADE_PESO[a.prioridade] - PRIORIDADE_PESO[b.prioridade];
    });
    return list;
  }, [tasks, fStatus, fResp, fCliente, fCategoria, fDemandante, busca]);

  // volta para a 1ª página quando os filtros/busca mudam
  useEffect(() => {
    setPagina(1);
  }, [fStatus, fResp, fCliente, fCategoria, fDemandante, busca, porPagina]);

  // fatia a página atual (paginação no cliente sobre a lista já filtrada)
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginadas = visiveis.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);
  const inicio = visiveis.length === 0 ? 0 : (paginaAtual - 1) * porPagina + 1;
  const fim = Math.min(paginaAtual * porPagina, visiveis.length);

  function aplicar(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "afazer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar a tarefa.");
      setTasks((prev) => [...prev, data.task]);
      setForm(FORM_VAZIO);
      setNovaAberta(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizar(id: string, patch: Record<string, unknown>) {
    setErro(null);
    try {
      const res = await fetch(`/api/tarefas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Falha ao atualizar.");
        return;
      }
      aplicar(data.task);
    } catch {
      setErro("Falha de conexão ao atualizar a tarefa.");
    }
  }

  async function excluir(id: string, titulo: string) {
    if (!window.confirm(`Excluir a tarefa "${titulo}"?`)) return;
    setErro(null);
    try {
      const res = await fetch(`/api/tarefas/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        setErro(data.error ?? "Falha ao excluir a tarefa.");
      }
    } catch {
      setErro("Falha de conexão ao excluir a tarefa.");
    }
  }

  async function comentar(id: string, texto: string) {
    setErro(null);
    try {
      const res = await fetch(`/api/tarefas/${id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) aplicar(data.task);
      else setErro(data.error ?? "Falha ao comentar.");
    } catch {
      setErro("Falha de conexão ao enviar o comentário.");
    }
  }

  if (loading) return <Loading>Carregando tarefas…</Loading>;

  return (
    <div className="space-y-4">
      {/* Autocomplete: sugestões a partir dos clientes já cadastrados */}
      <datalist id="tarefa-clientes">
        {clientes.map((c) => <option key={c} value={c} />)}
      </datalist>
      <datalist id="tarefa-categorias">
        {categorias.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* toolbar */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 dark:border-slate-700 dark:bg-slate-800">
        <button
          className="btn-primary w-full sm:w-auto"
          onClick={() => {
            setNovaAberta((v) => !v);
            setForm((f) => ({ ...f, responsavel: f.responsavel || currentUserEmail }));
          }}
        >
          {novaAberta ? "Fechar" : "+ Nova tarefa"}
        </button>
        <select className="field-input w-full sm:!w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="ativas">Ativas (padrão)</option>
          <option value="todas">Todas</option>
          {STATUS_TAREFA.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="field-input w-full sm:!w-auto" value={fResp} onChange={(e) => setFResp(e.target.value)}>
          <option value="todos">Todos os responsáveis</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {nomeDe(r)}
            </option>
          ))}
        </select>
        {clientes.length > 0 && (
          <select className="field-input w-full sm:!w-auto" value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
            <option value="todos">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select className="field-input w-full sm:!w-auto" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
          <option value="todos">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className="field-input w-full sm:!w-auto" value={fDemandante} onChange={(e) => setFDemandante(e.target.value)}>
          <option value="todos">Todos os demandantes</option>
          {DEMANDANTES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          className="field-input w-full sm:!w-56"
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="text-xs text-slate-400 sm:ml-auto dark:text-slate-500">
          {visiveis.length} tarefa{visiveis.length === 1 ? "" : "s"}
        </span>
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}

      {/* nova tarefa */}
      {novaAberta && (
        <form onSubmit={criar} className="section-card-destaque">
          <h2 className="section-title mb-3">Nova tarefa</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label className="field-label">Título *</label>
              <input className="field-input" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
            </div>
            <div className="sm:col-span-6">
              <label className="field-label">Descrição</label>
              <textarea className="field-input min-h-[70px]" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Cliente</label>
              <input className="field-input" list="tarefa-clientes" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Ex.: CPDF, Fazenda Rio Doce…" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Categoria</label>
              <input className="field-input" list="tarefa-categorias" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Administrativo, Orçamentos…" />
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Demandante</label>
              <select className="field-input" value={form.demandante} onChange={(e) => setForm({ ...form, demandante: e.target.value as Demandante })}>
                {DEMANDANTES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Responsável *</label>
              <select className="field-input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} required>
                <option value="">Selecione...</option>
                {usuarios.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Prioridade</label>
              <select className="field-input" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}>
                {PRIORIDADES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Prazo comercial</label>
              <div className="flex gap-2">
                <input type="date" className="field-input min-w-0 flex-1" value={form.prazoComercial} onChange={(e) => setForm({ ...form, prazoComercial: e.target.value })} />
                <input type="time" aria-label="Hora do prazo comercial" className="field-input min-w-0 flex-1" value={form.horaComercial} onChange={(e) => setForm({ ...form, horaComercial: e.target.value })} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label">Prazo operacional</label>
              <div className="flex gap-2">
                <input type="date" className="field-input min-w-0 flex-1" value={form.prazoOperacional} onChange={(e) => setForm({ ...form, prazoOperacional: e.target.value })} />
                <input type="time" aria-label="Hora do prazo operacional" className="field-input min-w-0 flex-1" value={form.horaOperacional} onChange={(e) => setForm({ ...form, horaOperacional: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : "Criar tarefa"}
            </button>
          </div>
        </form>
      )}

      {/* lista */}
      <div className="overflow-x-auto card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Tarefa</th>
              <th className="hidden md:table-cell">Cliente</th>
              <th className="hidden md:table-cell">Categoria</th>
              <th className="hidden md:table-cell">Demandante</th>
              <th className="hidden md:table-cell">Responsável</th>
              <th className="hidden md:table-cell">Prioridade</th>
              <th className="hidden md:table-cell">Prazo comercial</th>
              <th className="hidden md:table-cell">Prazo operacional</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  Nenhuma tarefa encontrada. Crie a primeira com “+ Nova tarefa”.
                </td>
              </tr>
            )}
            {paginadas.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                aberta={abertaId === t.id}
                onToggle={() => setAbertaId(abertaId === t.id ? null : t.id)}
                nomeDe={nomeDe}
                usuarios={usuarios}
                onStatus={(s) => atualizar(t.id, { status: s })}
                onPatch={(patch) => atualizar(t.id, patch)}
                onExcluir={() => excluir(t.id, t.titulo)}
                onComentar={(texto) => comentar(t.id, texto)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* paginação */}
      {visiveis.length > 0 && (
        <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-3 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-400">
              {inicio}–{fim} de {visiveis.length}
            </span>
            <select
              className="field-input !w-auto !py-1 text-xs"
              value={porPagina}
              onChange={(e) => setPorPagina(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} por página
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina(paginaAtual - 1)}
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-slate-600 dark:text-slate-400">
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
              aria-label="Próxima"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task: t,
  aberta,
  onToggle,
  nomeDe,
  usuarios,
  onStatus,
  onPatch,
  onExcluir,
  onComentar,
}: {
  task: Task;
  aberta: boolean;
  onToggle: () => void;
  nomeDe: (email: string) => string;
  usuarios: Usuario[];
  onStatus: (s: StatusTarefa) => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onExcluir: () => void;
  onComentar: (texto: string) => void;
}) {
  const concluida = t.status === "concluida";
  const lateCom = prazoAtrasado(t.prazoComercial, t.horaComercial, t.status);
  const lateOp = prazoAtrasado(prazoOp(t), t.horaOperacional, t.status);
  const [comentario, setComentario] = useState("");
  const [editando, setEditando] = useState(false);
  const [edit, setEdit] = useState<FormState>({
    titulo: t.titulo,
    descricao: t.descricao,
    cliente: t.cliente ?? "",
    categoria: t.categoria ?? "",
    demandante: t.demandante || "operacional",
    responsavel: t.responsavel,
    prioridade: t.prioridade,
    prazoComercial: t.prazoComercial ?? "",
    prazoOperacional: prazoOp(t),
    horaComercial: t.horaComercial ?? "",
    horaOperacional: t.horaOperacional ?? "",
  });

  return (
    <>
      {/* A linha inteira expande/recolhe — os controles próprios (status e
          excluir) param a propagação para não disparar o toggle junto. */}
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/40 ${concluida ? "opacity-50" : ""}`}
      >
        <td className="px-3 py-2.5 align-top md:px-4 md:py-2 md:align-middle">
          <select
            value={t.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value as StatusTarefa)}
            className={`toque rounded-full border px-2 py-1 text-xs font-medium ${STATUS_BADGE[t.status]}`}
          >
            {STATUS_TAREFA.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2.5 md:px-4 md:py-2">
          {/* Continua sendo um botão: mantém o acesso por teclado à expansão. */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={aberta}
            className={`text-left font-medium text-gta-navy hover:text-gta-indigo dark:text-slate-100 ${concluida ? "line-through" : ""}`}
          >
            {t.titulo}
          </button>
          {t.comentarios.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 hint"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{t.comentarios.length}</span>
          )}
          {/* No mobile, prioridade/prazo/responsável ficam ocultos nas colunas — mostra o essencial aqui */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
            <Badge tone={PRIORIDADE_TONE[t.prioridade]}>
              {PRIORIDADES.find((p) => p.value === t.prioridade)?.label}
            </Badge>
            {t.prazoComercial && (
              <span className={`text-[11px] ${lateCom ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                Com: {formatPrazoHora(t.prazoComercial, t.horaComercial)}
              </span>
            )}
            {prazoOp(t) && (
              <span className={`text-[11px] ${lateOp ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                Op: {formatPrazoHora(prazoOp(t), t.horaOperacional)}
              </span>
            )}
            {t.cliente && <span className="text-[11px] text-slate-500 dark:text-slate-400">· {t.cliente}</span>}
            {t.categoria && <span className="text-[11px] text-slate-500 dark:text-slate-400">· {t.categoria}</span>}
            {demandanteLabel(t.demandante) && <span className="text-[11px] text-slate-500 dark:text-slate-400">· {demandanteLabel(t.demandante)}</span>}
          </div>
        </td>
        <td className="hidden px-4 py-2 text-slate-600 md:table-cell dark:text-slate-300">{t.cliente || <span className="sem-valor">—</span>}</td>
        <td className="hidden px-4 py-2 text-slate-600 md:table-cell dark:text-slate-300">{t.categoria || <span className="sem-valor">—</span>}</td>
        <td className="hidden px-4 py-2 text-slate-600 md:table-cell dark:text-slate-300">{demandanteLabel(t.demandante) || <span className="sem-valor">—</span>}</td>
        <td className="hidden px-4 py-2 text-slate-600 md:table-cell dark:text-slate-300">{nomeDe(t.responsavel)}</td>
        <td className="hidden px-4 py-2 md:table-cell">
          <Badge tone={PRIORIDADE_TONE[t.prioridade]}>
            {PRIORIDADES.find((p) => p.value === t.prioridade)?.label}
          </Badge>
        </td>
        <td className={`hidden whitespace-nowrap px-4 py-2 md:table-cell ${lateCom ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
          {formatPrazoHora(t.prazoComercial, t.horaComercial)}
        </td>
        <td className={`hidden whitespace-nowrap px-4 py-2 md:table-cell ${lateOp ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
          {formatPrazoHora(prazoOp(t), t.horaOperacional)}
        </td>
        <td className="px-1 py-2 text-center align-top md:px-2 md:align-middle">
          <button onClick={(e) => { e.stopPropagation(); onExcluir(); }} className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-600 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400" title="Excluir" aria-label="Excluir">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </td>
      </tr>
      {aberta && (
        <tr className="bg-slate-50/60 dark:bg-slate-900/40">
          <td colSpan={10} className="px-3 py-3 md:px-6 md:py-4">
            {!editando ? (
              <div className="space-y-3">
                <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                  {t.descricao || <span className="italic text-slate-500 dark:text-slate-400">Sem descrição.</span>}
                </p>
                <p className="hint">
                  Criada por {nomeDe(t.criadoPor)} em {formatDataHora(t.criadoEm)} · Atualizada em {formatDataHora(t.atualizadoEm)}
                </p>
                <button className="btn-secondary !py-1 text-xs" onClick={() => setEditando(true)}>
                  Editar tarefa
                </button>
              </div>
            ) : (
              <form
                className="grid grid-cols-1 gap-3 sm:grid-cols-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  onPatch(edit as unknown as Record<string, unknown>);
                  setEditando(false);
                }}
              >
                <div className="sm:col-span-6">
                  <label className="field-label">Título</label>
                  <input className="field-input" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} required />
                </div>
                <div className="sm:col-span-6">
                  <label className="field-label">Descrição</label>
                  <textarea className="field-input min-h-[70px]" value={edit.descricao} onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Cliente</label>
                  <input className="field-input" list="tarefa-clientes" value={edit.cliente} onChange={(e) => setEdit({ ...edit, cliente: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Categoria</label>
                  <input className="field-input" list="tarefa-categorias" value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Demandante</label>
                  <select className="field-input" value={edit.demandante} onChange={(e) => setEdit({ ...edit, demandante: e.target.value as Demandante })}>
                    {DEMANDANTES.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Responsável</label>
                  <select className="field-input" value={edit.responsavel} onChange={(e) => setEdit({ ...edit, responsavel: e.target.value })}>
                    {!usuarios.some((u) => u.email === edit.responsavel) && edit.responsavel && (
                      <option value={edit.responsavel}>{edit.responsavel}</option>
                    )}
                    {usuarios.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Prioridade</label>
                  <select className="field-input" value={edit.prioridade} onChange={(e) => setEdit({ ...edit, prioridade: e.target.value as Prioridade })}>
                    {PRIORIDADES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Prazo comercial</label>
                  <div className="flex gap-2">
                    <input type="date" className="field-input min-w-0 flex-1" value={edit.prazoComercial} onChange={(e) => setEdit({ ...edit, prazoComercial: e.target.value })} />
                    <input type="time" aria-label="Hora do prazo comercial" className="field-input min-w-0 flex-1" value={edit.horaComercial} onChange={(e) => setEdit({ ...edit, horaComercial: e.target.value })} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Prazo operacional</label>
                  <div className="flex gap-2">
                    <input type="date" className="field-input min-w-0 flex-1" value={edit.prazoOperacional} onChange={(e) => setEdit({ ...edit, prazoOperacional: e.target.value })} />
                    <input type="time" aria-label="Hora do prazo operacional" className="field-input min-w-0 flex-1" value={edit.horaOperacional} onChange={(e) => setEdit({ ...edit, horaOperacional: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 sm:col-span-6">
                  <button type="submit" className="btn-primary !py-1 text-xs">
                    Salvar
                  </button>
                  <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setEditando(false)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* comentários */}
            <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Comentários ({t.comentarios.length})
              </h3>
              <ul className="space-y-2">
                {t.comentarios.map((c) => (
                  <li key={c.id} className="rounded-md bg-white p-2 text-sm shadow-sm dark:bg-slate-800">
                    <span className="font-medium text-gta-navy dark:text-slate-100">{c.autor}</span>
                    <span className="ml-2 hint">{formatDataHora(c.em)}</span>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{c.texto}</p>
                  </li>
                ))}
              </ul>
              <form
                className="mt-2 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (comentario.trim()) {
                    onComentar(comentario.trim());
                    setComentario("");
                  }
                }}
              >
                <input
                  className="field-input"
                  placeholder="Escreva um comentário…"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <button type="submit" className="btn-secondary w-full sm:w-auto">
                  Comentar
                </button>
              </form>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
