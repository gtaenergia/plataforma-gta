"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Phone, Repeat } from "lucide-react";
import { Alert, EmptyState, Loading, Marca, SectionCard, Segmented } from "@/components/ui";
import type { Cliente } from "@/lib/clientes/types";
import { linkWhatsApp, rotuloDoDia, type Agenda, type ContatoAgenda, type ItemAgenda } from "@/lib/crm/agenda";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import { SITUACAO_LABEL, TIPO_TAREFA_LABEL, type Funil, type ItemCatalogo, type Negociacao } from "@/lib/crm/types";
import type { OpcaoResponsavel } from "@/lib/users/equipe";
import { AgendarCompromisso } from "./AgendarCompromisso";
import { buscarJson, enviarJson } from "./buscar";
import { ConcluirCompromisso } from "./ConcluirCompromisso";
import { dataCurta, dataHora } from "./util";

type Quem = "equipe" | "meus";

/** A janela abre numa semana e cresce de semana em semana. */
const SEMANA = 7;

/**
 * Agenda de follow-ups e atividades — o quadro do Início do CRM.
 *
 * Dia a dia, quem o comercial precisa procurar: o cliente, com quem falar e
 * por onde, em que etapa a conversa está, quantos contatos já foram feitos e
 * quem fez o último. "Concluir" registra o contato e já agenda o próximo.
 *
 * `onMudou` avisa o painel: concluir pode mover a negociação de etapa ou
 * fechá-la, e os números lá de cima mudam junto.
 */
