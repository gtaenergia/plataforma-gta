"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";
import { Alert, Loading, SectionCard } from "@/components/ui";
import { DIAS_PARA_REVISAO, type MaterialPreco } from "@/lib/precos/catalogo";

/**
 * Revisão dos preços de materiais.
 *
 * Só o PREÇO é editável: descrição, unidade e categoria vêm do motor, porque
 * são elas que amarram o item ao cálculo. Deixar a descrição livre criaria uma
 * lista bonita e desconectada do que a proposta realmente usa.
 */

const nf = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseBR = (s: string) => {
  const t = String(s ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return Number.NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

interface Tabela {
  itens: MaterialPreco[];
  atualizadoEm: string;
  atualizadoPor: string;
  revisaoPendente: boolean;
}

export function PrecosEditor({ podeEditar }: { podeEditar: boolean }) {
  const [tabela, setTabela] = useState<Tabela | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  /** Preço digitado e ainda não gravado — o rascunho vive só na memória. */
  const temRascunho = Object.values(rascunho).some((v) => v.trim() !== "");
  useAvisoNaoSalvo(temRascunho);
  const arquivoRef = useRef<HTMLInputElement>(null);

  function aplicar(t: Tabela) {
    setTabela(t);
    setRascunho(Object.fromEntries(t.itens.map((i) => [i.id, nf(i.preco)])));
  }

  useEffect(() => {
    fetch("/api/precos")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar os preços.");
        return d as Tabela;
      })
      .then(aplicar)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar."))
      .finally(() => setCarregando(false));
  }, []);

  /** Só o que mudou vai para o servidor. */
  const alterados = useMemo(() => {
    if (!tabela) return [];
    return tabela.itens
      .map((i) => ({ id: i.id, preco: parseBR(rascunho[i.id] ?? "") }))
      .filter((x, idx) => Number.isFinite(x.preco) && x.preco >= 0 && Math.abs(x.preco - tabela.itens[idx].preco) > 0.001);
  }, [tabela, rascunho]);

  const invalidos = useMemo(
    () => Object.entries(rascunho).filter(([, v]) => v.trim() !== "" && !Number.isFinite(parseBR(v))).map(([id]) => id),
    [rascunho],
  );

  const visiveis = useMemo(() => {
    if (!tabela) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return tabela.itens;
    return tabela.itens.filter((i) => `${i.descricao} ${i.categoria} ${i.unidade}`.toLowerCase().includes(q));
  }, [tabela, busca]);

  async function salvar() {
    if (alterados.length === 0) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/precos", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ precos: alterados }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao salvar.");
      aplicar(d.tabela);
      setAviso(`${d.atualizados} ${d.atualizados === 1 ? "preço atualizado" : "preços atualizados"}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function importar(arquivo: File) {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/precos/importar", { method: "POST", body: await arquivo.text() });
      const d = await res.json();
      if (!res.ok) {
        const det = d.problemas?.length ? ` Primeiro problema: linha ${d.problemas[0].linha} — ${d.problemas[0].motivo}` : "";
        throw new Error((d.error ?? "Falha ao importar.") + det);
      }
      aplicar(d.tabela);
      const partes = [`${d.atualizados} ${d.atualizados === 1 ? "preço atualizado" : "preços atualizados"}`];
      if (d.emBranco) partes.push(`${d.emBranco} em branco (mantidos)`);
      if (d.naoReconhecidos?.length) partes.push(`${d.naoReconhecidos.length} não reconhecido(s)`);
      if (d.problemas?.length) partes.push(`${d.problemas.length} linha(s) com problema`);
      setAviso(partes.join(" · ") + ".");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setSalvando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  if (carregando) return <Loading>Carregando os preços…</Loading>;
  if (!tabela) return <Alert tone="red">{erro ?? "Não foi possível carregar."}</Alert>;

  const dias = Math.floor((Date.now() - Date.parse(tabela.atualizadoEm)) / 86_400_000);

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}
      {aviso && <Alert tone="green">{aviso}</Alert>}

      {tabela.revisaoPendente ? (
        <Alert tone="amber" titulo="Estes preços precisam de revisão.">
          A última atualização foi há {dias} dias ({new Date(tabela.atualizadoEm).toLocaleDateString("pt-BR")}, por{" "}
          {tabela.atualizadoPor}). Material elétrico muda de preço com frequência — acima de {DIAS_PARA_REVISAO} dias
          a margem das propostas passa a ser calculada sobre um custo que não existe mais.
        </Alert>
      ) : (
        <p className="subtitle">
          Revisados há {dias} {dias === 1 ? "dia" : "dias"} ({new Date(tabela.atualizadoEm).toLocaleDateString("pt-BR")}),
          por {tabela.atualizadoPor}.
        </p>
      )}

      <SectionCard
        title="Atualizar por planilha"
        subtitle="Para revisar tudo de uma vez, com as cotações do fornecedor na mão."
      >
        <ol className="ml-4 list-decimal space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
          <li>Baixe a planilha — ela já vem preenchida com os preços de hoje.</li>
          <li>Preencha só a coluna <strong>PRECO_NOVO</strong> do que mudou. O que ficar em branco continua valendo.</li>
          <li>Importe o arquivo de volta.</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a className="btn-secondary" href="/api/precos/planilha" download>Baixar planilha</a>
          {podeEditar && (
            <>
              <button type="button" className="btn-secondary" onClick={() => arquivoRef.current?.click()} disabled={salvando}>
                Importar preenchida
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); }}
              />
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title={`Materiais (${tabela.itens.length})`}
        subtitle="Só o preço é editável — descrição e unidade vêm do cálculo e não podem divergir dele."
        actions={
          podeEditar ? (
            <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || alterados.length === 0 || invalidos.length > 0}>
              {salvando ? "Salvando…" : alterados.length > 0 ? `Salvar ${alterados.length}` : "Salvar"}
            </button>
          ) : undefined
        }
      >
        <div className="mb-4">
          <label className="field-label" htmlFor="precos-busca">Buscar material</label>
          <input id="precos-busca" className="field-input" placeholder="Digite para filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        {invalidos.length > 0 && (
          <Alert tone="red" className="mb-4">
            {invalidos.length} campo(s) com valor que não é número. Corrija antes de salvar.
          </Alert>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="hidden sm:table-cell">Categoria</th>
                <th>Un.</th>
                <th className="text-right">Preço (R$)</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => {
                const mudou = alterados.some((a) => a.id === i.id);
                return (
                  <tr key={i.id}>
                    <td>
                      <span className="text-gta-navy dark:text-slate-100">{i.descricao}</span>
                      {mudou && <span className="ml-2 badge badge-amber">alterado</span>}
                    </td>
                    <td className="hidden sm:table-cell text-slate-600 dark:text-slate-400">{i.categoria}</td>
                    <td className="text-slate-600 dark:text-slate-400">{i.unidade}</td>
                    <td className="text-right">
                      <input
                        className="field-input w-28 text-right"
                        inputMode="decimal"
                        aria-label={`Preço de ${i.descricao}`}
                        value={rascunho[i.id] ?? ""}
                        disabled={!podeEditar}
                        onChange={(e) => setRascunho((r) => ({ ...r, [i.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {visiveis.length === 0 && <p className="mt-4 subtitle">Nenhum material corresponde à busca.</p>}
      </SectionCard>
    </div>
  );
}
