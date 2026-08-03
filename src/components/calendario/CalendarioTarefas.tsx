"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Alert, EmptyState, Loading, Segmented } from "@/components/ui";
import { diaDaSemana, paraData, somarDias, ymd, type Ymd } from "@/lib/capacidade/datas";
import { prioridadeLabel, statusLabel, type Prioridade, type Task } from "@/lib/tasks/types";

/**
 * Calendário das tarefas por PRAZO, na estrutura de um calendário de agenda.
 *
 * Grade mensal, e não a grade semanal por hora dos Apontamentos: lançamento de
 * horas tem início e fim no dia, tarefa tem data de entrega. Numa régua de
 * horas as tarefas se amontoariam na mesma linha, e o mês — que é o horizonte
 * em que prazo se enxerga — não caberia na tela.
 *
 * Uma tarefa com prazo comercial E operacional aparece nos DOIS dias: são
 * compromissos distintos, e esconder um é esconder metade da promessa.
 */

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MES_NOME = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Quantos itens cabem numa célula antes de virar "+N". Fixo de propósito: com
 * a célula crescendo conforme o conteúdo, um dia cheio esticava a semana
 * inteira e a grade perdia o alinhamento que faz dela um calendário.
 */
const MAX_POR_DIA = 3;

const PONTO: Record<Prioridade, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baixa: "bg-slate-400 dark:bg-slate-500",
};

type TipoPrazo = "comercial" | "operacional";

interface Marcacao {
  tarefa: Task;
  tipo: TipoPrazo;
  hora: string;
}

