"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, Marca, SectionCard } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import {
  SITUACAO_LABEL,
  SITUACAO_TONE,
  valorDaNegociacao,
  type Negociacao,
} from "@/lib/crm/types";

/** Painel de abertura do CRM: o momento comercial em quatro números + o que se mexeu por último. */
export function CrmInicio() {
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/negociacoes")
      .then((r) => r.json())
      .then((d) => setNegociacoes(d.negociacoes ?? []))
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  const resumo = useMemo(() => {
    const agora = new Date();
    const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
    const abertas = negociacoes.filter((n) => n.situacao === "aberta" || n.situacao === "pausada");
    const ganhasMes = negociacoes.filter((n) => n.situacao === "ganha" && n.fechadoEm.startsWith(mes));
    const perdidasMes = negociacoes.filter((n) => n.situacao === "perdida" && n.fechadoEm.startsWith(mes));
    return {
      abertas: abertas.length,
      emFunil: abertas.reduce((s, n) => s + valorDaNegociacao(n), 0),
      ganhasMes: ganhasMes.length,
      vendidoMes: ganhasMes.reduce((s, n) => s + valorDaNegociacao(n), 0),
      perdidasMes: perdidasMes.length,
    };
  }, [negociacoes]);

  const recentes = useMemo(
    () => [...negociacoes].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).slice(0, 6),
    [negociacoes],
  );

  if (loading) return <Loading>Carregando o painel…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <KpiGrid>
        <Kpi destaque label="Valor em funil" value={formatBRL(resumo.emFunil)} />
        <Kpi label="Negociações em aberto" value={resumo.abertas} />
        <Kpi tone="green" label="Vendido no mês" value={`${formatBRL(resumo.vendidoMes)} (${resumo.ganhasMes})`} />
        <Kpi tone={resumo.perdidasMes > 0 ? "red" : undefined} label="Perdidas no mês" value={resumo.perdidasMes} />
      </KpiGrid>

      <SectionCard
        title="Últimas movimentações"
        subtitle="As negociações mexidas mais recentemente, de qualquer funil."
        actions={<Link href="/crm/funil" className="btn-secondary !py-1.5 text-sm">Abrir o funil</Link>}
      >
        {recentes.length === 0 ? (
          <EmptyState>
            Nenhuma negociação ainda. <Link href="/crm/negociacoes#novo" className="btn-link">Crie a primeira</Link> ou
            cadastre <Link href="/crm/empresas" className="btn-link">empresas</Link> e{" "}
            <Link href="/crm/contatos" className="btn-link">contatos</Link> antes.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {recentes.map((n) => (
              <li key={n.id}>
                <Link href={`/crm/negociacoes/${n.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gta-navy dark:text-slate-100">{n.nome}</span>
                    <span className="hint block truncate">{[n.empresaNome, n.responsavelNome].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</span>
                    <Marca tone={SITUACAO_TONE[n.situacao]} className="text-xs">{SITUACAO_LABEL[n.situacao]}</Marca>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
