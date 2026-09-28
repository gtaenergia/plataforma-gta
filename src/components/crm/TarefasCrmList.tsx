"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { Alert, EmptyState, Loading, SectionCard, Segmented } from "@/components/ui";
import { Campo } from "@/components/Campo";
import type { Cliente } from "@/lib/clientes/types";
import { clienteDaTarefa, negociacaoDeReferencia, quemFez } from "@/lib/crm/followups";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import {
  TIPO_TAREFA_LABEL,
  type Funil,
  type ItemCatalogo,
  type Negociacao,
  type TarefaCrm,
} from "@/lib/crm/types";
import type { OpcaoResponsavel } from "@/lib/users/equipe";
import { AgendarCompromisso } from "./AgendarCompromisso";
import { buscarJson, enviarJson } from "./buscar";
import { ConcluirCompromisso } from "./ConcluirCompromisso";
import { classificarTarefa, dataCurta, dataHora, hojeISO, type ClasseTarefa } from "./util";

type Visao = "pendentes" | "concluidas";

const GRUPOS: { classe: ClasseTarefa; titulo: string; tone: "red" | "indigo" | "slate" }[] = [
  { classe: "atrasada", titulo: "Atrasadas", tone: "red" },
  { classe: "hoje", titulo: "Hoje", tone: "indigo" },
  { classe: "proxima", titulo: "Próximas", tone: "slate" },
];

