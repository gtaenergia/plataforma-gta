"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
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
import { Alert, Loading } from "@/components/ui";
import { Paginacao, usePaginacao } from "@/components/Paginacao";
import { MarcaPrioridade, PontoStatus } from "./marcadores";

interface Usuario {
  email: string;
  name: string;
}

const PRIORIDADE_PESO: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };


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

export function TaskList() {
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
  // O hook compartilhado já volta para a 1ª página quando o total muda.
  const { paginados, controles } = usePaginacao(visiveis);

  function aplicar(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
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

      {/* toolbar — `.card` em vez de Tailwind solto: a definição estava
          duplicada, e mudar o cartão do sistema deixaria a barra para trás. */}
      <div className="card flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Link href="/tarefas/nova" className="btn-primary w-full justify-center sm:w-auto">
          + Nova tarefa
        </Link>
        <select aria-label="Filtrar por status" className="field-input w-full sm:!w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="ativas">Ativas (padrão)</option>
          <option value="todas">Todas</option>
          {STATUS_TAREFA.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por responsável" className="field-input w-full sm:!w-auto" value={fResp} onChange={(e) => setFResp(e.target.value)}>
          <option value="todos">Todos os responsáveis</option>
          {responsaveis.map((r) => (
            <option key={r} value={r}>
              {nomeDe(r)}
            </option>
          ))}
        </select>
        {clientes.length > 0 && (
          <select aria-label="Filtrar por cliente" className="field-input w-full sm:!w-auto" value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
            <option value="todos">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Filtrar por categoria" className="field-input w-full sm:!w-auto" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
          <option value="todos">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por demandante" className="field-input w-full sm:!w-auto" value={fDemandante} onChange={(e) => setFDemandante(e.target.value)}>
          <option value="todos">Todos os demandantes</option>
          {DEMANDANTES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Buscar por título, descrição ou cliente"
          className="field-input w-full sm:!w-56"
          placeholder="Buscar…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="hint sm:ml-auto">
          {visiveis.length} tarefa{visiveis.length === 1 ? "" : "s"}
        </span>
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}


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
            {paginados.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                nomeDe={nomeDe}
                onStatus={(s) => atualizar(t.id, { status: s })}
                onExcluir={() => excluir(t.id, t.titulo)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Componente compartilhado, o mesmo de Propostas, Clientes e Aprovações.
          A cópia que existia aqui já tinha divergido: botões de 32px contra os
          36px do padrão — e, no celular, abaixo do alvo de toque. */}
      <Paginacao {...controles} />
    </div>
  );
}

function TaskRow({
  task: t,
  nomeDe,
  onStatus,
  onExcluir,
}: {
  task: Task;
  nomeDe: (email: string) => string;
  onStatus: (s: StatusTarefa) => void;
  onExcluir: () => void;
}) {
  const router = useRouter();
  const concluida = t.status === "concluida";
  const lateCom = prazoAtrasado(t.prazoComercial, t.horaComercial, t.status);
  const lateOp = prazoAtrasado(prazoOp(t), t.horaOperacional, t.status);

  return (
    /* A linha inteira abre a tarefa; os controles próprios (status e excluir)
       param a propagação para não navegar junto. O título continua sendo um
       link de verdade — é o que dá acesso por teclado e "abrir em nova aba". */
    <tr
      onClick={() => router.push(`/tarefas/${t.id}`)}
      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-700/40 ${concluida ? "opacity-50" : ""}`}
    >
      <td className="px-3 py-2.5 align-top md:px-4 md:py-2 md:align-middle">
        {/* O ponto vai por cima do seletor porque <select> não aceita elemento
            dentro. `pointer-events-none` mantém o clique passando para ele. */}
        <span className="relative inline-flex items-center">
          <span className="pointer-events-none absolute left-2 z-10 flex">
            <PontoStatus valor={t.status} />
          </span>
          <select
            value={t.status}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Status de: ${t.titulo}`}
            onChange={(e) => onStatus(e.target.value as StatusTarefa)}
            className="toque select-pilula rounded-md border border-slate-300 bg-transparent py-1 pl-7 pr-6 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-300"
          >
            {STATUS_TAREFA.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </td>
      <td className="px-3 py-2.5 md:px-4 md:py-2">
        <Link
          href={`/tarefas/${t.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`text-left font-medium text-gta-navy hover:text-gta-indigo dark:text-slate-100 ${concluida ? "line-through" : ""}`}
        >
          {t.titulo}
        </Link>
        {t.comentarios.length > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 hint"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{t.comentarios.length}</span>
        )}
        {/* No mobile, prioridade/prazo/responsável ficam ocultos nas colunas — mostra o essencial aqui */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
          <MarcaPrioridade valor={t.prioridade} className="text-[11px]" />
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
        <MarcaPrioridade valor={t.prioridade} />
      </td>
      <td className={`hidden whitespace-nowrap px-4 py-2 md:table-cell ${lateCom ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
        {formatPrazoHora(t.prazoComercial, t.horaComercial)}
      </td>
      <td className={`hidden whitespace-nowrap px-4 py-2 md:table-cell ${lateOp ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
        {formatPrazoHora(prazoOp(t), t.horaOperacional)}
      </td>
      <td className="px-1 py-2 text-center align-top md:px-2 md:align-middle">
        <button onClick={(e) => { e.stopPropagation(); onExcluir(); }} className="icon-btn" title="Excluir" aria-label={`Excluir: ${t.titulo}`}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </td>
    </tr>
  );
}
