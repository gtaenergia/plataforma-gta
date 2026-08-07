"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, EmptyState, Loading, SectionCard } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import type { Cliente } from "@/lib/clientes/types";
import type { Contato } from "@/lib/crm/types";

type FormState = {
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  empresaId: string;
  observacoes: string;
};

const FORM_VAZIO: FormState = { nome: "", cargo: "", email: "", telefone: "", empresaId: "", observacoes: "" };

function paraForm(c: Contato): FormState {
  return { nome: c.nome, cargo: c.cargo, email: c.email, telefone: c.telefone, empresaId: c.empresaId, observacoes: c.observacoes };
}

export function ContatosList() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");

  const [editando, setEditando] = useState<null | "novo" | string>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/contatos").then((r) => r.json()),
      fetch("/api/clientes").then((r) => r.json()),
    ])
      .then(([ct, c]) => {
        setContatos(ct.contatos ?? []);
        setClientes(c.clientes ?? []);
      })
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  const empresasComContatos = useMemo(
    () => Array.from(new Set(contatos.map((c) => c.empresaNome).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [contatos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      if (fEmpresa && c.empresaNome !== fEmpresa) return false;
      if (q && !`${c.nome} ${c.cargo} ${c.email} ${c.telefone} ${c.empresaNome}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [contatos, busca, fEmpresa]);

  const { paginados, controles } = usePaginacao(filtrados);

  function abrirNovo() {
    setErro(null);
    setForm(FORM_VAZIO);
    setEditando("novo");
  }
  function abrirEdicao(c: Contato) {
    setErro(null);
    setForm(paraForm(c));
    setEditando(c.id);
  }
  function fecharForm() {
    edicao.marcarSalvo();
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Informe o nome do contato."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const empresa = clientes.find((c) => c.id === form.empresaId);
      const criando = editando === "novo";
      const res = await fetch(criando ? "/api/crm/contatos" : `/api/crm/contatos/${editando}`, {
        method: criando ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, empresaId: empresa?.id ?? "", empresaNome: empresa?.nome ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const salvo = data.contato as Contato;
      setContatos((prev) => (criando ? [...prev, salvo] : prev.map((c) => (c.id === salvo.id ? salvo : c))));
      fecharForm();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Contato) {
    if (!window.confirm(`Excluir o contato "${c.nome}"?`)) return;
    const res = await fetch(`/api/crm/contatos/${c.id}`, { method: "DELETE" });
    if (res.ok) setContatos((prev) => prev.filter((x) => x.id !== c.id));
    else setErro("Falha ao excluir.");
  }

  if (loading) return <Loading>Carregando contatos…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Campo className="flex-1 sm:min-w-[220px]" label="Buscar nome / e-mail / telefone">
          <input className="field-input" placeholder="Digite para filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
        <Campo className="min-w-[180px]" label="Empresa">
          <select className="field-input" value={fEmpresa} onChange={(e) => setFEmpresa(e.target.value)}>
            <option value="">Todas</option>
            {empresasComContatos.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Campo>
        {editando === null && <button className="btn-primary whitespace-nowrap" onClick={abrirNovo}>+ Novo contato</button>}
      </div>

      {editando !== null && (
        <SectionCard
          title={editando === "novo" ? "Novo contato" : "Editar contato"}
          actions={<button type="button" className="btn-secondary !py-2 text-sm" onClick={fecharForm}>Cancelar</button>}
        >
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <Campo className="sm:col-span-3" label="Nome *">
                <input className="field-input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required placeholder="Ex.: João Pereira" />
              </Campo>
              <Campo className="sm:col-span-3" label="Cargo">
                <input className="field-input" value={form.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Ex.: Gerente de manutenção" />
              </Campo>
              <Campo className="sm:col-span-2" label="E-mail">
                <input type="email" className="field-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="contato@email.com" />
              </Campo>
              <Campo className="sm:col-span-2" label="Telefone / WhatsApp">
                <input className="field-input" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(62) 99999-9999" />
              </Campo>
              <Campo className="sm:col-span-2" label="Empresa">
                <select className="field-input" value={form.empresaId} onChange={(e) => set("empresaId", e.target.value)}>
                  <option value="">—</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Observações">
              <textarea className="field-input min-h-[70px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Notas internas sobre o contato…" />
            </Campo>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando…" : editando === "novo" ? "Cadastrar contato" : "Salvar alterações"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <div className="subtitle">
        {filtrados.length} de {contatos.length} {contatos.length === 1 ? "contato" : "contatos"}
      </div>

      {/* Cartões (mobile) */}
      <div className="space-y-3 md:hidden">
        {filtrados.length === 0 && (
          <EmptyState>{contatos.length === 0 ? "Nenhum contato cadastrado ainda." : "Nenhum contato corresponde aos filtros."}</EmptyState>
        )}
        {paginados.map((c) => (
          <div key={c.id} className="p-3 card">
            <div className="min-w-0">
              <div className="truncate font-medium text-gta-navy dark:text-slate-100">{c.nome}</div>
              <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                {[c.cargo, c.empresaNome].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {c.telefone && <span>{c.telefone}</span>}
              {c.email && <span className="truncate">{c.email}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => abrirEdicao(c)} className="btn-secondary flex-1 justify-center !py-2 text-xs">Editar</button>
              <button onClick={() => excluir(c)} className="btn-danger flex-1 !py-2 text-xs">Excluir</button>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela (desktop) */}
      <div className="hidden overflow-x-auto md:block card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Empresa</th>
              <th>Contato</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  {contatos.length === 0 ? "Nenhum contato cadastrado ainda." : "Nenhum contato corresponde aos filtros."}
                </td>
              </tr>
            )}
            {paginados.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">{c.nome}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.cargo || <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.empresaNome || <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  <div className="flex flex-col">
                    {c.telefone && <span>{c.telefone}</span>}
                    {c.email && <span className="hint">{c.email}</span>}
                    {!c.telefone && !c.email && "—"}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <button onClick={() => abrirEdicao(c)} className="btn-link text-xs">Editar</button>
                    <button onClick={() => excluir(c)} className="btn-link-danger text-xs">Excluir</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginacao {...controles} />
    </div>
  );
}
