"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, EmptyState, Loading, Segmented } from "@/components/ui";
import { MarcaPrioridade } from "@/components/tasks/marcadores";
import { diaDaSemana, paraData, somarDias, ymd, type Ymd } from "@/lib/capacidade/datas";
import { prioridadeLabel, statusLabel, type Task } from "@/lib/tasks/types";

/**
 * Calendário das tarefas por PRAZO.
 *
 * Grade mensal, e não a grade semanal por hora dos Apontamentos: lançamento de
 * horas tem início e fim no dia, tarefa tem data de entrega. Numa régua de
 * horas as tarefas se amontoariam todas na mesma linha, e o mês — que é o
 * horizonte em que prazo se enxerga — não caberia na tela.
 *
 * Uma tarefa com prazo comercial E operacional aparece nos DOIS dias: são
 * compromissos distintos, e esconder um deles é esconder metade da promessa.
 */

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MES_NOME = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type TipoPrazo = "comercial" | "operacional";

interface Marcacao {
  tarefa: Task;
  tipo: TipoPrazo;
  hora: string;
}

/** Os 42 dias da grade: o mês inteiro mais as bordas para fechar as semanas. */
function gradeDoMes(ancora: Ymd): Ymd[] {
  const d = paraData(ancora);
  const primeiro = ymd(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  return Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
}

export function CalendarioTarefas({ currentUserEmail }: { currentUserEmail: string }) {
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ancora, setAncora] = useState<Ymd>(() => ymd(new Date()));
  const [escopo, setEscopo] = useState<"minhas" | "equipe">("minhas");

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

  /** Data → marcações do dia, já filtradas pelo escopo. */
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
    // Dentro do dia: prioridade primeiro, depois título — a ordem do banco não
    // significa nada para quem está lendo a agenda.
    const peso = { alta: 0, media: 1, baixa: 2 } as const;
    for (const lista of mapa.values()) {
      lista.sort((a, b) => peso[a.tarefa.prioridade] - peso[b.tarefa.prioridade] || a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR"));
    }
    return mapa;
  }, [tarefas, escopo, currentUserEmail]);

  const dias = useMemo(() => gradeDoMes(ancora), [ancora]);
  const mesAtual = paraData(ancora).getMonth();
  const noMes = (d: Ymd) => paraData(d).getMonth() === mesAtual;

  const totalNoMes = dias.filter(noMes).reduce((s, d) => s + (porDia.get(d)?.length ?? 0), 0);
  const atrasadas = [...porDia.entries()].filter(([d]) => d < hoje).reduce((s, [, l]) => s + l.length, 0);

  function mudarMes(delta: number) {
    const d = paraData(ancora);
    setAncora(ymd(new Date(d.getFullYear(), d.getMonth() + delta, 1, 12)));
  }

  if (carregando) return <Loading />;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => mudarMes(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-medium text-gta-navy dark:text-slate-100">
            {MES_NOME[mesAtual]} de {paraData(ancora).getFullYear()}
          </span>
          <button type="button" className="icon-btn" onClick={() => mudarMes(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="btn-link text-xs" onClick={() => setAncora(ymd(new Date()))}>
            Este mês
          </button>
        </div>

        <Segmented
          value={escopo}
          onChange={setEscopo}
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
        {atrasadas > 0 && (
          <span className="font-medium text-red-600 dark:text-red-400">
            {" "}
            {atrasadas} {atrasadas === 1 ? "vencido" : "vencidos"} ao todo, somando os meses anteriores.
          </span>
        )}
      </p>

      {tarefas.length === 0 ? (
        <EmptyState>Nenhuma tarefa cadastrada.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-2 sm:p-3">
          {/* min-w para a grade rolar lateralmente no celular em vez de espremer
              sete colunas em 375px, o que tornaria o título ilegível. */}
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-1">
              {DIA_CURTO.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {d}
                </div>
              ))}

              {dias.map((dia) => {
                const marcacoes = porDia.get(dia) ?? [];
                const ehHoje = dia === hoje;
                const doMes = noMes(dia);
                return (
                  <div
                    key={dia}
                    className={`min-h-[6.5rem] rounded-md border p-1 ${
                      ehHoje
                        ? "border-gta-indigo bg-indigo-50/60 dark:border-indigo-500/60 dark:bg-indigo-900/20"
                        : "border-slate-200 dark:border-slate-700"
                    } ${doMes ? "" : "opacity-45"}`}
                  >
                    <div className={`px-0.5 text-right text-[11px] tabular-nums ${ehHoje ? "font-bold text-gta-indigo dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"}`}>
                      {Number(dia.slice(8))}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {marcacoes.map((m) => {
                        const vencido = dia < hoje;
                        return (
                          <li key={`${m.tarefa.id}-${m.tipo}`}>
                            <Link
                              href={`/tarefas/${m.tarefa.id}`}
                              title={`${m.tarefa.titulo}\nPrazo ${m.tipo}${m.hora ? ` às ${m.hora}` : ""}\nPrioridade ${prioridadeLabel(m.tarefa.prioridade)} · ${statusLabel(m.tarefa.status)}${m.tarefa.cliente ? `\n${m.tarefa.cliente}` : ""}`}
                              className={`block rounded px-1 py-0.5 text-[11px] leading-tight transition hover:bg-slate-100 dark:hover:bg-slate-700 ${
                                vencido ? "text-red-700 dark:text-red-400" : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    m.tarefa.prioridade === "alta"
                                      ? "bg-red-500"
                                      : m.tarefa.prioridade === "media"
                                        ? "bg-amber-500"
                                        : "bg-slate-400 dark:bg-slate-500"
                                  }`}
                                  aria-hidden
                                />
                                {/* A letra distingue os dois prazos sem gastar
                                    a largura da célula com a palavra inteira. */}
                                <span className="shrink-0 text-[9px] font-semibold uppercase opacity-70">
                                  {m.tipo === "comercial" ? "C" : "O"}
                                </span>
                                <span className="truncate">{m.tarefa.titulo}</span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 hint">
            <span className="inline-flex items-center gap-1.5">
              <MarcaPrioridade valor="alta" className="text-[11px]" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MarcaPrioridade valor="media" className="text-[11px]" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MarcaPrioridade valor="baixa" className="text-[11px]" />
            </span>
            <span>C = prazo comercial · O = prazo operacional</span>
            <span className="text-red-700 dark:text-red-400">Vermelho = vencido</span>
          </div>
        </div>
      )}
    </div>
  );
}
