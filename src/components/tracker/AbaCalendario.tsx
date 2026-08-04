"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, EmptyState, Loading } from "@/components/ui";
import { posicionarDia } from "@/lib/calendario/blocos-dia";
import { coresDaEquipe, corDePessoa } from "@/lib/cor-de-pessoa";
import { duracaoMin, formatarDuracao } from "@/lib/tracker/types";

import { addDias, DIA_SEMANA_CURTO, fmtCurta, segundaDaSemana, useEntradas, type Usuario } from "./comum";

/** Altura de uma hora na grade, em px. */
const PX_POR_HORA = 44;

/**
 * Piso de altura do bloco: abaixo disso um lançamento curto deixa de ser
 * legível e de ter alvo de clique. Vai junto para `posicionarDia`, que precisa
 * dele para decidir a sobreposição no mesmo espaço em que o bloco é desenhado.
 */
const ALTURA_MIN_PX = 18;

/**
 * Grade semanal: 7 colunas (dias) × horas, com cada lançamento posicionado
 * pelo horário real. A faixa de horas exibida se adapta aos lançamentos da
 * semana (nunca menor que 8h–18h) para não mostrar madrugada vazia à toa.
 */
export function AbaCalendario({ usuarioSelecionado, usuarios, nomeDe, mostrarUsuario }: {
  usuarioSelecionado: string;
  usuarios: Usuario[];
  nomeDe: (email: string) => string;
  mostrarUsuario: boolean;
}) {
  const [semanaBase, setSemanaBase] = useState(() => segundaDaSemana(new Date()));
  const semanaFim = useMemo(() => addDias(semanaBase, 7), [semanaBase]);
  const { entradas, carregando, erro } = useEntradas(semanaBase, semanaFim, usuarioSelecionado);
  const agora = new Date();

  /**
   * Cor de cada pessoa. Vem da equipe INTEIRA, não de quem lançou horas nesta
   * semana — senão a cor de cada um mudaria conforme os colegas trabalhassem
   * ou não, e ninguém conseguiria associar cor a pessoa.
   */
  const cores = useMemo(() => coresDaEquipe(usuarios.map((u) => u.email)), [usuarios]);

  /** Quem aparece nesta semana — a legenda lista só isso, não a equipe toda. */
  const naSemana = useMemo(() => {
    const vistos = [...new Set(entradas.map((e) => e.usuarioEmail))];
    return vistos.sort((a, b) => nomeDe(a).localeCompare(nomeDe(b)));
  }, [entradas, nomeDe]);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDias(semanaBase, i)), [semanaBase]);

  /** Faixa de horas a exibir, ajustada aos lançamentos (mín. 8h–18h). */
  const { horaIni, horaFim } = useMemo(() => {
    let min = 8;
    let max = 18;
    for (const e of entradas) {
      const ini = new Date(e.inicio);
      const fim = e.fim ? new Date(e.fim) : agora;
      min = Math.min(min, ini.getHours());
      max = Math.max(max, fim.getHours() + (fim.getMinutes() > 0 ? 1 : 0));
    }
    return { horaIni: Math.max(0, min), horaFim: Math.min(24, Math.max(max, min + 1)) };
  }, [entradas]);

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaIni }, (_, i) => horaIni + i),
    [horaIni, horaFim],
  );

  const grade = useMemo(
    () => ({ pxPorHora: PX_POR_HORA, alturaMinPx: ALTURA_MIN_PX, horaIni }),
    [horaIni],
  );

  /**
   * Lançamentos de um dia, com posição, altura e largura já calculadas.
   *
   * A distribuição em faixas mora em `lib/calendario/blocos-dia.ts`, que trata
   * o caso em que o piso de altura faz um lançamento curto ocupar mais tela do
   * que ele durou no relógio.
   */
  function blocosDoDia(dia: Date) {
    const itens = entradas
      .filter((e) => new Date(e.inicio).toDateString() === dia.toDateString())
      .map((e) => {
        const ini = new Date(e.inicio);
        const fim = e.fim ? new Date(e.fim) : agora;
        const inicioMin = ini.getHours() * 60 + ini.getMinutes();
        // A duração sai dos instantes, não do relógio de parede: é o que
        // mantém a altura certa em quem atravessa a meia-noite.
        const duracao = Math.max(1, (fim.getTime() - ini.getTime()) / 60000);
        return { entrada: e, inicioMin, fimMin: inicioMin + duracao };
      });

    return posicionarDia(itens, grade, (a, b) => a.entrada.id.localeCompare(b.entrada.id));
  }

  const totalSemana = entradas.reduce((s, e) => s + duracaoMin(e, agora), 0);

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn" onClick={() => setSemanaBase((d) => addDias(d, -7))} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-medium text-gta-navy dark:text-slate-100">
            {fmtCurta(semanaBase)} – {fmtCurta(addDias(semanaBase, 6))}
          </span>
          <button type="button" className="icon-btn" onClick={() => setSemanaBase((d) => addDias(d, 7))} aria-label="Próxima semana">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className="btn-link text-xs" onClick={() => setSemanaBase(segundaDaSemana(new Date()))}>
            Esta semana
          </button>
        </div>
        <span className="subtitle">
          Total da semana: <strong className="text-gta-navy dark:text-slate-100">{formatarDuracao(totalSemana)}</strong>
        </span>
      </div>

      {carregando ? (
        <Loading />
      ) : entradas.length === 0 ? (
        <EmptyState>Nenhum lançamento nesta semana.</EmptyState>
      ) : (
        <div className="card overflow-x-auto p-3">
          {/* min-w garante que a grade role lateralmente no celular em vez de espremer. */}
          <div className="min-w-[640px]">
            <div className="flex">
              {/* régua de horas */}
              <div className="w-12 shrink-0" aria-hidden>
                <div className="h-8" />
                {horas.map((h) => (
                  <div key={h} className="relative text-[10px] tabular-nums text-slate-500 dark:text-slate-400" style={{ height: PX_POR_HORA }}>
                    <span className="absolute -top-1.5 right-1">{String(h).padStart(2, "0")}h</span>
                  </div>
                ))}
              </div>

              {dias.map((dia, i) => {
                const ehHoje = dia.toDateString() === new Date().toDateString();
                const totalDia = entradas
                  .filter((e) => new Date(e.inicio).toDateString() === dia.toDateString())
                  .reduce((s, e) => s + duracaoMin(e, agora), 0);
                return (
                  <div key={i} className="min-w-0 flex-1 border-l border-slate-100 dark:border-slate-800">
                    <div className={`h-8 px-1 text-center ${ehHoje ? "text-gta-indigo dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"}`}>
                      <div className="text-[11px] font-semibold">{DIA_SEMANA_CURTO[dia.getDay()]} {fmtCurta(dia)}</div>
                      <div className="text-[10px] tabular-nums">{totalDia > 0 ? formatarDuracao(totalDia) : ""}</div>
                    </div>
                    <div className="relative" style={{ height: horas.length * PX_POR_HORA }}>
                      {/* linhas de hora */}
                      {horas.map((h) => (
                        <div key={h} className="border-t border-slate-100 dark:border-slate-800" style={{ height: PX_POR_HORA }} />
                      ))}
                      {blocosDoDia(dia).map(({ item: { entrada }, top, altura, faixa, faixas }) => (
                        <div
                          key={entrada.id}
                          className={`absolute overflow-hidden rounded border border-white/25 px-1 py-0.5 text-[10px] leading-tight text-white ${!entrada.fim ? "animate-pulse" : ""}`}
                          style={{
                            top,
                            height: altura,
                            // A borda clara acima não é enfeite: contra o cartão
                            // escuro a cor cheia fica em torno de 2,4:1, e é ela
                            // que dá o limite visível do bloco.
                            background: corDePessoa(entrada.usuarioEmail, cores),
                            // Cada faixa ocupa sua fatia da coluna; a borda clara
                            // separa blocos vizinhos que encostam.
                            left: `calc(${(faixa / faixas) * 100}% + 2px)`,
                            width: `calc(${100 / faixas}% - 4px)`,
                          }}
                          title={`${entrada.descricao || "(sem descrição)"}${mostrarUsuario ? ` — ${nomeDe(entrada.usuarioEmail)}` : ""}\n${formatarDuracao(duracaoMin(entrada, agora))}${entrada.cliente ? `\n${entrada.cliente}` : ""}`}
                        >
                          <div className="truncate font-medium">{entrada.descricao || "(sem descrição)"}</div>
                          {/* O nome vem antes do cliente: com várias pessoas na
                              tela, a cor sozinha não pode ser a única pista de
                              quem fez o quê (WCAG 1.4.1). */}
                          {mostrarUsuario && altura > 30 && (
                            <div className="truncate opacity-90">{nomeDe(entrada.usuarioEmail)}</div>
                          )}
                          {entrada.cliente && altura > (mostrarUsuario ? 44 : 30) && (
                            <div className="truncate opacity-80">{entrada.cliente}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 hint">
            {mostrarUsuario &&
              naSemana.map((email) => (
                <span key={email} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: corDePessoa(email, cores) }}
                    aria-hidden
                  />
                  {nomeDe(email)}
                </span>
              ))}
            <span>Pisca = cronômetro em andamento</span>
          </p>
        </div>
      )}
    </div>
  );
}
