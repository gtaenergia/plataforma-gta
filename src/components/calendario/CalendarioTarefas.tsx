"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Alert, EmptyState, Loading, Segmented } from "@/components/ui";
import { diaDaSemana, paraData, somarDias, ymd, type Ymd } from "@/lib/capacidade/datas";
import { excedentePorDia, segmentarSemana, type Intervalo, type Segmento } from "@/lib/calendario/faixas";
import { prioridadeLabel, statusLabel, type Prioridade, type Task } from "@/lib/tasks/types";

/**
 * Calendário das tarefas na estrutura de uma agenda: cada tarefa é uma BARRA
 * que vai da criação até o prazo, atravessando os dias.
 *
 * Antes era um ponto no dia do prazo. O ponto responde "o que vence hoje", mas
 * não "o que está em curso" — e é isso que se enxerga num mês. A barra mostra a
 * tarefa ocupando o tempo dela, e a sobreposição das barras mostra o acúmulo.
 *
 * Uma tarefa com prazo comercial E operacional vira DUAS barras: são
 * compromissos distintos, e esconder um é esconder metade da promessa.
 */

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MES_NOME = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * Quantas barras cabem numa semana antes de virar "+N". Fixo de propósito: com
 * a linha crescendo conforme o conteúdo, uma semana cheia esticaria a grade e
 * ela perderia o alinhamento que faz dela um calendário.
 *
 * Quatro, e não três como na versão de pontos: a barra ocupa a faixa na semana
 * INTEIRA que ela atravessa, então uma tarefa longa consome uma faixa de todos
 * os dias. Com três, uma semana com trabalho em curso virava quase só "+N".
 */
const MAX_FAIXAS = 4;

const PONTO: Record<Prioridade, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baixa: "bg-slate-400 dark:bg-slate-500",
};

type TipoPrazo = "comercial" | "operacional";

/** Uma tarefa ocupando um intervalo de dias: da criação até o prazo. */
interface Barra extends Intervalo {
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

/** Data LOCAL da criação — `criadoEm` é um instante ISO em UTC. */
function diaDeCriacao(iso: string): Ymd | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ymd(d);
}

