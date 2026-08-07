"use client";

import { useEffect, useState } from "react";
import { Alert, Loading, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { MAX_ETAPAS, type Funil } from "@/lib/crm/types";

/**
 * Editor de funis e etapas. A edição das etapas acontece numa cópia local e só
 * vai ao servidor no "Salvar etapas" — mover/renomear/remover em sequência é
 * uma decisão só, não três chamadas.
 */
export function FunisConfig() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");

  useEffect(() => {
    fetch("/api/crm/funis")
      .then((r) => r.json())
      .then((d) => setFunis(d.funis ?? []))
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  async function criarFunil(e: React.FormEvent) {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setErro(null);
    const res = await fetch("/api/crm/funis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novoNome, etapas: [{ nome: "Sem contato" }, { nome: "Contato feito" }, { nome: "Fechamento" }] }),
    });
    const data = await res.json();
    if (!res.ok) { setErro(data.error ?? "Falha ao criar."); return; }
    setFunis((prev) => [...prev, data.funil as Funil]);
    setNovoNome("");
  }

  async function excluirFunil(f: Funil) {
    if (!window.confirm(`Excluir o funil "${f.nome}"?`)) return;
    setErro(null);
    const res = await fetch(`/api/crm/funis/${f.id}`, { method: "DELETE" });
    if (res.ok) setFunis((prev) => prev.filter((x) => x.id !== f.id));
    else {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ?? "Falha ao excluir.");
    }
  }

  if (loading) return <Loading>Carregando funis…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <form onSubmit={criarFunil} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end sm:p-4 card">
        <Campo className="flex-1" label="Novo funil">
          <input className="field-input" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Funil de assinatura de energia" />
        </Campo>
        <button type="submit" className="btn-primary whitespace-nowrap" disabled={!novoNome.trim()}>Criar funil</button>
      </form>

      {funis.map((f) => (
        <EditorFunil
          key={f.id}
          funil={f}
          podeExcluir={funis.length > 1}
          onSalvo={(novo) => setFunis((prev) => prev.map((x) => (x.id === novo.id ? novo : x)))}
          onExcluir={() => void excluirFunil(f)}
          onErro={setErro}
        />
      ))}
    </div>
  );
}

function EditorFunil({ funil, podeExcluir, onSalvo, onExcluir, onErro }: {
  funil: Funil;
  podeExcluir: boolean;
  onSalvo: (f: Funil) => void;
  onExcluir: () => void;
  onErro: (e: string | null) => void;
}) {
  const [nome, setNome] = useState(funil.nome);
  // Etapa nova ainda sem id — o servidor batiza ao salvar.
  const [etapas, setEtapas] = useState<{ id?: string; nome: string }[]>(funil.etapas);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  const editar = (fn: (prev: { id?: string; nome: string }[]) => { id?: string; nome: string }[]) => {
    setSujo(true);
    edicao.marcarEditado();
    setEtapas(fn);
  };

  function mover(i: number, delta: -1 | 1) {
    editar((prev) => {
      const j = i + delta;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function salvar() {
    onErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/crm/funis/${funil.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, etapas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      onSalvo(data.funil as Funil);
      setEtapas((data.funil as Funil).etapas);
      setSujo(false);
      edicao.marcarSalvo();
    } catch (err) {
      onErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SectionCard
      title={
        <input
          className="field-input !border-transparent !py-1 font-semibold hover:!border-slate-300 focus:!border-gta-indigo dark:hover:!border-slate-600"
          value={nome}
          onChange={(e) => { setNome(e.target.value); setSujo(true); edicao.marcarEditado(); }}
          aria-label="Nome do funil"
        />
      }
      actions={
        <div className="flex items-center gap-2">
          {sujo && (
            <button className="btn-primary !py-1.5 text-sm" disabled={salvando} onClick={() => void salvar()}>
              {salvando ? "Salvando…" : "Salvar etapas"}
            </button>
          )}
          {podeExcluir && <button className="btn-link-danger text-xs" onClick={onExcluir}>Excluir funil</button>}
        </div>
      }
    >
      <ol className="space-y-2">
        {etapas.map((e, i) => (
          <li key={e.id ?? `nova-${i}`} className="flex items-center gap-2">
            <span className="hint w-5 shrink-0 text-right">{i + 1}.</span>
            <input
              className="field-input flex-1 !py-1"
              value={e.nome}
              onChange={(ev) => editar((prev) => prev.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)))}
              aria-label={`Nome da etapa ${i + 1}`}
            />
            <button type="button" className="icon-btn" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir etapa">↑</button>
            <button type="button" className="icon-btn" onClick={() => mover(i, 1)} disabled={i === etapas.length - 1} aria-label="Descer etapa">↓</button>
            <button
              type="button"
              className="btn-link-danger shrink-0 text-xs"
              onClick={() => editar((prev) => prev.filter((_, j) => j !== i))}
              disabled={etapas.length <= 1}
            >
              Remover
            </button>
          </li>
        ))}
      </ol>
      {etapas.length < MAX_ETAPAS && (
        <button
          type="button"
          className="btn-secondary mt-3 !py-1.5 text-sm"
          onClick={() => editar((prev) => [...prev, { nome: `Etapa ${prev.length + 1}` }])}
        >
          + Adicionar etapa
        </button>
      )}
      <p className="hint mt-2">Até {MAX_ETAPAS} etapas. Etapa com negociações não pode ser removida — mova-as antes.</p>
    </SectionCard>
  );
}
