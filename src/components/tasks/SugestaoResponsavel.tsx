"use client";

import { useMemo } from "react";
import { Alert, Badge } from "@/components/ui";
import {
  avisosDeCapacidade,
  estimativaDaTarefa,
  sugerirResponsaveis,
  type TarefaCapacidade,
} from "@/lib/capacidade/motor";
import type { Candidato, ConfigCapacidade } from "@/lib/capacidade/types";
import { fmtData, fmtHoras, hojeYmd, janelasDe, tomDaOcupacao } from "@/components/capacidade/comum";
import { DIAS_JANELA_CURTA } from "@/lib/capacidade/datas";

/**
 * Quem deveria pegar esta tarefa.
 *
 * A plataforma SUGERE — nunca atribui. O campo Responsável continua livre e
 * vazio; nada é preenchido até alguém clicar em "Usar esta sugestão". Quem cria
 * às vezes sabe de algo que a conta não sabe (o cliente pediu fulano, a pessoa
 * já está com o assunto na cabeça), e tirar essa decisão dela transformaria uma
 * ajuda em obstáculo.
 *
 * Aparece sozinha assim que houver categoria ou estimativa: um botão "sugerir"
 * seria mais um passo que, num formulário corrido, ninguém clica — e a conta é
 * instantânea, feita aqui mesmo sobre dados que a tela já carregou.
 */

const QUANTOS_MOSTRAR = 3;

