"use client";

import { useState } from "react";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { Alert, EmptyState, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import type { Cliente } from "@/lib/clientes/types";
import { negociacaoDeReferencia, quemFez, resumoFollowUps } from "@/lib/crm/followups";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import { TIPO_TAREFA_LABEL, type Funil, type ItemCatalogo, type Negociacao, type TarefaCrm } from "@/lib/crm/types";
import type { OpcaoResponsavel } from "@/lib/users/equipe";
import { AgendarCompromisso } from "./AgendarCompromisso";
import { enviarJson } from "./buscar";
import { ConcluirCompromisso } from "./ConcluirCompromisso";
import { dataCurta, dataHora, hojeISO } from "./util";

/** Quantos contatos feitos aparecem antes do "ver todos". */
const FEITOS_VISIVEIS = 5;

/**
 * Os follow-ups de um cliente, dentro da ficha dele.
 *
 * Responde, antes de ligar: quantas vezes já falamos com ele, quando foi a
 * última, quem falou e o que ele disse — e quando é a próxima.
 */
export function FollowUpsDoCliente({ cliente, tarefas, negociacoes, funis, motivos, usuarios, usuarioAtual, onMudou }: {
  cliente: Cliente;
  /** Só as deste cliente (ver `tarefasDoCliente`). */
  tarefas: TarefaCrm[];
  /** Só as deste cliente. */
  negociacoes: Negociacao[];
  funis: Funil[];
  motivos: ItemCatalogo[];
  usuarios: OpcaoResponsavel[];
  usuarioAtual: string;
  onMudou: () => void;
}) {
  const [agendando, setAgendando] = useState(false);
  const [concluindo, setConcluindo] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const resumo = resumoFollowUps(tarefas);
  const hoje = hojeISO();
  const feitos = verTodos ? resumo.concluidas : resumo.concluidas.slice(0, FEITOS_VISIVEIS);

  async function reabrir(t: TarefaCrm) {
    if (!window.confirm(`Reabrir "${t.assunto}"?\n\nO contato deixa de contar como feito, e o próximo que ele agendou sai da agenda.`)) return;
    setErro(null);
    try {
      await enviarJson(`/api/crm/tarefas/${t.id}/concluir`, "POST", { concluida: false });
      onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reabrir.");
    }
  }

  return (
    <SectionCard
      title="Follow-ups"
      subtitle="Os contatos com este cliente: quem falou, o que ficou combinado e quando é o próximo."
      actions={
        !agendando && (
          <button className="btn-secondary !py-1.5 text-sm" onClick={() => { setAviso(null); setAgendando(true); }}>
            + Agendar follow-up
          </button>
        )
      }
    >
      <div className="space-y-4">
        {erro && <Alert tone="red">{erro}</Alert>}
        {aviso && <Alert tone="amber">{aviso}</Alert>}

        <KpiGrid>
          <Kpi destaque label="Follow-ups feitos" value={resumo.feitos} />
          <Kpi
            label="Último contato"
            value={
              resumo.ultimo ? (
                <>
                  {dataCurta((resumo.ultimo.concluidaEm || resumo.ultimo.data).slice(0, 10))}
                  <span className="block text-xs font-normal text-slate-600 dark:text-slate-400">por {quemFez(resumo.ultimo)}</span>
                </>
              ) : "—"
            }
          />
          <Kpi
            label="Próximo"
            tone={resumo.proximo && resumo.proximo.data < hoje ? "red" : undefined}
            value={resumo.proximo ? dataCurta(resumo.proximo.data) : "—"}
          />
          <Kpi label="Com quem" value={resumo.proximo?.responsavelNome || "—"} />
        </KpiGrid>

        {agendando && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <AgendarCompromisso
              clientes={[]}
              clienteFixo={cliente}
              negociacoes={negociacoes}
              usuarios={usuarios}
              usuarioAtual={usuarioAtual}
              onAgendado={() => { setAgendando(false); onMudou(); }}
              onCancelar={() => setAgendando(false)}
            />
          </div>
        )}

        <div>
          <h3 className="field-label">Agendados ({resumo.pendentes.length})</h3>
          {resumo.pendentes.length === 0 ? (
            <p className="subtitle">Nenhum contato marcado. Agende o próximo para este cliente não esfriar.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {resumo.pendentes.map((t) => {
                const neg = negociacaoDeReferencia(t, cliente, negociacoes);
                return (
                  <li key={t.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="min-w-0 flex-1 basis-48">
                        {/* No celular o assunto quebra linha: cortado em "Apresent…" ele não diz o que fazer. */}
                        <span className="block break-words text-sm font-medium text-gta-navy sm:truncate dark:text-slate-100">
                          <span className="mr-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
                          {t.assunto}
                        </span>
                        <span className="hint flex flex-wrap items-center gap-x-2">
                          {t.responsavelNome && <span>{t.responsavelNome}</span>}
                          {t.repetirCada > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Repeat className="h-3 w-3" aria-hidden />
                              {descreverRepeticao(t.repetirCada, t.repetirUnidade)}
                            </span>
                          )}
                          {t.negociacaoId && (
                            <Link href={`/crm/negociacoes/${t.negociacaoId}`} className="hover:underline">{t.negociacaoNome}</Link>
                          )}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs ${t.data < hoje ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
                        {t.data < hoje ? "Atrasado · " : ""}{dataCurta(t.data)}{t.hora ? ` ${t.hora}` : ""}
                      </span>
                      {concluindo !== t.id && (
                        <button className="btn-secondary !py-1 text-xs" onClick={() => { setAviso(null); setConcluindo(t.id); }}>
                          Concluir
                        </button>
                      )}
                    </div>
                    {t.notas && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">{t.notas}</p>}
                    {concluindo === t.id && (
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
                          onMudou();
                        }}
                        onCancelar={() => setConcluindo(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="field-label">Feitos ({resumo.feitos})</h3>
          {resumo.feitos === 0 ? (
            <EmptyState className="!p-4">Nenhum contato registrado ainda.</EmptyState>
          ) : (
            <>
              <ol className="space-y-2">
                {feitos.map((t) => (
                  <li key={t.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 text-sm font-semibold text-gta-navy dark:text-slate-100">
                        <span className="mr-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
                        {t.assunto}
                      </span>
                      <span className="hint flex items-center gap-2">
                        {t.concluidaEm ? dataHora(t.concluidaEm) : dataCurta(t.data)} · {quemFez(t)}
                        <button className="btn-link text-xs" onClick={() => void reabrir(t)}>Reabrir</button>
                      </span>
                    </div>
                    {t.comentario ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{t.comentario}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sem comentário.</p>
                    )}
                  </li>
                ))}
              </ol>
              {resumo.feitos > FEITOS_VISIVEIS && (
                <button className="btn-link mt-2 text-sm" onClick={() => setVerTodos((v) => !v)}>
                  {verTodos ? "Mostrar só os últimos" : `Ver todos os ${resumo.feitos}`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
