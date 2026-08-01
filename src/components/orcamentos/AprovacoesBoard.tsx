"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ESTACOES, estacaoLabel, type Estacao, type Orcamento } from "@/lib/orcamentos/types";
import { Alert, Badge, EmptyState, Loading, type Tone } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { formatBRL } from "@/lib/format";

/** Dias inteiros desde uma data ISO (null se ausente/ inválida). */
function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Quando o orçamento entrou em revisão (último registro "enviar" do histórico). */
function paradoDesde(o: Orcamento): string | null {
  const envios = (o.historico ?? []).filter((h) => h.tipo === "enviar");
  return envios.length ? envios[envios.length - 1].em : o.atualizadoEm ?? null;
}

/** Dias até o vencimento da validade (negativo = já venceu). null se sem dados. */
function venceEmDias(o: Orcamento): number | null {
  const d = o.meta?.dataEmissao;
  const v = o.meta?.validadeDias;
  if (!d || !v || v <= 0) return null;
  const [y, m, dia] = d.split("-").map(Number);
  if (!y || !m || !dia) return null;
  const vencimento = new Date(y, m - 1, dia + v); // Date normaliza o excesso de dias
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((vencimento.getTime() - hoje.getTime()) / 86_400_000);
}

const ESTACAO_TONE: Record<Estacao, Tone> = {
  rascunho: "slate",
  em_revisao: "amber",
  aprovado: "green",
  cancelado: "slate",
};

const FILTROS: { value: Estacao | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  ...ESTACOES.map((e) => ({ value: e.value, label: e.label })),
];

export function AprovacoesBoard() {
  const [lista, setLista] = useState<Orcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Estacao | "todos">("todos");

  useEffect(() => {
    fetch("/api/orcamentos")
      .then((r) => r.json())
      .then((d) => setLista(d.orcamentos ?? []))
      .catch(() => setErro("Falha ao carregar orçamentos."))
      .finally(() => setLoading(false));
  }, []);

  const filtrada = useMemo(
    () => (filtro === "todos" ? lista : lista.filter((o) => o.estacao === filtro)),
    [lista, filtro],
  );

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of lista) m[o.estacao] = (m[o.estacao] ?? 0) + 1;
    return m;
  }, [lista]);

  // Fila de revisão: quem está esperando decisão há mais tempo aparece primeiro.
  const ordenada = useMemo(() => {
    if (filtro !== "em_revisao") return filtrada;
    return [...filtrada].sort((a, b) => (paradoDesde(a) ?? "").localeCompare(paradoDesde(b) ?? ""));
  }, [filtrada, filtro]);

  const { paginados, controles } = usePaginacao(ordenada);

  if (loading) return <Loading>Carregando orçamentos…</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`toque justify-center rounded-md px-2.5 py-1 text-xs transition ${
                filtro === f.value
                  ? "bg-gta-navy text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
              }`}
            >
              {f.label}
              {f.value !== "todos" && contagem[f.value] ? ` (${contagem[f.value]})` : ""}
            </button>
          ))}
        </div>
        <span className="ml-auto hint">{lista.length} orçamento(s)</span>
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}

      {filtrada.length === 0 ? (
        <EmptyState>
          {filtro !== "todos"
            ? `Nenhum orçamento em "${estacaoLabel(filtro as Estacao)}".`
            : "Nenhum orçamento ainda. Envie uma proposta para aprovação em Propostas."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {paginados.map((o) => {
            const parado = o.estacao === "em_revisao" ? diasDesde(paradoDesde(o)) : null;
            const vence = o.estacao === "rascunho" || o.estacao === "em_revisao" ? venceEmDias(o) : null;
            const temLinhaInfo = (o.valor != null && o.valor > 0) || parado != null || vence != null;
            return (
              <Link key={o.id} href={`/aprovacoes/${o.id}`} className="card block p-4 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gta-navy dark:text-slate-100">{o.cliente}</div>
                    <div className="truncate hint">{o.referencia}</div>
                  </div>
                  <Badge tone={ESTACAO_TONE[o.estacao]} className="shrink-0">{estacaoLabel(o.estacao)}</Badge>
                </div>

                {temLinhaInfo && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {o.valor != null && o.valor > 0 && (
                      <span className="text-sm font-semibold text-gta-navy dark:text-slate-100">{formatBRL(o.valor)}</span>
                    )}
                    {parado != null && (
                      <Badge tone={parado > 14 ? "red" : "amber"}>{parado <= 0 ? "parado hoje" : `parado há ${parado}d`}</Badge>
                    )}
                    {vence != null &&
                      (vence < 0 ? (
                        <Badge tone="red">vencida há {-vence}d</Badge>
                      ) : (
                        <Badge tone={vence <= 7 ? "amber" : "slate"}>vence em {vence}d</Badge>
                      ))}
                  </div>
                )}

                {o.descricao && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{o.descricao}</p>}

                <div className="mt-2 flex items-center justify-between gap-2 hint">
                  <span className="truncate">por {o.criadoPorNome ?? o.criadoPor}</span>
                  {o.estacao === "aprovado" && o.decididoPor && (
                    <span className="shrink-0 text-green-700 dark:text-green-400">Aprovado por {o.decididoPor}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Paginacao {...controles} />
    </div>
  );
}
