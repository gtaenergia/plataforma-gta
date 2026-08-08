"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { formatBRL, parseNumber } from "@/lib/format";
import type { ProdutoCrm } from "@/lib/crm/types";

interface ServicoOpcao {
  key: string;
  label: string;
}

/**
 * Catálogo de produtos e serviços do CRM. Sem exclusão, por desenho: o item
 * fora de linha é OCULTADO — some das negociações novas e continua valendo
 * nas antigas e nos relatórios (regra herdada do RD).
 */
export function ProdutosConfig() {
  const [produtos, setProdutos] = useState<ProdutoCrm[]>([]);
  const [servicos, setServicos] = useState<ServicoOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/produtos").then((r) => r.json()),
      // O catálogo de serviços da plataforma — é o que o produto passa a apontar.
      fetch("/api/services").then((r) => r.json()).catch(() => ({ services: [] })),
    ])
      .then(([p, s]) => {
        setProdutos(p.produtos ?? []);
        setServicos((s.services ?? []).map((x: { key: string; label: string }) => ({ key: x.key, label: x.label })));
      })
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().length < 2) { setErro("Mínimo de 2 caracteres no nome."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/crm/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, precoBase: parseNumber(preco), serviceKey: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setProdutos((prev) => [...prev, data.produto as ProdutoCrm].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setNome("");
      setPreco("");
      edicao.marcarSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function atualizar(p: ProdutoCrm, patch: Partial<Pick<ProdutoCrm, "nome" | "precoBase" | "oculto" | "serviceKey">>) {
    setErro(null);
    const res = await fetch(`/api/crm/produtos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) { setErro(data.error ?? "Falha ao atualizar."); return; }
    setProdutos((prev) => prev.map((x) => (x.id === p.id ? (data.produto as ProdutoCrm) : x)));
  }

  if (loading) return <Loading>Carregando produtos…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <form onSubmit={criar} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:p-4 card">
        <Campo className="flex-1" label="Novo produto ou serviço">
          <input
            className="field-input"
            value={nome}
            onChange={(e) => {
              edicao.marcarEditado();
              setNome(e.target.value);
            }}
            placeholder="Ex.: Projeto de subestação"
          />
        </Campo>
        <Campo className="sm:w-40" label="Preço base (R$)">
          <input
            className="field-input"
            inputMode="decimal"
            value={preco}
            onChange={(e) => {
              edicao.marcarEditado();
              setPreco(e.target.value);
            }}
            placeholder="0,00"
          />
        </Campo>
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={salvando || nome.trim().length < 2}>
          Adicionar
        </button>
      </form>

      {produtos.length === 0 ? (
        <EmptyState>Nenhum produto cadastrado ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 card dark:divide-slate-700">
          {produtos.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${p.oculto ? "opacity-60" : ""}`}>
              <input
                className="field-input min-w-[160px] flex-1 !border-transparent !py-1 hover:!border-slate-300 focus:!border-gta-indigo dark:hover:!border-slate-600"
                defaultValue={p.nome}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v.length >= 2 && v !== p.nome) void atualizar(p, { nome: v });
                }}
                aria-label="Nome do produto"
              />
              <input
                className="field-input w-32 !py-1 text-right"
                inputMode="decimal"
                defaultValue={p.precoBase > 0 ? formatBRL(p.precoBase).replace("R$ ", "") : ""}
                placeholder="0,00"
                onBlur={(e) => {
                  const v = parseNumber(e.target.value);
                  if (v !== p.precoBase) void atualizar(p, { precoBase: v });
                }}
                aria-label="Preço base"
              />
              {/* O elo com Operações: com ele, o pedido de proposta já nasce
                  sabendo qual configurador abrir e quanto tempo leva. */}
              <select
                className="field-input w-48 !py-1"
                value={p.serviceKey}
                aria-label={`Serviço da plataforma de ${p.nome}`}
                onChange={(e) => void atualizar(p, { serviceKey: e.target.value })}
              >
                <option value="">Sem serviço vinculado</option>
                {servicos.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {p.oculto && <Badge tone="slate">Oculto</Badge>}
              <button className="btn-link shrink-0 text-xs" onClick={() => void atualizar(p, { oculto: !p.oculto })}>
                {p.oculto ? "Reexibir" : "Ocultar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Produto não se exclui: oculte o que saiu de linha — as negociações antigas e os relatórios continuam valendo.</p>
      <p className="hint">
        O <strong>serviço vinculado</strong> liga o produto ao configurador de Operações: com ele preenchido, o pedido
        de proposta feito na negociação já nasce com o serviço certo e com a duração que indica quem pega e para quando.
      </p>
    </div>
  );
}