export function AgendaCrm({ usuarioAtual, onMudou }: { usuarioAtual: string; onMudou?: () => void }) {
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [hoje, setHoje] = useState("");
  const [quem, setQuem] = useState<Quem>("equipe");
  const [dias, setDias] = useState(SEMANA);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // O que o quadro de concluir e o de agendar precisam — pedido uma vez.
  const [funis, setFunis] = useState<Funil[]>([]);
  const [motivos, setMotivos] = useState<ItemCatalogo[]>([]);
  const [usuarios, setUsuarios] = useState<OpcaoResponsavel[]>([]);
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);

  const [aberto, setAberto] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [agendando, setAgendando] = useState(false);

  const carregar = useCallback(async () => {
    const q = new URLSearchParams({ dias: String(dias) });
    if (quem === "meus") q.set("responsavel", usuarioAtual);
    const d = await buscarJson<{ agenda: Agenda; hoje: string }>(`/api/crm/agenda?${q}`);
    setAgenda(d.agenda);
    setHoje(d.hoje);
  }, [dias, quem, usuarioAtual]);

  useEffect(() => {
    setCarregando(true);
    carregar()
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar a agenda."))
      .finally(() => setCarregando(false));
  }, [carregar]);

  useEffect(() => {
    Promise.all([
      buscarJson<{ funis: Funil[] }>("/api/crm/funis").then((d) => setFunis(d.funis ?? [])),
      buscarJson<{ motivos: ItemCatalogo[] }>("/api/crm/motivos-perda").then((d) => setMotivos(d.motivos ?? [])),
      buscarJson<{ usuarios: OpcaoResponsavel[] }>("/api/usuarios?equipe=comercial").then((d) => setUsuarios(d.usuarios ?? [])),
    ]).catch(() => {
      /* sem isto o "Concluir" perde a lista de etapas; a agenda continua de pé */
    });
  }, []);

  async function recarregar() {
    try {
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao recarregar a agenda.");
    }
    onMudou?.();
  }

  async function abrirAgendamento() {
    setAviso(null);
    setAgendando(true);
    if (clientes) return;
    try {
      const [c, n] = await Promise.all([
        buscarJson<{ clientes: Cliente[] }>("/api/clientes"),
        buscarJson<{ negociacoes: Negociacao[] }>("/api/crm/negociacoes"),
      ]);
      setClientes(c.clientes ?? []);
      setNegociacoes(n.negociacoes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao abrir o agendamento.");
      setAgendando(false);
    }
  }

  async function adiar(item: ItemAgenda, data: string) {
    // Digitando o ano pelo teclado, o campo de data dispara valores parciais
    // ("0002-10-29") a cada tecla — e cada um viraria um PATCH.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < "2000-01-01" || data === item.tarefa.data) return;
    setErro(null);
    try {
      await enviarJson(`/api/crm/tarefas/${item.tarefa.id}`, "PATCH", { data });
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao adiar.");
    }
  }

  const vazia = !!agenda && agenda.atrasados.length === 0 && agenda.dias.length === 0;

  const linha = (item: ItemAgenda, atrasado: boolean) => (
    <LinhaAgenda
      key={item.tarefa.id}
      item={item}
      atrasado={atrasado}
      aberto={aberto === item.tarefa.id}
      onAlternar={() => setAberto((a) => (a === item.tarefa.id ? null : item.tarefa.id))}
      concluindo={concluindo === item.tarefa.id}
      onConcluir={() => { setAviso(null); setConcluindo(item.tarefa.id); }}
      onAdiar={(d) => void adiar(item, d)}
      painel={
        <ConcluirCompromisso
          tarefa={item.tarefa}
          negociacao={item.negociacao}
          funil={funis.find((f) => f.id === item.negociacao?.funilId) ?? null}
          motivos={motivos}
          usuarios={usuarios}
          usuarioAtual={usuarioAtual}
          onConcluido={(c) => {
            setConcluindo(null);
            setAberto(null);
            if (c.aviso) setAviso(c.aviso);
            void recarregar();
          }}
          onCancelar={() => setConcluindo(null)}
        />
      }
    />
  );

  return (
    <SectionCard
      title="Agenda de follow-ups e atividades"
      subtitle="Quem o comercial precisa procurar, dia a dia. Concluir registra o contato e já agenda o próximo."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Quem>
            value={quem}
            onChange={setQuem}
            options={[{ value: "equipe", label: "Equipe" }, { value: "meus", label: "Só os meus" }]}
            aria="De quem são os compromissos"
          />
          {!agendando && (
            <button className="btn-secondary !py-1.5 text-sm" onClick={() => void abrirAgendamento()}>
              + Agendar
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {erro && <Alert tone="red">{erro}</Alert>}
        {aviso && <Alert tone="amber">{aviso}</Alert>}

        {agendando && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            {clientes === null ? (
              <Loading>Carregando clientes…</Loading>
            ) : clientes.length === 0 ? (
              <EmptyState>
                Nenhum cliente cadastrado. <Link href="/crm/clientes" className="btn-link">Cadastre o primeiro</Link> para agendar.
              </EmptyState>
            ) : (
              <AgendarCompromisso
                clientes={clientes}
                negociacoes={negociacoes}
                usuarios={usuarios}
                usuarioAtual={usuarioAtual}
                onAgendado={() => { setAgendando(false); void recarregar(); }}
                onCancelar={() => setAgendando(false)}
              />
            )}
          </div>
        )}

        {carregando && !agenda ? (
          <Loading>Carregando a agenda…</Loading>
        ) : !agenda ? null : vazia ? (
          <EmptyState>
            Nenhum compromisso de hoje até {dataCurta(agenda.ate)}
            {quem === "meus" ? " para você" : ""}. Agende o próximo contato na ficha do cliente ou em{" "}
            <button className="btn-link" onClick={() => void abrirAgendamento()}>+ Agendar</button>.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {agenda.atrasados.length > 0 && (
              <GrupoAgenda
                titulo={`Atrasados · ${agenda.atrasados.length}`}
                tone="red"
                itens={agenda.atrasados.map((i) => linha(i, true))}
              />
            )}
            {/* Hoje aparece mesmo vazio: é a primeira pergunta de quem abre. */}
            {!agenda.dias.some((d) => d.data === hoje) && (
              <GrupoAgenda titulo={`Hoje · ${dataCurta(hoje)}`} tone="indigo" itens={[]} />
            )}
            {agenda.dias.map((d) => (
              <GrupoAgenda
                key={d.data}
                titulo={`${rotuloDoDia(d.data, hoje)} · ${dataCurta(d.data)} · ${d.itens.length} ${d.itens.length === 1 ? "cliente" : "clientes"}`}
                tone={d.data === hoje ? "indigo" : "slate"}
                itens={d.itens.map((i) => linha(i, false))}
              />
            ))}
          </div>
        )}

        {agenda && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-700">
            <span className="hint">
              {agenda.depois > 0
                ? `Mais ${agenda.depois} ${agenda.depois === 1 ? "compromisso" : "compromissos"} depois de ${dataCurta(agenda.ate)}.`
                : `Nada marcado depois de ${dataCurta(agenda.ate)}.`}
            </span>
            <span className="flex flex-wrap gap-3">
              {agenda.depois > 0 && (
                <button className="btn-link" onClick={() => setDias((d) => Math.min(60, d + SEMANA))} disabled={carregando}>
                  Mostrar mais uma semana
                </button>
              )}
              <Link href="/crm/tarefas" className="btn-link">Todas as tarefas</Link>
            </span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function GrupoAgenda({ titulo, tone, itens }: { titulo: string; tone: "red" | "indigo" | "slate"; itens: React.ReactNode[] }) {
  const cor =
    tone === "red"
      ? "text-red-700 dark:text-red-400"
      : tone === "indigo"
        ? "text-gta-indigo dark:text-indigo-300"
        : "text-slate-600 dark:text-slate-400";
  return (
    <div>
      <h3 className={`text-xs font-semibold uppercase tracking-wide ${cor}`}>{titulo}</h3>
      {itens.length === 0 ? (
        <p className="subtitle mt-1">Nenhum contato marcado para hoje.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">{itens}</ul>
      )}
    </div>
  );
}

function Contato({ c }: { c: ContatoAgenda }) {
  const whats = c.telefone ? linkWhatsApp(c.telefone) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {c.nome && <span className="text-slate-700 dark:text-slate-300">{c.nome}{c.cargo ? ` (${c.cargo})` : ""}</span>}
      {c.telefone && (
        <a href={`tel:${c.telefone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:underline">
          <Phone className="h-3 w-3" aria-hidden />
          {c.telefone}
        </a>
      )}
      {whats && (
        <a href={whats} target="_blank" rel="noopener noreferrer" className="hover:underline">WhatsApp</a>
      )}
      {c.email && <a href={`mailto:${c.email}`} className="truncate hover:underline">{c.email}</a>}
    </span>
  );
}

function LinhaAgenda({ item, atrasado, aberto, onAlternar, concluindo, onConcluir, onAdiar, painel }: {
  item: ItemAgenda;
  atrasado: boolean;
  aberto: boolean;
  onAlternar: () => void;
  concluindo: boolean;
  onConcluir: () => void;
  onAdiar: (data: string) => void;
  painel: React.ReactNode;
}) {
  const t = item.tarefa;
  const principal = item.contatos[0];
  const n = item.negociacao;
  const emAndamento = !!n && (n.situacao === "aberta" || n.situacao === "pausada");

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {item.cliente.id ? (
              <Link href={`/crm/clientes/${item.cliente.id}`} className="font-medium text-gta-navy hover:underline dark:text-slate-100">
                {item.cliente.nome || "Cliente sem nome"}
              </Link>
            ) : (
              <span className="font-medium text-gta-navy dark:text-slate-100">{item.cliente.nome || "Cliente sem cadastro"}</span>
            )}
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {TIPO_TAREFA_LABEL[t.tipo]} · {t.assunto}
            </span>
            {t.repetirCada > 0 && (
              <span className="hint inline-flex items-center gap-1" title={descreverRepeticao(t.repetirCada, t.repetirUnidade)}>
                <Repeat className="h-3 w-3" aria-hidden />
                {descreverRepeticao(t.repetirCada, t.repetirUnidade)}
              </span>
            )}
          </div>
          <div className="hint mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {principal ? <Contato c={principal} /> : <span>Sem contato cadastrado</span>}
            {emAndamento ? (
              <Marca tone="indigo" className="text-xs">{item.etapa || n.nome}</Marca>
            ) : n ? (
              <Marca tone={n.situacao === "ganha" ? "green" : "red"} className="text-xs">{SITUACAO_LABEL[n.situacao]}</Marca>
            ) : (
              <span>Sem negociação em andamento</span>
            )}
            <span>
              {item.feitos} {item.feitos === 1 ? "follow-up feito" : "follow-ups feitos"}
            </span>
            <span>
              {item.ultimo ? `Último: ${dataCurta(item.ultimo.em.slice(0, 10))} por ${item.ultimo.por}` : "Primeiro contato"}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className={`text-xs ${atrasado ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
            {atrasado ? `Era ${dataCurta(t.data)}` : t.hora || ""}
            {t.responsavelNome ? `${atrasado || t.hora ? " · " : ""}${t.responsavelNome}` : ""}
          </span>
          {!concluindo && (
            <button className="btn-primary !py-1 text-xs" onClick={onConcluir}>
              Concluir
            </button>
          )}
          <button
            className="btn-ghost !px-2 !py-1 text-xs"
            onClick={onAlternar}
            aria-expanded={aberto}
            aria-label={`${aberto ? "Esconder" : "Ver"} detalhes de ${item.cliente.nome}`}
          >
            {aberto ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            Detalhes
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/50">
          {t.notas && (
            <div>
              <div className="field-label">Notas do agendamento</div>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{t.notas}</p>
            </div>
          )}

          <div>
            <div className="field-label">Contatos</div>
            {item.contatos.length === 0 ? (
              <p className="hint">
                Nenhum contato cadastrado.{" "}
                {item.cliente.id && <Link href={`/crm/clientes/${item.cliente.id}`} className="btn-link">Abrir a ficha</Link>}
              </p>
            ) : (
              <ul className="hint space-y-1">
                {item.contatos.map((c, i) => <li key={i}><Contato c={c} /></li>)}
              </ul>
            )}
          </div>

          {n && (
            <div>
              <div className="field-label">Negociação</div>
              <Link href={`/crm/negociacoes/${n.id}`} className="btn-link">{n.nome}</Link>
              <span className="hint"> · {emAndamento ? item.etapa || "—" : SITUACAO_LABEL[n.situacao]}</span>
            </div>
          )}

          <div>
            <div className="field-label">Últimos comentários</div>
            {item.recentes.length === 0 ? (
              <p className="hint">Nenhum comentário registrado com este cliente ainda.</p>
            ) : (
              <ol className="space-y-2">
                {item.recentes.map((r, i) => (
                  <li key={i}>
                    <div className="hint">
                      {dataHora(r.em)} · {r.por} · {TIPO_TAREFA_LABEL[r.tipo]}: {r.assunto}
                    </div>
                    <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{r.comentario}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
            <label className="hint">
              Adiar para{" "}
              <input
                type="date"
                className="field-input inline-block w-auto !py-0.5 text-xs"
                defaultValue={t.data}
                onChange={(e) => onAdiar(e.target.value)}
                aria-label={`Adiar o contato com ${item.cliente.nome}`}
              />
            </label>
            {item.cliente.id && (
              <Link href={`/crm/clientes/${item.cliente.id}`} className="btn-link text-sm">Ficha do cliente</Link>
            )}
          </div>
        </div>
      )}

      {concluindo && painel}
    </li>
  );
}