/** Os 42 dias da grade: o mês inteiro mais as bordas que fecham as semanas. */
function gradeDoMes(ancora: Ymd): Ymd[] {
  const d = paraData(ancora);
  const primeiro = ymd(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
}

function fmtDia(dia: Ymd): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

export function CalendarioTarefas({ currentUserEmail }: { currentUserEmail: string }) {
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ancora, setAncora] = useState<Ymd>(() => ymd(new Date()));
  const [escopo, setEscopo] = useState<"minhas" | "equipe">("minhas");
  const [diaAberto, setDiaAberto] = useState<Ymd | null>(null);

  const hoje = ymd(new Date());

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/tarefas");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar as tarefas.");
        setTarefas(d.tasks ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const porDia = useMemo(() => {
    const mapa = new Map<Ymd, Marcacao[]>();
    const empurrar = (dia: string, m: Marcacao) => {
      if (!dia) return;
      const atual = mapa.get(dia);
      if (atual) atual.push(m);
      else mapa.set(dia, [m]);
    };

    for (const t of tarefas) {
      if (t.status === "concluida") continue;
      if (escopo === "minhas" && t.responsavel !== currentUserEmail) continue;
      empurrar(t.prazoComercial, { tarefa: t, tipo: "comercial", hora: t.horaComercial });
      empurrar(t.prazoOperacional || t.prazo, { tarefa: t, tipo: "operacional", hora: t.horaOperacional });
    }
    // Dentro do dia: hora marcada primeiro, depois prioridade, depois título.
    // A ordem em que o banco devolveu não significa nada para quem lê a agenda.
    const peso: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) =>
          (a.hora || "99:99").localeCompare(b.hora || "99:99") ||
          peso[a.tarefa.prioridade] - peso[b.tarefa.prioridade] ||
          a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR"),
      );
    }
    return mapa;
  }, [tarefas, escopo, currentUserEmail]);

  const dias = useMemo(() => gradeDoMes(ancora), [ancora]);
  const mesAtual = paraData(ancora).getMonth();
  const noMes = (d: Ymd) => paraData(d).getMonth() === mesAtual;

  const totalNoMes = dias.filter(noMes).reduce((s, d) => s + (porDia.get(d)?.length ?? 0), 0);
  const vencidos = [...porDia.entries()].filter(([d]) => d < hoje).reduce((s, [, l]) => s + l.length, 0);

  function mudarMes(delta: number) {
    const d = paraData(ancora);
    setAncora(ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12)));
    setDiaAberto(null);
  }

  if (carregando) return <Loading />;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="icon-btn" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <h2 className="ml-2 text-lg font-semibold text-gta-navy dark:text-slate-100">
            {MES_NOME[mesAtual]} <span className="font-normal text-slate-600 dark:text-slate-400">{paraData(ancora).getFullYear()}</span>
          </h2>
          <button
            type="button"
            className="btn-secondary ml-2 !py-1 text-xs"
            onClick={() => {
              setAncora(ymd(new Date()));
              setDiaAberto(null);
            }}
          >
            Hoje
          </button>
        </div>

        <Segmented
          value={escopo}
          onChange={(v) => {
            setEscopo(v);
            setDiaAberto(null);
          }}
          aria="Escopo do calendário"
          options={[
            { value: "minhas", label: "Minhas" },
            { value: "equipe", label: "Equipe" },
          ]}
        />
      </div>

      <p className="hint">
        {totalNoMes === 0
          ? "Nenhum prazo neste mês."
          : `${totalNoMes} ${totalNoMes === 1 ? "prazo" : "prazos"} neste mês.`}
        {vencidos > 0 && (
          <span className="font-medium text-red-600 dark:text-red-400">
            {" "}
            {vencidos} {vencidos === 1 ? "vencido" : "vencidos"} ao todo, somando os meses anteriores.
          </span>
        )}
      </p>

      {tarefas.length === 0 ? (
        <EmptyState>Nenhuma tarefa cadastrada.</EmptyState>
      ) : (
        <>
          <div className="card overflow-hidden">
            {/* Cabeçalho dos dias da semana, fixo acima da grade. */}
            <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
              {DIA_CURTO.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  <span className="hidden sm:inline">{d}</span>
                  <span className="sm:hidden">{d.charAt(0)}</span>
                </div>
              ))}
            </div>

            {/* Seis semanas de altura fixa: a grade só se lê como calendário se
                as linhas não mudarem de tamanho conforme o conteúdo. */}
            <div className="grid grid-cols-7">
              {dias.map((dia, i) => {
                const marcacoes = porDia.get(dia) ?? [];
                const ehHoje = dia === hoje;
                const doMes = noMes(dia);
                const fds = [0, 6].includes(diaDaSemana(dia));
                const visiveis = marcacoes.slice(0, MAX_POR_DIA);
                const excedente = marcacoes.length - visiveis.length;

                return (
                  <div
                    key={dia}
                    /* 7,5rem cabe o número do dia mais as quatro linhas do
                       conteúdo máximo (3 prazos + "mais N"), então nenhuma
                       célula empurra a altura da semana. */
                    className={`min-h-[7.5rem] border-b border-r border-slate-200 p-1 last:border-r-0 dark:border-slate-700 ${
                      i % 7 === 6 ? "border-r-0" : ""
                    } ${doMes ? (fds ? "bg-slate-50/60 dark:bg-slate-900/30" : "") : "bg-slate-50 dark:bg-slate-900/50"}`}
                  >
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => setDiaAberto(dia)}
                        aria-label={`Prazos de ${fmtDia(dia)}`}
                        /* O dia de outro mês se distingue pelo FUNDO da célula,
                           não por texto apagado: em slate-600 sobre o fundo
                           escuro dava 2,15:1 e o número ficava ilegível. */
                        /* `max-md:` amplia só no celular: 24px é confortável
                           com mouse, mas fica abaixo do alvo no dedo. A grade
                           já rola lateralmente, então há largura de sobra. */
                        className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs tabular-nums transition hover:bg-slate-200 max-md:h-11 max-md:min-w-[2.75rem] dark:hover:bg-slate-700 ${
                          ehHoje
                            ? "bg-gta-indigo font-semibold text-white hover:bg-gta-indigo"
                            : doMes
                              ? "text-slate-700 dark:text-slate-300"
                              : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {Number(dia.slice(8))}
                      </button>
                    </div>

                    <ul className="mt-0.5 space-y-px">
                      {visiveis.map((m) => (
                        <li key={`${m.tarefa.id}-${m.tipo}`}>
                          <Link
                            href={`/tarefas/${m.tarefa.id}`}
                            title={`${m.tarefa.titulo}\nPrazo ${m.tipo}${m.hora ? ` às ${m.hora}` : ""}\nPrioridade ${prioridadeLabel(m.tarefa.prioridade)} · ${statusLabel(m.tarefa.status)}${m.tarefa.cliente ? `\n${m.tarefa.cliente}` : ""}`}
                            className={`flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight transition hover:bg-slate-100 dark:hover:bg-slate-700 ${
                              dia < hoje ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PONTO[m.tarefa.prioridade]}`} aria-hidden />
                            {m.hora && <span className="shrink-0 tabular-nums opacity-70">{m.hora}</span>}
                            <span className="truncate">{m.tarefa.titulo}</span>
                          </Link>
                        </li>
                      ))}
                      {excedente > 0 && (
                        <li>
                          <button
                            type="button"
                            onClick={() => setDiaAberto(dia)}
                            className="w-full rounded px-1 py-0.5 text-left text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                          >
                            mais {excedente}
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {diaAberto && <PainelDoDia dia={diaAberto} marcacoes={porDia.get(diaAberto) ?? []} hoje={hoje} onFechar={() => setDiaAberto(null)} />}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 hint">
            <Legenda cor={PONTO.alta} texto="Alta" />
            <Legenda cor={PONTO.media} texto="Média" />
            <Legenda cor={PONTO.baixa} texto="Baixa" />
            <span className="text-red-700 dark:text-red-400">Vermelho = vencido</span>
          </div>
        </>
      )}
    </div>
  );
}

function Legenda({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cor}`} aria-hidden />
      {texto}
    </span>
  );
}

/**
 * Detalhe de um dia, aberto ao clicar no número ou em "mais N".
 *
 * Painel abaixo da grade, e não janela flutuante ancorada na célula: a flutuante
 * exigiria cálculo de posição e sairia da tela nas colunas da borda e no
 * celular — onde a grade já rola lateralmente.
 */
function PainelDoDia({
  dia,
  marcacoes,
  hoje,
  onFechar,
}: {
  dia: Ymd;
  marcacoes: Marcacao[];
  hoje: Ymd;
  onFechar: () => void;
}) {
  const vencido = dia < hoje;
  return (
    <section className="section-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="section-title">
            {fmtDia(dia)}
            {dia === hoje && <span className="ml-2 text-sm font-normal text-gta-indigo dark:text-indigo-300">hoje</span>}
          </h3>
          <p className="hint mt-0.5">
            {marcacoes.length === 0
              ? "Nenhum prazo neste dia."
              : `${marcacoes.length} ${marcacoes.length === 1 ? "prazo" : "prazos"}${vencido ? " — já vencido" : ""}.`}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar o dia">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {marcacoes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {marcacoes.map((m) => (
            <li key={`${m.tarefa.id}-${m.tipo}`}>
              <Link
                href={`/tarefas/${m.tarefa.id}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[m.tarefa.prioridade]}`} aria-hidden />
                {m.hora && <span className="tabular-nums hint">{m.hora}</span>}
                <span className={`font-medium ${vencido ? "text-red-700 dark:text-red-400" : "text-gta-navy dark:text-slate-100"}`}>
                  {m.tarefa.titulo}
                </span>
                <span className="hint">
                  Prazo {m.tipo} · {prioridadeLabel(m.tarefa.prioridade)} · {statusLabel(m.tarefa.status)}
                  {m.tarefa.cliente && ` · ${m.tarefa.cliente}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