export function SugestaoResponsavel({
  config,
  usuarios,
  tarefas,
  categoria,
  tipoDemanda,
  prioridade,
  estimativaMin,
  responsavelEscolhido,
  ignorarTarefaId,
  onEscolher,
}: {
  config: ConfigCapacidade;
  usuarios: { email: string; name: string }[];
  tarefas: TarefaCapacidade[];
  categoria: string;
  tipoDemanda: string;
  /** Define o que corre na frente desta tarefa na fila do responsável. */
  prioridade: string;
  estimativaMin: number;
  responsavelEscolhido: string;
  ignorarTarefaId?: string;
  /** Preenche responsável E prazo operacional — é o gesto que fecha o ciclo. */
  onEscolher: (email: string, prazoOperacional: string) => void;
}) {
  const hoje = hojeYmd();

  const { candidatos, origem, trabalhoMin } = useMemo(() => {
    const est = estimativaDaTarefa({ categoria, tipoDemanda, estimativaMin }, config);
    if (usuarios.length === 0 || est.minutos <= 0) {
      return { candidatos: [] as Candidato[], origem: est.origem, trabalhoMin: est.minutos };
    }
    return {
      candidatos: sugerirResponsaveis({
        hoje,
        config,
        pessoas: usuarios.map((u) => ({ email: u.email, nome: u.name })),
        tarefas,
        trabalhoMin: est.minutos,
        prioridade,
        ignorarTarefaId,
        ...janelasDe(hoje),
      }),
      origem: est.origem,
      trabalhoMin: est.minutos,
    };
  }, [config, usuarios, tarefas, categoria, tipoDemanda, prioridade, estimativaMin, ignorarTarefaId, hoje]);

  const disponiveis = candidatos.filter((c) => c.prazo.data);
  const escolhido = candidatos.find((c) => c.email === responsavelEscolhido) ?? null;
  // O aviso segue quem está SELECIONADO — se ninguém foi escolhido ainda, o da
  // sugestão principal. Avisar sobre o candidato ideal enquanto a pessoa marcou
  // outro seria informação sobre uma decisão que ela não tomou.
  const avisos = avisosDeCapacidade({
    candidato: escolhido ?? disponiveis[0] ?? null,
    origemEstimativa: origem,
    trabalhoMin,
  });

  if (trabalhoMin <= 0) {
    return (
      <p className="hint">
        Informe o tipo de demanda ou a estimativa de horas para visualizar os responsáveis com disponibilidade.
      </p>
    );
  }

  if (disponiveis.length === 0) {
    return (
      <Alert tone="amber" titulo="Nenhum responsável disponível.">
        Não há jornada de trabalho cadastrada para os usuários ativos. Configure em{" "}
        <strong>Planejamento e capacidade</strong>, no menu do perfil.
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Responsáveis com disponibilidade
        </span>
        <span className="hint">
          Estimativa de {fmtHoras(trabalhoMin)}
          {origem === "tipo" && " (duração média do tipo de demanda)"}
          {origem === "padrao" && " (duração padrão — tipo sem cadastro)"}
          {prioridade === "alta" && " · Prioridade alta: passa à frente das demais"}
          {prioridade === "baixa" && " · Prioridade baixa: entra atrás das demais"}
        </span>
      </div>

      <ul className="space-y-1.5">
        {disponiveis.slice(0, QUANTOS_MOSTRAR).map((c, i) => (
          <LinhaCandidato
            key={c.email}
            c={c}
            principal={i === 0}
            selecionado={c.email === responsavelEscolhido}
            onEscolher={() => onEscolher(c.email, c.prazo.data as string)}
          />
        ))}
      </ul>

      {avisos.map((a) => (
        <Alert key={a.titulo} tone="amber" titulo={`${a.titulo}.`}>
          {a.detalhe}
        </Alert>
      ))}
    </div>
  );
}

function LinhaCandidato({
  c,
  principal,
  selecionado,
  onEscolher,
}: {
  c: Candidato;
  principal: boolean;
  selecionado: boolean;
  onEscolher: () => void;
}) {
  const tom = tomDaOcupacao(c.semana.ocupacaoPct);
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm ${
        selecionado
          ? "border-gta-indigo bg-indigo-50/60 dark:border-indigo-500/50 dark:bg-indigo-900/20"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
      }`}
    >
      <span className="font-medium text-gta-navy dark:text-slate-100">{c.nome}</span>
      {principal && <Badge tone="indigo">Indicado</Badge>}
      {/* Não existe mais "jornada padrão" para o administrador ver ou editar —
          a jornada é de cada um. Quando a pessoa ainda não foi cadastrada em
          Planejamento, o que serve é dizer isso, não citar um padrão invisível. */}
      {c.capacidade.origem === "padrao" && <span className="hint">Jornada não cadastrada</span>}

      <span className="text-slate-700 dark:text-slate-300">
        Entrega em <strong>{fmtData(c.prazo.data as string)}</strong>
        <span className="hint">
          {" "}
          ({c.prazo.diasUteis === 1 ? "1 dia útil" : `${c.prazo.diasUteis} dias úteis`}
          {/* "à frente" e não "em fila": com a prioridade valendo, o que pesa
              não é a fila inteira, e sim o que corre antes desta tarefa. */}
          {c.prazo.esperaFilaMin > 0 && ` · ${fmtHoras(c.prazo.esperaFilaMin)} à frente`})
        </span>
      </span>

      <Badge tone={tom}>
        {DIAS_JANELA_CURTA} dias: {c.semana.ocupacaoPct === null ? "—" : `${Math.round(c.semana.ocupacaoPct)}%`}
      </Badge>
      <span className="hint">
        {fmtHoras(c.semana.comprometidoMin)} de {fmtHoras(c.semana.capacidadeMin)}
        {c.continuas > 0 &&
          ` · ${c.continuas} tarefa${c.continuas > 1 ? "s" : ""} contínua${c.continuas > 1 ? "s" : ""} não contabilizada${c.continuas > 1 ? "s" : ""}`}
      </span>

      <button
        type="button"
        onClick={onEscolher}
        disabled={selecionado}
        className="btn-secondary ml-auto !py-1 text-xs disabled:opacity-60"
      >
        {selecionado ? "Selecionado" : "Atribuir"}
      </button>
    </li>
  );
}