/** Desempate estável entre barras que começam e terminam no mesmo dia. */
const porTitulo = (a: Barra, b: Barra) => a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR");

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

  const barras = useMemo(() => {
    const lista: Barra[] = [];
    for (const t of tarefas) {
      if (t.status === "concluida") continue;
      if (escopo === "minhas" && t.responsavel !== currentUserEmail) continue;
      const criacao = diaDeCriacao(t.criadoEm);
      const adicionar = (prazo: string, tipo: TipoPrazo, hora: string) => {
        if (!prazo) return;
        // Prazo ANTERIOR à criação acontece bastante (tarefa cadastrada depois
        // do combinado, ou importada). Não há período de trabalho a mostrar:
        // vira a marca de um dia só, no prazo. Inverter a barra seria inventar
        // um intervalo que nunca existiu.
        const inicio = criacao && criacao < prazo ? criacao : prazo;
        lista.push({ tarefa: t, tipo, hora, inicio, fim: prazo });
      };
      adicionar(t.prazoComercial, "comercial", t.horaComercial);
      adicionar(t.prazoOperacional || t.prazo, "operacional", t.horaOperacional);
    }
    return lista;
  }, [tarefas, escopo, currentUserEmail]);

  const dias = useMemo(() => gradeDoMes(ancora), [ancora]);
  const semanas = useMemo(
    () => Array.from({ length: 6 }, (_, i) => dias.slice(i * 7, i * 7 + 7)),
    [dias],
  );
  const mesAtual = paraData(ancora).getMonth();
  const noMes = (d: Ymd) => paraData(d).getMonth() === mesAtual;

  /** As barras que cobrem um dia — usado pelo painel de detalhe. */
  const doDia = (dia: Ymd) => barras.filter((b) => b.inicio <= dia && dia <= b.fim);

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

            {semanas.map((semana) => (
              <Semana
                key={semana[0]}
                semana={semana}
                barras={barras}
                hoje={hoje}
                noMes={noMes}
                onAbrirDia={setDiaAberto}
              />
            ))}
          </div>

          {diaAberto && (
            <PainelDoDia dia={diaAberto} barras={doDia(diaAberto)} hoje={hoje} onFechar={() => setDiaAberto(null)} />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 hint">
            <Legenda cor={PONTO.alta} texto="Alta" />
            <Legenda cor={PONTO.media} texto="Média" />
            <Legenda cor={PONTO.baixa} texto="Baixa" />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Uma linha da grade. O fundo dos dias é uma camada à parte, por baixo: as
 * barras precisam atravessar as colunas, e não caberiam dentro de células
 * independentes.
 */
function Semana({
  semana,
  barras,
  hoje,
  noMes,
  onAbrirDia,
}: {
  semana: Ymd[];
  barras: Barra[];
  hoje: Ymd;
  noMes: (d: Ymd) => boolean;
  onAbrirDia: (d: Ymd) => void;
}) {
  const segmentos = useMemo(() => segmentarSemana(barras, semana, porTitulo), [barras, semana]);
  const visiveis = segmentos.filter((s) => s.faixa < MAX_FAIXAS);
  // O "+N" é por DIA, como a pessoa lê o calendário, e não por semana.
  const excedente = excedentePorDia(segmentos, MAX_FAIXAS);

  return (
    <div className="relative border-b border-slate-200 last:border-b-0 dark:border-slate-700">
      {/* Camada de fundo: fim de semana e dias de outro mês. */}
      <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
        {semana.map((dia, i) => (
          <div
            key={dia}
            className={`border-r border-slate-200 dark:border-slate-700 ${i === 6 ? "border-r-0" : ""} ${
              noMes(dia)
                ? [0, 6].includes(diaDaSemana(dia))
                  ? "bg-slate-50/60 dark:bg-slate-900/30"
                  : ""
                : "bg-slate-50 dark:bg-slate-900/50"
            }`}
          />
        ))}
      </div>

      {/* 8,75rem = número do dia + as 4 faixas + a linha do "+N", para que
          nenhuma semana empurre a altura das outras. */}
      <div className="relative min-h-[8.75rem] pb-1">
        {/* Números dos dias */}
        <div className="grid grid-cols-7">
          {semana.map((dia) => (
            <div key={dia} className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => onAbrirDia(dia)}
                aria-label={`Tarefas de ${fmtDia(dia)}`}
                /* O dia de outro mês se distingue pelo FUNDO da célula, não por
                   texto apagado: em slate-600 sobre o fundo escuro dava 2,15:1
                   e o número ficava ilegível. */
                /* `max-md:` amplia só no celular: 24px é confortável com mouse,
                   mas fica abaixo do alvo no dedo. */
                className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-xs tabular-nums transition hover:bg-slate-200 max-md:h-11 max-md:min-w-[2.75rem] dark:hover:bg-slate-700 ${
                  dia === hoje
                    ? "bg-gta-indigo font-semibold text-white hover:bg-gta-indigo"
                    : noMes(dia)
                      ? "text-slate-700 dark:text-slate-300"
                      : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {Number(dia.slice(8))}
              </button>
            </div>
          ))}
        </div>

        {/* No celular a barra tem 18px de altura — abaixo do alvo de toque, e
            engordá-la multiplicaria a altura da grade por quatro. Então ali ela
            é só desenho, e quem recebe o toque é o dia inteiro (a camada
            abaixo). No desktop, com mouse, a barra continua clicável. */}
        <div className="mt-1 grid grid-cols-7 gap-y-px max-md:pointer-events-none" style={{ gridAutoRows: "1.125rem" }}>
          {visiveis.map((s) => (
            <BarraTarefa key={`${s.item.tarefa.id}-${s.item.tipo}-${s.col}`} seg={s} hoje={hoje} />
          ))}
          {excedente.map((n, i) =>
            n > 0 ? (
              <button
                key={`mais-${i}`}
                type="button"
                onClick={() => onAbrirDia(semana[i])}
                style={{ gridColumn: `${i + 1} / span 1`, gridRow: MAX_FAIXAS + 1 }}
                className="mx-px rounded px-1 text-left text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                mais {n}
              </button>
            ) : null,
          )}
        </div>
      </div>

      {/* Superfície de toque do celular: uma área por dia, cobrindo a célula
          inteira. Repete a ação do número do dia, então fica fora da árvore de
          acessibilidade — quem navega por teclado ou leitor de tela usa o
          botão do número, que já tem 44px ali. */}
      <div className="absolute inset-0 grid grid-cols-7 md:hidden">
        {semana.map((dia) => (
          <button key={dia} type="button" aria-hidden tabIndex={-1} onClick={() => onAbrirDia(dia)} />
        ))}
      </div>
    </div>
  );
}

/**
 * O pedaço visível de uma tarefa numa semana.
 *
 * O canto só é arredondado onde a barra realmente começa ou termina: reto de um
 * lado significa "continua", que é como se lê a passagem de uma semana para a
 * outra sem precisar de legenda.
 */
function BarraTarefa({ seg, hoje }: { seg: Segmento<Barra>; hoje: Ymd }) {
  const { tarefa, tipo, hora, inicio, fim } = seg.item;
  const vencida = fim < hoje;
  return (
    <Link
      href={`/tarefas/${tarefa.id}`}
      style={{ gridColumn: `${seg.col + 1} / span ${seg.span}`, gridRow: seg.faixa + 1 }}
      title={`${tarefa.titulo}\nDe ${fmtDia(inicio)} até ${fmtDia(fim)} (prazo ${tipo}${hora ? ` às ${hora}` : ""})\n${prioridadeLabel(tarefa.prioridade)} · ${statusLabel(tarefa.status)}${tarefa.cliente ? `\n${tarefa.cliente}` : ""}`}
      className={`mx-px flex items-center gap-1 overflow-hidden px-1 text-[11px] leading-tight transition ${
        seg.abre ? "rounded-l" : ""
      } ${seg.fecha ? "rounded-r" : ""} ${
        vencida
          ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-200 dark:hover:bg-red-900/60"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-slate-600"
      }`}
    >
      {seg.abre && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PONTO[tarefa.prioridade]}`} aria-hidden />}
      {seg.abre && hora && <span className="shrink-0 tabular-nums opacity-70">{hora}</span>}
      <span className="truncate">{tarefa.titulo}</span>
    </Link>
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
  barras,
  hoje,
  onFechar,
}: {
  dia: Ymd;
  barras: Barra[];
  hoje: Ymd;
  onFechar: () => void;
}) {
  // Quem VENCE neste dia vem primeiro: é a informação que faz alguém abrir o dia.
  const ordenadas = [...barras].sort(
    (a, b) =>
      Number(b.fim === dia) - Number(a.fim === dia) ||
      (a.hora || "99:99").localeCompare(b.hora || "99:99") ||
      a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR"),
  );
  const vencendo = barras.filter((b) => b.fim === dia).length;

  return (
    <section className="section-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="section-title">
            {fmtDia(dia)}
            {dia === hoje && <span className="ml-2 text-sm font-normal text-gta-indigo dark:text-indigo-300">hoje</span>}
          </h3>
          <p className="hint mt-0.5">
            {barras.length === 0
              ? "Nenhuma tarefa em curso neste dia."
              : `${barras.length} ${barras.length === 1 ? "tarefa em curso" : "tarefas em curso"}` +
                (vencendo > 0 ? `, ${vencendo} com prazo neste dia.` : ".")}
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar o dia">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {ordenadas.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {ordenadas.map((b) => {
            const venceHoje = b.fim === dia;
            const vencida = b.fim < hoje;
            return (
              <li key={`${b.tarefa.id}-${b.tipo}`}>
                <Link
                  href={`/tarefas/${b.tarefa.id}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[b.tarefa.prioridade]}`} aria-hidden />
                  {b.hora && venceHoje && <span className="tabular-nums hint">{b.hora}</span>}
                  <span
                    className={`font-medium ${vencida && venceHoje ? "text-red-700 dark:text-red-400" : "text-gta-navy dark:text-slate-100"}`}
                  >
                    {b.tarefa.titulo}
                  </span>
                  <span className="hint">
                    {venceHoje ? `Prazo ${b.tipo} neste dia` : `Prazo ${b.tipo} em ${fmtDia(b.fim)}`} ·{" "}
                    {prioridadeLabel(b.tarefa.prioridade)} · {statusLabel(b.tarefa.status)}
                    {b.tarefa.cliente && ` · ${b.tarefa.cliente}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