/** `usuarioAtual` (e-mail) vem do servidor — ver o comentário em `NegociacoesList`. */
export function TarefasCrmList({ usuarioAtual }: { usuarioAtual: string }) {
  const [tarefas, setTarefas] = useState<TarefaCrm[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [motivos, setMotivos] = useState<ItemCatalogo[]>([]);
  const [usuarios, setUsuarios] = useState<OpcaoResponsavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [visao, setVisao] = useState<Visao>("pendentes");
  const [fResponsavel, setFResponsavel] = useState("");
  const [criando, setCriando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);

  /** Tarefas e negociações andam juntas: concluir pode mover a etapa e gerar a próxima. */
  const carregarMovimento = useCallback(async () => {
    const [t, n] = await Promise.all([
      buscarJson<{ tarefas: TarefaCrm[] }>("/api/crm/tarefas"),
      buscarJson<{ negociacoes: Negociacao[] }>("/api/crm/negociacoes"),
    ]);
    setTarefas(t.tarefas ?? []);
    setNegociacoes(n.negociacoes ?? []);
  }, []);

  useEffect(() => {
    Promise.all([
      carregarMovimento(),
      buscarJson<{ clientes: Cliente[] }>("/api/clientes").then((d) => setClientes(d.clientes ?? [])),
      buscarJson<{ funis: Funil[] }>("/api/crm/funis").then((d) => setFunis(d.funis ?? [])),
      buscarJson<{ motivos: ItemCatalogo[] }>("/api/crm/motivos-perda").then((d) => setMotivos(d.motivos ?? [])),
      buscarJson<{ usuarios: OpcaoResponsavel[] }>("/api/usuarios?equipe=comercial").then((d) => setUsuarios(d.usuarios ?? [])),
    ])
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
  }, [carregarMovimento]);

  async function recarregar() {
    try {
      await carregarMovimento();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao recarregar.");
    }
  }

  const porNegociacao = useMemo(() => new Map(negociacoes.map((n) => [n.id, n])), [negociacoes]);
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

  async function reabrir(t: TarefaCrm) {
    if (!window.confirm(`Reabrir "${t.assunto}"?\n\nO contato deixa de contar como feito, e o próximo que ele agendou sai da agenda.`)) return;
    setErro(null);
    try {
      await enviarJson(`/api/crm/tarefas/${t.id}/concluir`, "POST", { concluida: false });
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reabrir.");
    }
  }

  async function adiar(t: TarefaCrm, novaData: string) {
    if (!novaData || novaData === t.data) return;
    setErro(null);
    try {
      const d = await enviarJson<{ tarefa: TarefaCrm }>(`/api/crm/tarefas/${t.id}`, "PATCH", { data: novaData });
      setTarefas((prev) => prev.map((x) => (x.id === t.id ? d.tarefa : x)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adiar.");
    }
  }

  if (loading) return <Loading>Carregando tarefas…</Loading>;

  const concluidas = (porClasse.get("concluida") ?? [])
    .slice()
    .sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data));

  const linha = (t: TarefaCrm, atrasada: boolean) => {
    const cliente = clienteDaTarefa(t, porNegociacao);
    const neg = negociacaoDeReferencia(t, cliente, negociacoes);
    return (
      <LinhaTarefa
        key={t.id}
        t={t}
        clienteNome={cliente.nome}
        clienteId={cliente.id}
        atrasada={atrasada}
        onAdiar={adiar}
        onReabrir={reabrir}
        concluindo={concluindo === t.id}
        onConcluir={() => { setAviso(null); setConcluindo(t.id); }}
        painel={
          <ConcluirCompromisso
            tarefa={t}
            negociacao={neg}
            funil={funis.find((f) => f.id === neg?.funilId) ?? null}
            motivos={motivos}
            usuarios={usuarios}
            usuarioAtual={usuarioAtual}
            onConcluido={(c) => {
              setConcluindo(null);
              if (c.aviso) setAviso(c.aviso);
              void recarregar();
            }}
            onCancelar={() => setConcluindo(null)}
          />
        }
      />
    );
  };

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}
      {aviso && <Alert tone="amber">{aviso}</Alert>}

      {/* Barra: visão + filtro + novo compromisso */}
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
            disabled={clientes.length === 0}
          >
            + Novo follow-up / tarefa
          </button>
        )}
      </div>

      {clientes.length === 0 && tarefas.length === 0 && (
        <Alert tone="indigo">
          Todo compromisso é com um cliente. <Link href="/crm/clientes" className="btn-link">Cadastre um cliente</Link> para começar a agendar.
        </Alert>
      )}

      {criando && (
        <SectionCard title="Novo follow-up ou tarefa">
          <AgendarCompromisso
            clientes={clientes}
            negociacoes={negociacoes}
            usuarios={usuarios}
            usuarioAtual={usuarioAtual}
            onAgendado={() => { setCriando(false); void recarregar(); }}
            onCancelar={() => setCriando(false)}
          />
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
                    {grupo.map((t) => linha(t, classe === "atrasada"))}
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
            {concluidas.map((t) => linha(t, false))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function LinhaTarefa({ t, clienteNome, clienteId, atrasada, concluindo, painel, onConcluir, onAdiar, onReabrir }: {
  t: TarefaCrm;
  clienteNome: string;
  clienteId: string;
  atrasada: boolean;
  concluindo: boolean;
  painel: React.ReactNode;
  onConcluir: () => void;
  onAdiar: (t: TarefaCrm, novaData: string) => Promise<void>;
  onReabrir: (t: TarefaCrm) => Promise<void>;
}) {
  // A tarefa aponta para a negociação quando tem uma; o follow-up só de
  // cliente aponta para a ficha do cliente.
  const destino = t.negociacaoId
    ? { href: `/crm/negociacoes/${t.negociacaoId}`, rotulo: [t.negociacaoNome, clienteNome].filter(Boolean).join(" · ") }
    : clienteId
      ? { href: `/crm/clientes/${clienteId}`, rotulo: clienteNome }
      : null;

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${t.concluida ? "text-slate-500 dark:text-slate-400" : "text-gta-navy dark:text-slate-100"}`}>
            <span className="mr-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
            {t.assunto}
          </span>
          <span className="hint flex flex-wrap items-center gap-x-2">
            {destino ? (
              <Link href={destino.href} className="truncate hover:underline">{destino.rotulo}</Link>
            ) : (
              <span>{clienteNome || "—"}</span>
            )}
            {t.repetirCada > 0 && !t.concluida && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" aria-hidden />
                {descreverRepeticao(t.repetirCada, t.repetirUnidade)}
              </span>
            )}
          </span>
        </span>
        <span className={`shrink-0 text-xs ${atrasada ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
          {t.concluida && t.concluidaEm ? `Feito em ${dataHora(t.concluidaEm)}` : `${dataCurta(t.data)}${t.hora ? ` ${t.hora}` : ""}`}
        </span>
        {t.responsavelNome && !t.concluida && <span className="hint hidden shrink-0 sm:inline">{t.responsavelNome}</span>}
        {!t.concluida ? (
          <>
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
            {!concluindo && (
              <button className="btn-secondary !py-1 text-xs" onClick={onConcluir}>
                Concluir
              </button>
            )}
          </>
        ) : (
          <button className="btn-link shrink-0 text-xs" onClick={() => void onReabrir(t)}>Reabrir</button>
        )}
      </div>
      {t.concluida && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          <span className="font-medium">{quemFez(t)}</span>
          {t.comentario ? <span className="whitespace-pre-wrap"> — {t.comentario}</span> : null}
        </p>
      )}
      {!t.concluida && t.notas && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{t.notas}</p>}
      {concluindo && painel}
    </li>
  );
}
