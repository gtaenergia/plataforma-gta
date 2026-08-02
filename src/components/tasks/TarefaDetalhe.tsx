"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, PageHeader, SectionCard } from "@/components/ui";
import { SeletorTipoDemanda } from "@/components/capacidade/SeletorTipoDemanda";
import { SugestaoResponsavel } from "./SugestaoResponsavel";
import { MarcaPrioridade, MarcaStatus } from "./marcadores";
import { comCategoria, comTipoDemanda, paraPayload, type FormState } from "./formulario";
import { horasParaMin, minParaHoras, useCapacidade } from "@/components/capacidade/comum";
import {
  CATEGORIAS_PADRAO_TAREFA,
  DEMANDANTES,
  PRIORIDADES,
  STATUS_TAREFA,
  demandanteLabel,
  prioridadeLabel,
  statusLabel,
  type Demandante,
  type Prioridade,
  type StatusTarefa,
  type Task,
} from "@/lib/tasks/types";

/**
 * Página de uma tarefa: dados, edição, comentários e exclusão.
 *
 * Tudo isso vivia dentro de uma linha expandida da tabela. Com a classificação
 * da demanda e a indicação de responsável somadas ao formulário, aquela linha
 * passou a ser a tela mais apertada do módulo — e é onde a tarefa é de fato
 * acompanhada. Segue o mesmo desenho de /aprovacoes/[id], que já era a página
 * de detalhe de orçamento.
 */

