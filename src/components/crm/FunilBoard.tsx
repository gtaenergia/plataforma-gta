"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, EmptyState, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { formatBRL } from "@/lib/format";
import { valorDaNegociacao, type Funil, type Negociacao } from "@/lib/crm/types";
import { dataCurta } from "./util";

/**
 * O quadro do funil: uma coluna por etapa, um cartão por negociação em aberto.
 *
 * Mover de etapa: arrastando o cartão (desktop) ou pelo seletor de etapa no
 * próprio cartão — que é também o caminho do dedo, onde arrastar não existe.
 * Ganhar/perder ficam na ficha da negociação, onde a perda pede o motivo.
 */
export function FunilBoard() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [funilId, setFunilId] = useState("");
  const [fResponsavel, setFResponsavel] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/funis").then((r) => r.json()),
      fetch("/api/crm/negociacoes").then((r) => r.json()),
    ])
      .then(([f, n]) => {
        const lista: Funil[] = f.funis ?? [];
        setFunis(lista);
        setNegociacoes(n.negociacoes ?? []);
        if (lista.length > 0) setFunilId((atual) => atual || lista[0].id);
      })
      .catch(() => setErro("Falha ao carregar o funil."))
      .finally(() => setLoading(false));
  }, []);

  const funil = useMemo(() => funis.find((f) => f.id === funilId) ?? null, [funis, funilId]);

  /** No quadro só vive o que ainda está em jogo: abertas e pausadas. */
  const doQuadro = useMemo(
    () =>
      negociacoes.filter(
        (n) =>
          n.funilId === funilId &&
          (n.situacao === "aberta" || n.situacao === "pausada") &&
          (!fResponsavel || n.responsavel === fResponsavel),
      ),
    [negociacoes, funilId, fResponsavel],
  );

  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const n of negociacoes) if (n.responsavel) mapa.set(n.responsavel, n.responsavelNome || n.responsavel);
    return Array.from(mapa, ([email, nome]) => ({ email, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [negociacoes]);

  async function moverEtapa(n: Negociacao, etapaId: string) {
    if (etapaId === n.etapaId) return;
    // Otimista: o cartão muda de coluna já no arrasto; a resposta confirma
    // (e traz o histórico novo) ou devolve com a mensagem de erro.
    setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, etapaId } : x)));
    try {
      const res = await fetch(`/api/crm/negociacoes/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao mover.");
      setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? (data.negociacao as Negociacao) : x)));
    } catch (err) {
      setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      setErro(err instanceof Error ? err.message : "Falha ao mover.");
    }
  }

  if (loading) return <Loading>Carregando o funil…</Loading>;
  if (!funil) return <EmptyState>Nenhum funil configurado.</EmptyState>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Barra: seletor de funil + filtro + nova negociação */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        {funis.length > 1 && (
          <Campo className="min-w-[180px]" label="Funil">
            <select className="field-input" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo className="min-w-[180px]" label="Responsável">
          <select className="field-input" value={fResponsavel} onChange={(e) => setFResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {responsaveis.map((r) => <option key={r.email} value={r.email}>{r.nome}</option>)}
          </select>
        </Campo>
        <div className="flex-1" />
        <Link href="/crm/negociacoes#novo" className="btn-primary whitespace-nowrap">+ Nova negociação</Link>
      </div>

      {/* O quadro: rolagem horizontal — colunas não se espremem em tela estreita. */}
      <div className="sem-barra-rolagem -mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex items-start gap-3" style={{ minWidth: `${funil.etapas.length * 272}px` }}>
          {funil.etapas.map((etapa) => {
            const daColuna = doQuadro.filter((n) => n.etapaId === etapa.id);
            const soma = daColuna.reduce((s, n) => s + valorDaNegociacao(n), 0);
            return (
              <section
                key={etapa.id}
                aria-label={`Etapa ${etapa.nome}`}
                className={`w-[260px] shrink-0 rounded-xl border bg-slate-50 dark:bg-slate-900/50 ${
                  alvo === etapa.id ? "border-gta-indigo" : "border-slate-200 dark:border-slate-700"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(etapa.id);
                }}
                onDragLeave={() => setAlvo((a) => (a === etapa.id ? null : a))}
                onDrop={(e) => {
                  e.preventDefault();
                  setAlvo(null);
                  const n = negociacoes.find((x) => x.id === arrastando);
                  if (n) void moverEtapa(n, etapa.id);
                  setArrastando(null);
                }}
              >
                <header className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gta-navy dark:text-slate-100">{etapa.nome}</span>
                    <span className="hint shrink-0">{daColuna.length}</span>
                  </div>
                  <div className="hint mt-0.5">{soma > 0 ? formatBRL(soma) : "—"}</div>
                </header>
                <div className="space-y-2 p-2">
                  {daColuna.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-slate-500 dark:text-slate-400">Sem negociações</p>
                  )}
                  {daColuna.map((n) => (
                    <article
                      key={n.id}
                      draggable
                      onDragStart={() => setArrastando(n.id)}
                      onDragEnd={() => {
                        setArrastando(null);
                        setAlvo(null);
                      }}
                      className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${
                        arrastando === n.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/crm/negociacoes/${n.id}`}
                          className="toque min-w-0 text-sm font-medium text-gta-navy hover:underline dark:text-slate-100"
                        >
                          {n.nome}
                        </Link>
                        {n.situacao === "pausada" && <Badge tone="amber" className="shrink-0">Pausada</Badge>}
                      </div>
                      {n.empresaNome && <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{n.empresaNome}</div>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</span>
                        {n.previsao && <span>{dataCurta(n.previsao)}</span>}
                      </div>
                      {n.responsavelNome && <div className="hint mt-1 truncate">{n.responsavelNome}</div>}
                      {/* Caminho sem arrasto (dedo, teclado): o mesmo movimento, por seletor. */}
                      <select
                        className="field-input mt-2 w-full !py-1 text-xs"
                        value={n.etapaId}
                        onChange={(e) => void moverEtapa(n, e.target.value)}
                        aria-label={`Etapa de ${n.nome}`}
                      >
                        {funil.etapas.map((e2) => <option key={e2.id} value={e2.id}>{e2.nome}</option>)}
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
