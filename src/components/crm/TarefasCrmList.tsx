"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, Loading, SectionCard, Segmented } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import {
  TIPO_TAREFA_LABEL,
  TIPOS_TAREFA,
  type Negociacao,
  type TarefaCrm,
  type TipoTarefa,
} from "@/lib/crm/types";
import { classificarTarefa, dataCurta, hojeISO, type ClasseTarefa } from "./util";

type Visao = "pendentes" | "concluidas";

type FormState = {
  negociacaoId: string;
  tipo: TipoTarefa;
  assunto: string;
  data: string;
  hora: string;
  responsavel: string;
  notas: string;
};

interface UsuarioOpcao {
  email: string;
  name: string;
}

const GRUPOS: { classe: ClasseTarefa; titulo: string; tone: "red" | "indigo" | "slate" }[] = [
  { classe: "atrasada", titulo: "Atrasadas", tone: "red" },
  { classe: "hoje", titulo: "Hoje", tone: "indigo" },
  { classe: "proxima", titulo: "Próximas", tone: "slate" },
];

/** `usuarioAtual` (e-mail) vem do servidor — ver o comentário em `NegociacoesList`. */
export function TarefasCrmList({ usuarioAtual }: { usuarioAtual: string }) {
  const [tarefas, setTarefas] = useState<TarefaCrm[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [visao, setVisao] = useState<Visao>("pendentes");
  const [fResponsavel, setFResponsavel] = useState("");

  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FormState>({ negociacaoId: "", tipo: "ligacao", assunto: "", data: hojeISO(), hora: "", responsavel: "", notas: "" });
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/tarefas").then((r) => r.json()),
      fetch("/api/crm/negociacoes").then((r) => r.json()),
      fetch("/api/usuarios").then((r) => r.json()),
    ])
      .then(([t, n, u]) => {
        setTarefas(t.tarefas ?? []);
        setNegociacoes(n.negociacoes ?? []);
        setUsuarios(u.usuarios ?? []);
      })
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  // Só se agenda em negociação em andamento — o servidor recusa as fechadas.
  const negociaveis = useMemo(
    () => negociacoes.filter((n) => n.situacao === "aberta" || n.situacao === "pausada"),
    [negociacoes],
  );

  const hoje = hojeISO();
  const filtradas = useMemo(
    () => tarefas.filter((t) => !fResponsavel || t.responsavel === fResponsavel),
    [tarefas, fResponsavel],
  );
  const porClasse = useMemo(() => {
    const mapa = new Map<ClasseTarefa, TarefaCrm[]>();
    for (const t of filtradas) {
      const c = classificarTarefa(t, hoje);
      mapa.set(c, [...(mapa.get(c) ?? []), t]);
    }
    return mapa;
  }, [filtradas, hoje]);

  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const t of tarefas) if (t.responsavel) mapa.set(t.responsavel, t.responsavelNome || t.responsavel);
    return Array.from(mapa, ([email, nome]) => ({ email, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [tarefas]);

  function atualizarLocal(t: TarefaCrm) {
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  }

  async function concluir(t: TarefaCrm, concluida: boolean) {
    setErro(null);
    const res = await fetch(`/api/crm/tarefas/${t.id}/concluir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concluida }),
    });
    const data = await res.json();
    if (!res.ok) { setErro(data.error ?? "Falha ao concluir."); return; }
    atualizarLocal(data.tarefa as TarefaCrm);
  }

  async function adiar(t: TarefaCrm, novaData: string) {
    if (!novaData || novaData === t.data) return;
    setErro(null);
    const res = await fetch(`/api/crm/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: novaData }),
    });
    const data = await res.json();
    if (!res.ok) { setErro(data.error ?? "Falha ao adiar."); return; }
    atualizarLocal(data.tarefa as TarefaCrm);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.negociacaoId) { setErro("Escolha a negociação."); return; }
    if (!form.assunto.trim()) { setErro("Informe o assunto."); return; }
    setErro(null);
    setSalvando(true);
    try {
      // Mesmo `|| usuarioAtual` do campo: criar sem tocar no seletor tem que
      // agendar para você, não para ninguém.
      const responsavel = form.responsavel || usuarioAtual;
      const usuario = usuarios.find((u) => u.email === responsavel);
      const res = await fetch("/api/crm/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, responsavel, responsavelNome: usuario?.name ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setTarefas((prev) => [...prev, data.tarefa as TarefaCrm].sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`)));
      edicao.marcarSalvo();
      setCriando(false);
      setForm({ negociacaoId: "", tipo: "ligacao", assunto: "", data: hojeISO(), hora: "", responsavel: "", notas: "" });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <Loading>Carregando tarefas…</Loading>;

  const concluidas = (porClasse.get("concluida") ?? []).slice().reverse();

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Barra: visão + filtro + nova tarefa */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Segmented<Visao>
          value={visao}
          onChange={setVisao}
          options={[{ value: "pendentes", label: "Pendentes" }, { value: "concluidas", label: "Concluídas" }]}
          aria="Visão das tarefas"
        />
        <Campo className="min-w-[180px]" label="Responsável">
          <select className="field-input" value={fResponsavel} onChange={(e) => setFResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {responsaveis.map((r) => <option key={r.email} value={r.email}>{r.nome}</option>)}
          </select>
        </Campo>
        <div className="flex-1" />
        {!criando && (
          <button
            className="btn-primary whitespace-nowrap"
            onClick={() => { setErro(null); setCriando(true); }}
            disabled={negociaveis.length === 0}
          >
            + Nova tarefa
          </button>
        )}
      </div>

      {negociaveis.length === 0 && tarefas.length === 0 && (
        <Alert tone="indigo">
          Tarefa é sempre presa a uma negociação em andamento. <Link href="/crm/negociacoes#novo" className="btn-link">Crie uma negociação</Link> para começar a agendar.
        </Alert>
      )}

      {criando && (
        <SectionCard
          title="Nova tarefa"
          actions={<button type="button" className="btn-secondary !py-2 text-sm" onClick={() => { edicao.marcarSalvo(); setCriando(false); }}>Cancelar</button>}
        >
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <Campo className="sm:col-span-3" label="Negociação *">
                <select className="field-input" value={form.negociacaoId} onChange={(e) => set("negociacaoId", e.target.value)}>
                  <option value="">Escolha…</option>
                  {negociaveis.map((n) => <option key={n.id} value={n.id}>{n.nome}{n.empresaNome ? ` — ${n.empresaNome}` : ""}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-3" label="Assunto *">
                <input className="field-input" value={form.assunto} onChange={(e) => set("assunto", e.target.value)} placeholder="Ex.: Apresentar a proposta revisada" />
              </Campo>
              <Campo className="sm:col-span-2" label="Tipo">
                <select className="field-input" value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoTarefa)}>
                  {TIPOS_TAREFA.map((t) => <option key={t} value={t}>{TIPO_TAREFA_LABEL[t]}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-1" label="Data *">
                <input type="date" className="field-input" value={form.data} onChange={(e) => set("data", e.target.value)} required />
              </Campo>
              <Campo className="sm:col-span-1" label="Hora">
                <input type="time" className="field-input" value={form.hora} onChange={(e) => set("hora", e.target.value)} />
              </Campo>
              <Campo className="sm:col-span-2" label="Responsável">
                <select className="field-input" value={form.responsavel || usuarioAtual} onChange={(e) => set("responsavel", e.target.value)}>
                  {usuarios.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Notas">
              <textarea className="field-input min-h-[60px]" value={form.notas} onChange={(e) => set("notas", e.target.value)} placeholder="Contexto para quem vai executar…" />
            </Campo>
            <div className="flex justify-end gap-2">
              <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? "Salvando…" : "Agendar tarefa"}</button>
            </div>
          </form>
        </SectionCard>
      )}

      {visao === "pendentes" ? (
        <div className="space-y-4">
          {GRUPOS.map(({ classe, titulo }) => {
            const grupo = porClasse.get(classe) ?? [];
            if (grupo.length === 0 && classe !== "hoje") return null;
            return (
              <SectionCard key={classe} title={`${titulo} (${grupo.length})`}>
                {grupo.length === 0 ? (
                  <p className="subtitle">Nada por aqui.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {grupo.map((t) => (
                      <LinhaTarefa key={t.id} t={t} atrasada={classe === "atrasada"} onConcluir={concluir} onAdiar={adiar} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })}
        </div>
      ) : concluidas.length === 0 ? (
        <EmptyState>Nenhuma tarefa concluída ainda.</EmptyState>
      ) : (
        <SectionCard title={`Concluídas (${concluidas.length})`}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {concluidas.map((t) => (
              <LinhaTarefa key={t.id} t={t} atrasada={false} onConcluir={concluir} onAdiar={adiar} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function LinhaTarefa({ t, atrasada, onConcluir, onAdiar }: {
  t: TarefaCrm;
  atrasada: boolean;
  onConcluir: (t: TarefaCrm, concluida: boolean) => Promise<void>;
  onAdiar: (t: TarefaCrm, novaData: string) => Promise<void>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <input
        type="checkbox"
        className="toque shrink-0"
        checked={t.concluida}
        onChange={() => void onConcluir(t, !t.concluida)}
        aria-label={`Concluir: ${t.assunto}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${t.concluida ? "text-slate-400 line-through dark:text-slate-500" : "text-gta-navy dark:text-slate-100"}`}>
          <span className="mr-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
          {t.assunto}
        </span>
        <Link href={`/crm/negociacoes/${t.negociacaoId}`} className="hint block truncate hover:underline">
          {t.negociacaoNome}
        </Link>
      </span>
      <span className={`shrink-0 text-xs ${atrasada ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
        {dataCurta(t.data)}{t.hora ? ` ${t.hora}` : ""}
      </span>
      {t.responsavelNome && <span className="hint hidden shrink-0 sm:inline">{t.responsavelNome}</span>}
      {!t.concluida && (
        <label className="hint shrink-0">
          Adiar:{" "}
          <input
            type="date"
            className="field-input inline-block w-auto !py-0.5 text-xs"
            value={t.data}
            onChange={(e) => void onAdiar(t, e.target.value)}
            aria-label={`Adiar: ${t.assunto}`}
          />
        </label>
      )}
    </li>
  );
}