interface Usuario {
  email: string;
  name: string;
}

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatPrazo(data: string, hora: string): string {
  if (!data) return "—";
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}${hora ? ` ${hora}` : ""}`;
}

function paraFormulario(t: Task): FormState {
  return {
    titulo: t.titulo,
    descricao: t.descricao,
    cliente: t.cliente ?? "",
    categoria: t.categoria ?? "",
    tipoDemanda: t.tipoDemanda ?? "",
    demandante: t.demandante || "operacional",
    responsavel: t.responsavel,
    prioridade: t.prioridade,
    prazoComercial: t.prazoComercial ?? "",
    prazoOperacional: t.prazoOperacional || t.prazo || "",
    horaComercial: t.horaComercial ?? "",
    horaOperacional: t.horaOperacional ?? "",
    estimativaHoras: minParaHoras(t.estimativaMin ?? 0),
  };
}

export function TarefaDetalhe({
  inicial,
  podeEditarCatalogo,
}: {
  inicial: Task;
  podeEditarCatalogo: boolean;
}) {
  const router = useRouter();
  const { config: capacidade, setConfig } = useCapacidade();
  const [tarefa, setTarefa] = useState<Task>(inicial);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormState>(() => paraFormulario(inicial));
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [ru, rt] = await Promise.all([fetch("/api/usuarios"), fetch("/api/tarefas")]);
        const [du, dt] = await Promise.all([ru.json(), rt.json()]);
        setUsuarios(du.usuarios ?? []);
        setTarefas(dt.tasks ?? []);
      } catch {
        /* a indicação de responsável fica indisponível; a edição continua */
      }
    })();
  }, []);

  const nomeDe = useMemo(() => {
    const m = new Map(usuarios.map((u) => [u.email, u.name]));
    return (email: string) => m.get(email) ?? (email || "—");
  }, [usuarios]);

  const clientes = useMemo(() => {
    const s = new Set<string>();
    tarefas.forEach((t) => t.cliente && s.add(t.cliente));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas]);

  const categorias = useMemo(() => {
    const s = new Set<string>(CATEGORIAS_PADRAO_TAREFA);
    for (const t of capacidade.tipos) if (t.categoria.trim()) s.add(t.categoria.trim());
    tarefas.forEach((t) => t.categoria && s.add(t.categoria));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas, capacidade.tipos]);

  async function enviar(patch: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/tarefas/${tarefa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setTarefa(data.task);
      setForm(paraFormulario(data.task));
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function comentar() {
    const texto = comentario.trim();
    if (!texto) return;
    setErro(null);
    try {
      const res = await fetch(`/api/tarefas/${tarefa.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao comentar.");
      setTarefa(data.task);
      setComentario("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao comentar.");
    }
  }

  async function excluir() {
    if (!confirm(`Excluir a tarefa “${tarefa.titulo}”? A ação não pode ser desfeita.`)) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/tarefas/${tarefa.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Falha ao excluir.");
      router.refresh();
      router.push("/tarefas");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir.");
      setSalvando(false);
    }
  }

  async function adicionarAoCatalogo(categoria: string, nome: string, minutos: number) {
    const id = `tipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const atualizada = { ...capacidade, tipos: [...capacidade.tipos, { id, categoria, nome, minutos }] };
    const res = await fetch("/api/planejamento", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(atualizada),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao adicionar ao catálogo.");
    setConfig(data.config);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tarefa.titulo}
        subtitle={
          <>
            Criada por {nomeDe(tarefa.criadoPor)} em {formatDataHora(tarefa.criadoEm)} · Atualizada em{" "}
            {formatDataHora(tarefa.atualizadoEm)}
          </>
        }
        actions={
          <select
            aria-label="Status da tarefa"
            className="field-input !w-auto"
            value={tarefa.status}
            onChange={(e) => enviar({ status: e.target.value })}
          >
            {STATUS_TAREFA.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        }
      />

      {erro && <Alert tone="red">{erro}</Alert>}

      <datalist id="det-clientes">
        {clientes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="det-categorias">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {!editando ? (
        <SectionCard
          title="Dados da tarefa"
          actions={
            <button className="btn-secondary" onClick={() => setEditando(true)}>
              Editar
            </button>
          }
        >
          <p className="mb-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
            {tarefa.descricao || <span className="sem-valor italic">Sem descrição.</span>}
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Campo rotulo="Status">
              <MarcaStatus valor={tarefa.status} />
            </Campo>
            <Campo rotulo="Prioridade">
              <MarcaPrioridade valor={tarefa.prioridade} />
            </Campo>
            <Campo rotulo="Responsável">{nomeDe(tarefa.responsavel)}</Campo>
            <Campo rotulo="Cliente">{tarefa.cliente || <span className="sem-valor">—</span>}</Campo>
            <Campo rotulo="Categoria">{tarefa.categoria || <span className="sem-valor">—</span>}</Campo>
            <Campo rotulo="Tipo de demanda">{tarefa.tipoDemanda || <span className="sem-valor">—</span>}</Campo>
            <Campo rotulo="Demandante">
              {demandanteLabel(tarefa.demandante) || <span className="sem-valor">—</span>}
            </Campo>
            <Campo rotulo="Estimativa">
              {tarefa.estimativaMin > 0 ? (
                `${minParaHoras(tarefa.estimativaMin)} h`
              ) : (
                <span className="sem-valor">não informada</span>
              )}
            </Campo>
            <Campo rotulo="Prazo comercial">{formatPrazo(tarefa.prazoComercial, tarefa.horaComercial)}</Campo>
            <Campo rotulo="Prazo operacional">
              {formatPrazo(tarefa.prazoOperacional || tarefa.prazo, tarefa.horaOperacional)}
            </Campo>
          </dl>
        </SectionCard>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await enviar(paraPayload(form) as unknown as Record<string, unknown>)) setEditando(false);
          }}
          className="space-y-6"
        >
          <SectionCard title="Identificação">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <label className="field-label" htmlFor="ed-titulo">Título *</label>
                <input id="ed-titulo" className="field-input" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              </div>
              <div className="sm:col-span-6">
                <label className="field-label" htmlFor="ed-descricao">Descrição</label>
                <textarea id="ed-descricao" className="field-input min-h-[90px]" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="ed-cliente">Cliente</label>
                <input id="ed-cliente" className="field-input" list="det-clientes" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="ed-demandante">Demandante</label>
                <select id="ed-demandante" className="field-input" value={form.demandante} onChange={(e) => setForm({ ...form, demandante: e.target.value as Demandante })}>
                  {DEMANDANTES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Classificação" subtitle="Define quanto tempo a demanda costuma levar.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="ed-categoria">Categoria</label>
                <input id="ed-categoria" className="field-input" list="det-categorias" value={form.categoria} onChange={(e) => setForm(comCategoria(form, e.target.value))} />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="ed-tipo">Tipo de demanda</label>
                <SeletorTipoDemanda
                  id="ed-tipo"
                  categoria={form.categoria}
                  valor={form.tipoDemanda}
                  config={capacidade}
                  estimativaMin={horasParaMin(form.estimativaHoras)}
                  onEstimativaChange={(min) => setForm({ ...form, estimativaHoras: minParaHoras(min) })}
                  onAdicionarAoCatalogo={podeEditarCatalogo ? adicionarAoCatalogo : undefined}
                  onChange={(v) => setForm(comTipoDemanda(form, v, capacidade))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="ed-prioridade">Prioridade</label>
                <select id="ed-prioridade" className="field-input" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}>
                  {PRIORIDADES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Execução">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="ed-estimativa">Estimativa (h)</label>
                <input id="ed-estimativa" type="number" min={0} step={0.5} className="field-input" value={form.estimativaHoras} onChange={(e) => setForm({ ...form, estimativaHoras: e.target.value })} />
              </div>
              <div className="sm:col-span-4">
                <label className="field-label" htmlFor="ed-responsavel">Responsável</label>
                <select id="ed-responsavel" className="field-input" value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })}>
                  {!usuarios.some((u) => u.email === form.responsavel) && form.responsavel && (
                    <option value={form.responsavel}>{form.responsavel}</option>
                  )}
                  <option value="">Sem responsável</option>
                  {usuarios.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* A indicação só aparece quando ninguém está atribuído: é o caso
                  em que ela ajuda — redistribuir o que ficou parado. */}
              {!form.responsavel && (
                <div className="sm:col-span-6">
                  <SugestaoResponsavel
                    config={capacidade}
                    usuarios={usuarios}
                    tarefas={tarefas}
                    categoria={form.categoria}
                    tipoDemanda={form.tipoDemanda}
                    prioridade={form.prioridade}
                    estimativaMin={horasParaMin(form.estimativaHoras)}
                    responsavelEscolhido={form.responsavel}
                    ignorarTarefaId={tarefa.id}
                    onEscolher={(email, prazo) => setForm({ ...form, responsavel: email, prazoOperacional: prazo })}
                  />
                </div>
              )}

              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="ed-prazo-com">Prazo comercial</label>
                <div className="flex gap-2">
                  <input id="ed-prazo-com" type="date" className="field-input min-w-0 flex-1" value={form.prazoComercial} onChange={(e) => setForm({ ...form, prazoComercial: e.target.value })} />
                  <input type="time" aria-label="Hora do prazo comercial" className="field-input min-w-0 flex-1" value={form.horaComercial} onChange={(e) => setForm({ ...form, horaComercial: e.target.value })} />
                </div>
              </div>
              <div className="sm:col-span-3">
                <label className="field-label" htmlFor="ed-prazo-op">Prazo operacional</label>
                <div className="flex gap-2">
                  <input id="ed-prazo-op" type="date" className="field-input min-w-0 flex-1" value={form.prazoOperacional} onChange={(e) => setForm({ ...form, prazoOperacional: e.target.value })} />
                  <input type="time" aria-label="Hora do prazo operacional" className="field-input min-w-0 flex-1" value={form.horaOperacional} onChange={(e) => setForm({ ...form, horaOperacional: e.target.value })} />
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar alterações"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setForm(paraFormulario(tarefa));
                setEditando(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <SectionCard title={`Comentários (${tarefa.comentarios.length})`}>
        {tarefa.comentarios.length === 0 ? (
          <p className="hint">Nenhum comentário.</p>
        ) : (
          <ul className="space-y-2">
            {tarefa.comentarios.map((c) => (
              <li key={c.id} className="subcard !p-3">
                <span className="font-medium text-gta-navy dark:text-slate-100">{c.autor}</span>
                <span className="ml-2 hint">{formatDataHora(c.em)}</span>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            comentar();
          }}
        >
          <input
            aria-label="Novo comentário"
            className="field-input"
            placeholder="Escreva um comentário…"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <button type="submit" className="btn-secondary w-full sm:w-auto">
            Comentar
          </button>
        </form>
      </SectionCard>

      <div className="flex justify-end">
        <button type="button" className="btn-danger" onClick={excluir} disabled={salvando}>
          Excluir tarefa
        </button>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="hint">{rotulo}</dt>
      <dd className="mt-0.5 text-slate-700 dark:text-slate-300">{children}</dd>
    </div>
  );
}
