"use client";

import { useMemo, useState } from "react";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, SectionCard } from "@/components/ui";
import { duracaoMin, formatarDuracao, type TimeEntry } from "@/lib/tracker/types";
import { addDias, segundaDaSemana, useEntradas, ymdLocal, type Usuario } from "./comum";

/** Relatório detalhado: período livre + filtros + exportação CSV. */
export function AbaRelatorios({
  usuarioSelecionado, nomeDe, mostrarUsuario,
}: {
  usuarioSelecionado: string;
  nomeDe: (email: string) => string;
  mostrarUsuario: boolean;
}) {
  const hoje = new Date();
  const [de, setDe] = useState(() => ymdLocal(segundaDaSemana(hoje)));
  const [ate, setAte] = useState(() => ymdLocal(addDias(segundaDaSemana(hoje), 6)));
  const [fCliente, setFCliente] = useState("todos");
  const [fCategoria, setFCategoria] = useState("todos");

  // `ate` é inclusivo na UI; a API usa [desde, ate), então soma 1 dia.
  const desdeDate = useMemo(() => new Date(`${de}T00:00:00`), [de]);
  const ateDate = useMemo(() => addDias(new Date(`${ate}T00:00:00`), 1), [ate]);
  const { entradas, carregando, erro } = useEntradas(desdeDate, ateDate, usuarioSelecionado);

  const agora = new Date();
  const min = (e: TimeEntry) => duracaoMin(e, agora);

  const clientes = useMemo(
    () => [...new Set(entradas.map((e) => e.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [entradas],
  );
  const categorias = useMemo(
    () => [...new Set(entradas.map((e) => e.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [entradas],
  );

  const filtradas = useMemo(() => {
    return entradas.filter((e) => {
      if (fCliente !== "todos" && e.cliente !== fCliente) return false;
      if (fCategoria !== "todos" && e.categoria !== fCategoria) return false;
      return true;
    }).sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
  }, [entradas, fCliente, fCategoria]);

  const totalMin = filtradas.reduce((s, e) => s + min(e), 0);

  const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
  const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  function exportarCsv() {
    const cabecalho = ["Data", "Início", "Fim", "Duração (h)", "Usuário", "Descrição", "Cliente", "Categoria", "Tags"];
    // Aspas duplicadas e campo entre aspas: descrição/cliente podem conter vírgula.
    const escapar = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = filtradas.map((e) => [
      fmtData(e.inicio),
      fmtHora(e.inicio),
      e.fim ? fmtHora(e.fim) : "",
      (min(e) / 60).toFixed(2).replace(".", ","), // decimal pt-BR, abre certo no Excel
      nomeDe(e.usuarioEmail),
      e.descricao,
      e.cliente,
      e.categoria,
      e.tags.join(" | "),
    ].map((c) => escapar(String(c))).join(";"));

    // BOM (﻿) para o Excel reconhecer os acentos como UTF-8.
    const csv = "﻿" + [cabecalho.map(escapar).join(";"), ...linhas].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tracker-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      <SectionCard title="Filtros">
        <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-4">
          <div>
            <label className="field-label" htmlFor="rel-de">De</label>
            <input id="rel-de" type="date" className="field-input" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="rel-ate">Até</label>
            <input id="rel-ate" type="date" className="field-input" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="rel-cliente">Cliente</label>
            <select id="rel-cliente" className="field-input" value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
              <option value="todos">Todos os clientes</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="rel-categoria">Categoria</label>
            <select id="rel-categoria" className="field-input" value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
              <option value="todos">Todas as categorias</option>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </SectionCard>

      <KpiGrid>
        <Kpi label="Total no filtro" value={formatarDuracao(totalMin)} destaque />
        <Kpi label="Lançamentos" value={String(filtradas.length)} />
        <Kpi label="Horas decimais" value={(totalMin / 60).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} />
      </KpiGrid>

      <SectionCard
        title="Lançamentos"
        actions={
          <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={exportarCsv} disabled={filtradas.length === 0}>
            Exportar CSV
          </button>
        }
      >
        {carregando ? (
          <Loading />
        ) : filtradas.length === 0 ? (
          <EmptyState>Nenhum lançamento com esses filtros.</EmptyState>
        ) : (
          <>
            {/* Tabela no desktop; cartões no celular (convenção do projeto). */}
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Descrição</th>
                    {mostrarUsuario && <th>Usuário</th>}
                    <th>Cliente</th>
                    <th>Categoria</th>
                    <th className="text-right">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap tabular-nums">{fmtData(e.inicio)}</td>
                      <td className="whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                        {fmtHora(e.inicio)}{e.fim ? `–${fmtHora(e.fim)}` : ""}
                      </td>
                      <td>
                        <span className="text-gta-navy dark:text-slate-100">{e.descricao || "(sem descrição)"}</span>
                      </td>
                      {mostrarUsuario && <td className="whitespace-nowrap">{nomeDe(e.usuarioEmail)}</td>}
                      <td>{e.cliente || <span className="sem-valor">—</span>}</td>
                      <td>{e.categoria || <span className="sem-valor">—</span>}</td>
                      <td className="whitespace-nowrap text-right tabular-nums font-medium">{formatarDuracao(min(e))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {filtradas.map((e) => (
                <div key={e.id} className="rounded-md border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium text-gta-navy dark:text-slate-100">{e.descricao || "(sem descrição)"}</span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatarDuracao(min(e))}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="tabular-nums">{fmtData(e.inicio)} · {fmtHora(e.inicio)}{e.fim ? `–${fmtHora(e.fim)}` : ""}</span>
                    {mostrarUsuario && <span>· {nomeDe(e.usuarioEmail)}</span>}
                    {e.cliente && <span>· {e.cliente}</span>}
                    {e.categoria && <span>· {e.categoria}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
