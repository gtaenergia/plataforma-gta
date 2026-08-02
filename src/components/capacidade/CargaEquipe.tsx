"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Loading, SectionCard, Segmented } from "@/components/ui";
import {
  agruparPorResponsavel,
  capacidadeDe,
  entraNaFila,
  estimativaDaTarefa,
  ordenarFila,
  simularFila,
  folgaNaJanela,
  OCUPACAO_ATENCAO_PCT,
  OCUPACAO_LIMITE_PCT,
} from "@/lib/capacidade/motor";
import type { Task } from "@/lib/tasks/types";
import { DIAS_JANELA_CURTA, DIAS_JANELA_LONGA, fimJanelaCurta, fimJanelaLonga } from "@/lib/capacidade/datas";
import { fmtHoras, hojeYmd, tomDaOcupacao, useCapacidade } from "./comum";

/**
 * Quanto da capacidade de cada pessoa já está comprometido.
 *
 * Fica acima da lista de tarefas, e NÃO dentro de Apontamentos: aquela aba é
 * sobre horas realizadas, esta é sobre horas planejadas. Misturar as duas
 * embaralharia o vocabulário justo onde a confusão custa caro — "40 horas" ali
 * significa trabalho feito, aqui significa trabalho prometido.
 *
 * A conta é a mesma que alimenta o prazo proposto no formulário. Se os dois
 * discordassem, ninguém confiaria em nenhum dos dois.
 */

interface Usuario {
  email: string;
  name: string;
}

/** Quantas pessoas o resumo recolhido exibe antes de agrupar o restante. */
const RESUMO_MAX = 8;

function primeiroNome(nome: string): string {
  return nome.split(" ")[0];
}

export function CargaEquipe({ tarefas }: { tarefas: Task[] }) {
  const { config, carregando } = useCapacidade();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [janela, setJanela] = useState<"semana" | "mes">("semana");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setUsuarios(d.usuarios ?? []))
      .catch(() => {});
  }, []);

  const linhas = useMemo(() => {
    const hoje = hojeYmd();
    const ate = janela === "semana" ? fimJanelaCurta(hoje) : fimJanelaLonga(hoje);
    // Uma passagem na lista em vez de uma varredura por pessoa — ver
    // `agruparPorResponsavel`.
    const porResponsavel = agruparPorResponsavel(tarefas);

    return usuarios
      .map((u) => {
        const capacidade = capacidadeDe(config, u.email);
        const minhas = porResponsavel.get(u.email) ?? [];
        const entradas = ordenarFila(minhas.filter((t) => entraNaFila(t.status))).map((t) => ({
          tarefaId: t.id,
          minutos: estimativaDaTarefa(t, config).minutos,
        }));
        const fila = simularFila({ hoje, capacidade, config, entradas });
        const folga = folgaNaJanela({ capacidade, config, de: hoje, ate, pendenteMin: fila.totalMin });
        return {
          email: u.email,
          nome: u.name || u.email,
          folga,
          abertas: entradas.length,
          continuas: minhas.filter((t) => t.status === "continuo").length,
        };
      })
      // Mais carregado primeiro: quem está no vermelho é o motivo de olhar.
      .sort((a, b) => (b.folga.ocupacaoPct ?? -1) - (a.folga.ocupacaoPct ?? -1));
  }, [usuarios, tarefas, config, janela]);

  const estourados = linhas.filter((l) => (l.folga.ocupacaoPct ?? 0) > OCUPACAO_LIMITE_PCT).length;
  const dias = janela === "semana" ? DIAS_JANELA_CURTA : DIAS_JANELA_LONGA;

  if (carregando) return null;

  return (
    <SectionCard
      title="Carga da equipe"
      subtitle={
        estourados > 0
          ? `${estourados} ${estourados > 1 ? "profissionais acima da capacidade" : "profissional acima da capacidade"} nos próximos ${dias} dias.`
          : `Demanda em aberto sobre a capacidade disponível nos próximos ${dias} dias.`
      }
      actions={
        <div className="flex items-center gap-2">
          <Segmented
            value={janela}
            onChange={setJanela}
            aria="Janela da carga"
            options={[
              { value: "semana", label: "7 dias" },
              { value: "mes", label: "30 dias" },
            ]}
          />
          <button type="button" className="btn-ghost" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? "Ocultar" : "Ver"}
          </button>
        </div>
      }
    >
      {!aberto ? (
        <div className="flex flex-wrap items-center gap-2">
          {linhas.length === 0 ? (
            <p className="hint">Sem usuários para calcular.</p>
          ) : (
            <>
              {/* A lista está ordenada da maior para a menor ocupação, então o
                  recorte mostra justamente quem exige atenção. */}
              {linhas.slice(0, RESUMO_MAX).map((l) => (
                <Badge key={l.email} tone={tomDaOcupacao(l.folga.ocupacaoPct)}>
                  {primeiroNome(l.nome)} {l.folga.ocupacaoPct === null ? "—" : `${Math.round(l.folga.ocupacaoPct)}%`}
                </Badge>
              ))}
              {linhas.length > RESUMO_MAX && (
                <button type="button" className="btn-link text-xs" onClick={() => setAberto(true)}>
                  Mais {linhas.length - RESUMO_MAX}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <li key={l.email} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-center sm:gap-3">
              <span className="truncate text-sm font-medium text-gta-navy dark:text-slate-100">{l.nome}</span>
              <Barra pct={l.folga.ocupacaoPct} />
              <span className="hint whitespace-nowrap">
                {fmtHoras(l.folga.comprometidoMin)} de {fmtHoras(l.folga.capacidadeMin)}
                {" · "}
                {l.abertas} tarefa{l.abertas === 1 ? "" : "s"}
                {/* Tarefa contínua consome tempo de trabalho mas não tem prazo
                    para entrar no cálculo. Declarar a lacuna é preferível a
                    omiti-la. */}
                {l.continuas > 0 && ` · ${l.continuas} contínua${l.continuas > 1 ? "s" : ""} não contabilizada${l.continuas > 1 ? "s" : ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint mt-3">
        Calculado a partir da estimativa de duração de cada tarefa e do catálogo de demandas.
      </p>
    </SectionCard>
  );
}

function Barra({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="sem-valor text-xs">Sem jornada cadastrada</span>;
  }
  const tom = tomDaOcupacao(pct);
  const cor =
    tom === "red" ? "bg-red-500" : tom === "amber" ? "bg-amber-500" : "bg-green-500";
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={OCUPACAO_LIMITE_PCT}
      aria-label={`Ocupação: ${Math.round(pct)} por cento${pct > OCUPACAO_LIMITE_PCT ? " — acima da capacidade" : pct >= OCUPACAO_ATENCAO_PCT ? " — perto do limite" : ""}`}
    >
      {/* A barra satura em 100%: o número ao lado é quem conta o excedente. */}
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}
