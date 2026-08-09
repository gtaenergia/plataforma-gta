"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, BackLink, EmptyState, Kpi, KpiGrid, Loading, Marca, SectionCard } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { cidadeUf, type Cliente } from "@/lib/clientes/types";
import {
  SITUACAO_LABEL,
  SITUACAO_TONE,
  valorDaNegociacao,
  type Contato,
  type Negociacao,
} from "@/lib/crm/types";
import { buscarJson } from "./buscar";
import { dataCurta } from "./util";

/**
 * A empresa como HUB, não como linha de cadastro.
 *
 * A lista de Empresas responde "esse cliente existe?". Não respondia "o que
 * temos com ele?" — para saber, era preciso ir às Negociações e buscar pelo
 * nome, torcendo para estar escrito igual. Um cliente com seis negociações
 * era invisível como cliente.
 *
 * Aqui ficam as três coisas que se pergunta antes de ligar para alguém: o que
 * está em aberto, quanto já se fechou, e com quem falar.
 */
export function EmpresaDetalhe({ id }: { id: string }) {
  const [empresa, setEmpresa] = useState<Cliente | null>(null);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      buscarJson<{ cliente: Cliente }>(`/api/clientes/${id}`),
      buscarJson<{ negociacoes: Negociacao[] }>("/api/crm/negociacoes"),
      buscarJson<{ contatos: Contato[] }>("/api/crm/contatos"),
    ])
      .then(([e, n, c]) => {
        setEmpresa(e.cliente);
        /*
         * Casa por id OU por nome.
         *
         * Nem toda negociação tem `empresaId`: a criação rápida na coluna do
         * funil pede só o nome, e negociações antigas nasceram antes de a
         * empresa existir no cadastro. Filtrar só por id mostraria "nenhuma
         * negociação" para um cliente com seis — e o nome está denormalizado
         * justamente para casos assim.
         */
        const mesmoNome = (nome: string) => nome.trim().toLowerCase() === e.cliente.nome.trim().toLowerCase();
        setNegociacoes((n.negociacoes ?? []).filter((x) => (x.empresaId ? x.empresaId === id : mesmoNome(x.empresaNome))));
        setContatos((c.contatos ?? []).filter((x) => (x.empresaId ? x.empresaId === id : mesmoNome(x.empresaNome))));
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Falha ao carregar a empresa."))
      .finally(() => setLoading(false));
  }, [id]);

  const resumo = useMemo(() => {
    const abertas = negociacoes.filter((n) => n.situacao === "aberta" || n.situacao === "pausada");
    const ganhas = negociacoes.filter((n) => n.situacao === "ganha");
    return {
      abertas: abertas.length,
      emJogo: abertas.reduce((s, n) => s + valorDaNegociacao(n), 0),
      ganhas: ganhas.length,
      faturado: ganhas.reduce((s, n) => s + valorDaNegociacao(n), 0),
    };
  }, [negociacoes]);

  if (loading) return <Loading>Carregando a empresa…</Loading>;
  if (!empresa) {
    return (
      <div className="space-y-4">
        <BackLink href="/crm/empresas">Empresas</BackLink>
        <Alert tone="red" titulo="Empresa não encontrada.">{erro ?? "Ela pode ter sido excluída."}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackLink href="/crm/empresas">Empresas</BackLink>
      {erro && <Alert tone="red">{erro}</Alert>}

      <SectionCard
        title={empresa.nome}
        subtitle={[cidadeUf(empresa), empresa.segmento, empresa.documento].filter(Boolean).join(" · ") || undefined}
      >
        <KpiGrid>
          <Kpi destaque label="Em jogo agora" value={formatBRL(resumo.emJogo)} />
          <Kpi label="Negociações abertas" value={resumo.abertas} />
          <Kpi tone="green" label="Já fechado" value={formatBRL(resumo.faturado)} />
          <Kpi label="Negociações ganhas" value={resumo.ganhas} />
        </KpiGrid>
      </SectionCard>

      <SectionCard
        title="Negociações"
        subtitle="Tudo o que já se conversou com este cliente — aberto, ganho e perdido."
        actions={<Link href="/crm/negociacoes#novo" className="btn-secondary !py-1.5 text-sm">+ Nova negociação</Link>}
      >
        {negociacoes.length === 0 ? (
          <EmptyState>
            Nenhuma negociação com esta empresa ainda.{" "}
            <Link href="/crm/negociacoes#novo" className="btn-link">Criar a primeira</Link>
          </EmptyState>
        ) : (
          <>
            {/* Cartões no celular, tabela no desktop — o padrão das listas. */}
            <div className="space-y-3 md:hidden">
              {negociacoes.map((n) => (
                <Link key={n.id} href={`/crm/negociacoes/${n.id}`} className="block p-3 card">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-gta-navy dark:text-slate-100">{n.nome}</span>
                    <Marca tone={SITUACAO_TONE[n.situacao]} className="shrink-0 text-xs">{SITUACAO_LABEL[n.situacao]}</Marca>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</span>
                    {n.previsao && <span>{dataCurta(n.previsao)}</span>}
                    {n.responsavelNome && <span>{n.responsavelNome}</span>}
                  </div>
                </Link>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Negociação</th>
                    <th className="text-right">Valor</th>
                    <th>Responsável</th>
                    <th>Previsão</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {negociacoes.map((n) => (
                    <tr key={n.id}>
                      <td className="px-4 py-2 font-medium">
                        <Link href={`/crm/negociacoes/${n.id}`} className="text-gta-navy hover:underline dark:text-slate-100">{n.nome}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{formatBRL(valorDaNegociacao(n))}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.responsavelNome || <span className="sem-valor">—</span>}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.previsao ? dataCurta(n.previsao) : <span className="sem-valor">—</span>}</td>
                      <td className="px-4 py-2"><Marca tone={SITUACAO_TONE[n.situacao]}>{SITUACAO_LABEL[n.situacao]}</Marca></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Contatos" subtitle="Com quem falar nesta empresa.">
        {contatos.length === 0 ? (
          <EmptyState>
            Nenhum contato cadastrado.{" "}
            <Link href="/crm/contatos" className="btn-link">Cadastrar</Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {contatos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gta-navy dark:text-slate-100">{c.nome}</span>
                  {c.cargo && <span className="hint block truncate">{c.cargo}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end text-xs text-slate-600 dark:text-slate-400">
                  {c.telefone && <span>{c.telefone}</span>}
                  {c.email && <span className="truncate">{c.email}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {(empresa.logradouro || empresa.observacoes) && (
        <SectionCard title="Cadastro">
          <dl className="space-y-1.5 text-sm">
            {empresa.logradouro && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="hint">Endereço</dt>
                <dd className="text-right">
                  {[empresa.logradouro, empresa.numero, empresa.bairro].filter(Boolean).join(", ")}
                </dd>
              </div>
            )}
            {empresa.observacoes && (
              <div>
                <dt className="hint">Observações</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-300">{empresa.observacoes}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700">
            <Link href="/crm/empresas" className="btn-link text-sm">Editar cadastro na lista de Empresas</Link>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
