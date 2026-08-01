"use client";

import { useEffect, useState } from "react";
import { PERMISSOES, PERMISSOES_POR_MODULO, type PermissaoKey } from "@/lib/rbac/permissoes";
import type { Cargo } from "@/lib/cargos/types";
import { Alert, EmptyState, Loading } from "@/components/ui";

/** Checkboxes de permissão agrupadas por módulo. */
function PermissoesEditor({
  selecionadas,
  onToggle,
  idPrefix,
}: {
  selecionadas: Set<PermissaoKey>;
  onToggle: (chave: PermissaoKey, ativo: boolean) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {PERMISSOES_POR_MODULO.map((grupo) => (
        <div key={grupo.modulo}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {grupo.modulo}
          </div>
          <div className="space-y-1.5">
            {grupo.chaves.map((chave) => {
              const id = `${idPrefix}-${chave}`;
              // `toque`: no celular a linha inteira vira alvo de 44px — o
              // quadradinho de 16px é pequeno demais para o dedo.
              return (
                <label key={chave} htmlFor={id} className="toque flex items-start gap-2 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-gta-indigo focus:ring-gta-indigo dark:border-slate-600 dark:bg-slate-700"
                    checked={selecionadas.has(chave)}
                    onChange={(e) => onToggle(chave, e.target.checked)}
                  />
                  <span className="text-slate-700 dark:text-slate-200">{PERMISSOES[chave]}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Cartão de um cargo existente — editar nome/permissões, salvar ou excluir. */
function CargoCard({
  cargo,
  onSalvar,
  onExcluir,
}: {
  cargo: Cargo;
  onSalvar: (id: string, nome: string, permissoes: PermissaoKey[]) => Promise<void>;
  onExcluir: (cargo: Cargo) => void;
}) {
  const [nome, setNome] = useState(cargo.nome);
  const [sel, setSel] = useState<Set<PermissaoKey>>(new Set(cargo.permissoes));
  const [salvando, setSalvando] = useState(false);

  const alterado =
    nome.trim() !== cargo.nome ||
    sel.size !== cargo.permissoes.length ||
    cargo.permissoes.some((p) => !sel.has(p));

  function toggle(chave: PermissaoKey, ativo: boolean) {
    setSel((prev) => {
      const next = new Set(prev);
      if (ativo) next.add(chave);
      else next.delete(chave);
      return next;
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar(cargo.id, nome.trim(), Array.from(sel));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="field-input max-w-xs font-semibold"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome do cargo"
        />
        <span className="hint">{sel.size} permissão(ões)</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-primary !py-1.5 text-xs" disabled={!alterado || !nome.trim() || salvando} onClick={salvar}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button className="btn-danger !py-1.5 text-xs" onClick={() => onExcluir(cargo)}>
            Excluir
          </button>
        </div>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
        <PermissoesEditor selecionadas={sel} onToggle={toggle} idPrefix={cargo.id} />
      </div>
    </div>
  );
}

export function CargosAdmin() {
  const [lista, setLista] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [novoAberto, setNovoAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoSel, setNovoSel] = useState<Set<PermissaoKey>>(new Set());
  const [criando, setCriando] = useState(false);

  async function carregar() {
    try {
      const res = await fetch("/api/admin/cargos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao carregar cargos.");
      setLista(data.cargos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCriando(true);
    try {
      const res = await fetch("/api/admin/cargos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim(), permissoes: Array.from(novoSel) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar cargo.");
      setLista((prev) => [...prev, data.cargo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setNovoNome("");
      setNovoSel(new Set());
      setNovoAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setCriando(false);
    }
  }

  async function salvar(id: string, nome: string, permissoes: PermissaoKey[]) {
    setErro(null);
    const res = await fetch(`/api/admin/cargos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, permissoes }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErro(data.error ?? "Falha ao salvar.");
      return;
    }
    setLista((prev) => prev.map((c) => (c.id === id ? data.cargo : c)));
  }

  async function excluir(cargo: Cargo) {
    if (!window.confirm(`Excluir o cargo "${cargo.nome}"?`)) return;
    setErro(null);
    const res = await fetch(`/api/admin/cargos/${cargo.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? "Falha ao excluir.");
      return;
    }
    setLista((prev) => prev.filter((c) => c.id !== cargo.id));
  }

  function toggleNovo(chave: PermissaoKey, ativo: boolean) {
    setNovoSel((prev) => {
      const next = new Set(prev);
      if (ativo) next.add(chave);
      else next.delete(chave);
      return next;
    });
  }

  if (loading) return <Loading>Carregando cargos…</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => setNovoAberto((v) => !v)}>
          {novoAberto ? "Fechar" : "+ Novo cargo"}
        </button>
        <span className="ml-auto hint">{lista.length} cargo(s)</span>
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}

      {novoAberto && (
        <form onSubmit={criar} className="section-card-destaque">
          <h2 className="section-title mb-4">Novo cargo</h2>
          <div className="mb-4">
            <label className="field-label">Nome do cargo *</label>
            <input
              className="field-input max-w-xs"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: Operacional, Comercial"
              required
            />
          </div>
          <PermissoesEditor selecionadas={novoSel} onToggle={toggleNovo} idPrefix="novo" />
          <div className="mt-4">
            <button type="submit" className="btn-primary" disabled={criando || !novoNome.trim()}>
              {criando ? "Criando…" : "Criar cargo"}
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <EmptyState>Nenhum cargo cadastrado. Crie o primeiro para atribuir aos usuários.</EmptyState>
      ) : (
        <div className="space-y-3">
          {lista.map((cargo) => (
            <CargoCard key={cargo.id} cargo={cargo} onSalvar={salvar} onExcluir={excluir} />
          ))}
        </div>
      )}
    </div>
  );
}
