"use client";

import { useEffect, useState } from "react";
import { Alert, EmptyState, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import type { ItemCatalogo } from "@/lib/crm/types";

/**
 * Editor dos catálogos simples do CRM (fontes, motivos de perda): a mesma tela
 * para os dois, parametrizada pelo endpoint — exatamente como a API.
 */
export function CatalogoConfig({ endpoint, chaveLista, chaveItem, singular, placeholder }: {
  endpoint: string;
  chaveLista: string;
  chaveItem: string;
  /** "fonte" / "motivo de perda" — entra nos rótulos e confirmações. */
  singular: string;
  placeholder: string;
}) {
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  useEffect(() => {
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => setItens((d[chaveLista] as ItemCatalogo[]) ?? []))
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, [endpoint, chaveLista]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (novoNome.trim().length < 2) { setErro("Mínimo de 2 caracteres."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setItens((prev) => [...prev, data[chaveItem] as ItemCatalogo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setNovoNome("");
      edicao.marcarSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function renomear(item: ItemCatalogo, nome: string) {
    if (nome.trim().length < 2 || nome === item.nome) return;
    setErro(null);
    const res = await fetch(`${endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome }),
    });
    const data = await res.json();
    if (!res.ok) { setErro(data.error ?? "Falha ao renomear."); return; }
    setItens((prev) => prev.map((x) => (x.id === item.id ? (data[chaveItem] as ItemCatalogo) : x)));
  }

  async function excluir(item: ItemCatalogo) {
    if (!window.confirm(`Excluir "${item.nome}"?`)) return;
    setErro(null);
    const res = await fetch(`${endpoint}/${item.id}`, { method: "DELETE" });
    if (res.ok) setItens((prev) => prev.filter((x) => x.id !== item.id));
    else {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ?? "Falha ao excluir.");
    }
  }

  if (loading) return <Loading>Carregando…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <form onSubmit={criar} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:p-4 card">
        <Campo className="flex-1" label={`Nova ${singular}`}>
          <input
            className="field-input"
            value={novoNome}
            onChange={(e) => {
              edicao.marcarEditado();
              setNovoNome(e.target.value);
            }}
            placeholder={placeholder}
          />
        </Campo>
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={salvando || novoNome.trim().length < 2}>
          Adicionar
        </button>
      </form>

      {itens.length === 0 ? (
        <EmptyState>Nada cadastrado ainda.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 card dark:divide-slate-700">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-3 py-2">
              {/* Renomear direto no campo — salva ao sair dele. */}
              <input
                className="field-input flex-1 !border-transparent !py-1 hover:!border-slate-300 focus:!border-gta-indigo dark:hover:!border-slate-600"
                defaultValue={item.nome}
                onBlur={(e) => void renomear(item, e.target.value.trim())}
                aria-label={`Nome da ${singular}`}
              />
              <button className="btn-link-danger shrink-0 text-xs" onClick={() => void excluir(item)}>Excluir</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
