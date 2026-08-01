"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, Loading, SectionCard } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { SEGMENTOS, UFS, cidadeUf, type Cliente } from "@/lib/clientes/types";

type FormState = {
  nome: string;
  tipoPessoa: "PF" | "PJ";
  documento: string;
  contatoNome: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  segmento: string;
  observacoes: string;
};

const FORM_VAZIO: FormState = {
  nome: "", tipoPessoa: "PJ", documento: "", contatoNome: "", telefone: "", email: "",
  cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "", segmento: "", observacoes: "",
};

function paraForm(c: Cliente): FormState {
  return {
    nome: c.nome, tipoPessoa: c.tipoPessoa, documento: c.documento, contatoNome: c.contatoNome,
    telefone: c.telefone, email: c.email, cep: c.cep, logradouro: c.logradouro, numero: c.numero,
    bairro: c.bairro, cidade: c.cidade, uf: c.uf, segmento: c.segmento, observacoes: c.observacoes,
  };
}

export function ClientesList({ isAdmin = false }: { isAdmin?: boolean }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const [busca, setBusca] = useState("");
  const [fSegmento, setFSegmento] = useState("");

  // Formulário: null = fechado; "novo" = criando; string(id) = editando.
  const [editando, setEditando] = useState<null | "novo" | string>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((d) => setClientes(d.clientes ?? []))
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  const segmentosComClientes = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.segmento).filter(Boolean))).sort(),
    [clientes],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (fSegmento && c.segmento !== fSegmento) return false;
      if (q) {
        const alvo = `${c.nome} ${c.documento} ${c.cidade} ${c.contatoNome}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [clientes, busca, fSegmento]);

  const { paginados, controles } = usePaginacao(filtrados);

  function abrirNovo() {
    setErro(null);
    setForm(FORM_VAZIO);
    setEditando("novo");
  }
  function abrirEdicao(c: Cliente) {
    setErro(null);
    setForm(paraForm(c));
    setEditando(c.id);
  }
  function fecharForm() {
    setEditando(null);
    setForm(FORM_VAZIO);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Informe o nome do cliente."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const criando = editando === "novo";
      const url = criando ? "/api/clientes" : `/api/clientes/${editando}`;
      const res = await fetch(url, {
        method: criando ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const salvo = data.cliente as Cliente;
      setClientes((prev) => (criando ? [...prev, salvo] : prev.map((c) => (c.id === salvo.id ? salvo : c))));
      fecharForm();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Cliente) {
    if (!window.confirm(`Excluir o cliente "${c.nome}"?`)) return;
    const res = await fetch(`/api/clientes/${c.id}`, { method: "DELETE" });
    if (res.ok) setClientes((prev) => prev.filter((x) => x.id !== c.id));
    else setErro("Falha ao excluir.");
  }

  async function importar() {
    if (!window.confirm("Importar os clientes da pasta Serviços? Quem já existe (mesmo nome) é ignorado.")) return;
    setErro(null);
    setAviso(null);
    setImportando(true);
    try {
      const res = await fetch("/api/clientes/importar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao importar.");
      setAviso(`Importação concluída: ${data.criados} criado(s), ${data.ignorados} já existente(s).`);
      const lista = await fetch("/api/clientes").then((r) => r.json());
      setClientes(lista.clientes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao importar.");
    } finally {
      setImportando(false);
    }
  }

  async function atualizarDosServicos() {
    if (!window.confirm("Atualizar clientes com dados da pasta Serviços? Só preenche campos vazios dos já cadastrados (nunca sobrescreve o que já está preenchido) e cria os que ainda não existem.")) return;
    setErro(null);
    setAviso(null);
    setAtualizando(true);
    try {
      const res = await fetch("/api/clientes/atualizar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao atualizar.");
      setAviso(`Atualização concluída: ${data.criados} criado(s), ${data.atualizados} atualizado(s), ${data.semMudanca} sem mudança.`);
      const lista = await fetch("/api/clientes").then((r) => r.json());
      setClientes(lista.clientes ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao atualizar.");
    } finally {
      setAtualizando(false);
    }
  }

  if (loading) return <Loading>Carregando clientes…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}
      {aviso && <Alert tone="green">{aviso}</Alert>}

      {/* Barra de ações + filtros */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <div className="flex-1 sm:min-w-[220px]">
          <label className="field-label">Buscar nome / documento / cidade</label>
          <input className="field-input" placeholder="Digite para filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="min-w-[160px]">
          <label className="field-label">Segmento</label>
          <select className="field-input" value={fSegmento} onChange={(e) => setFSegmento(e.target.value)}>
            <option value="">Todos</option>
            {segmentosComClientes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {editando === null && (
          <div className="flex gap-2">
            {isAdmin && (
              <button className="btn-secondary whitespace-nowrap" onClick={importar} disabled={importando} title="Cria os clientes extraídos da pasta Serviços (não duplica os já cadastrados)">
                {importando ? "Importando…" : "Importar dos Serviços"}
              </button>
            )}
            {isAdmin && (
              <button className="btn-secondary whitespace-nowrap" onClick={atualizarDosServicos} disabled={atualizando} title="Preenche campos vazios (CNPJ, endereço...) dos clientes já cadastrados com dados da pasta Serviços; cria os que faltam. Nunca sobrescreve o que já está preenchido.">
                {atualizando ? "Atualizando…" : "Atualizar dados dos Serviços"}
              </button>
            )}
            <button className="btn-primary whitespace-nowrap" onClick={abrirNovo}>+ Novo cliente</button>
          </div>
        )}
      </div>

      {/* Formulário de cadastro/edição */}
      {editando !== null && (
        <SectionCard
          title={editando === "novo" ? "Novo cliente" : "Editar cliente"}
          actions={<button type="button" className="btn-secondary !py-2 text-sm" onClick={fecharForm}>Cancelar</button>}
        >
          <form onSubmit={salvar} className="space-y-5">
            {/* Identificação */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Identificação</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-4">
                  <label className="field-label">Nome / Razão social *</label>
                  <input className="field-input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required placeholder="Ex.: Fazenda Rio Doce Ltda" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Tipo</label>
                  <select className="field-input" value={form.tipoPessoa} onChange={(e) => set("tipoPessoa", e.target.value as "PF" | "PJ")}>
                    <option value="PJ">Pessoa jurídica</option>
                    <option value="PF">Pessoa física</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="field-label">{form.tipoPessoa === "PF" ? "CPF" : "CNPJ"}</label>
                  <input className="field-input" value={form.documento} onChange={(e) => set("documento", e.target.value)} placeholder={form.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
                </div>
                <div className="sm:col-span-3">
                  <label className="field-label">Segmento</label>
                  <select className="field-input" value={form.segmento} onChange={(e) => set("segmento", e.target.value)}>
                    <option value="">—</option>
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Contato */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contato</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <label className="field-label">Nome do contato</label>
                  <input className="field-input" value={form.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} placeholder="Ex.: João (responsável)" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Telefone / WhatsApp</label>
                  <input className="field-input" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(62) 99999-9999" />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">E-mail</label>
                  <input type="email" className="field-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Endereço</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <label className="field-label">CEP</label>
                  <input className="field-input" value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
                </div>
                <div className="sm:col-span-3">
                  <label className="field-label">Logradouro</label>
                  <input className="field-input" value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} placeholder="Rua / Av." />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label">Número</label>
                  <input className="field-input" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">Bairro</label>
                  <input className="field-input" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <label className="field-label">Cidade</label>
                  <input className="field-input" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Ex.: Anápolis" />
                </div>
                <div className="sm:col-span-1">
                  <label className="field-label">UF</label>
                  <select className="field-input" value={form.uf} onChange={(e) => set("uf", e.target.value)}>
                    <option value="">—</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="field-label">Observações</label>
              <textarea className="field-input min-h-[70px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Notas internas sobre o cliente…" />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando…" : editando === "novo" ? "Cadastrar cliente" : "Salvar alterações"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <div className="subtitle">
        {filtrados.length} de {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
      </div>

      {/* Cartões (mobile) */}
      <div className="space-y-3 md:hidden">
        {filtrados.length === 0 && (
          <EmptyState>{clientes.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente corresponde aos filtros."}</EmptyState>
        )}
        {paginados.map((c) => (
          <div key={c.id} className="p-3 card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-gta-navy dark:text-slate-100">{c.nome}</div>
                <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{cidadeUf(c) || "—"}</div>
              </div>
              {c.segmento && <Badge tone="indigo" className="shrink-0">{c.segmento}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {c.documento && <span className="font-mono">{c.documento}</span>}
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
              <th>Nome / Razão social</th>
              <th>Documento</th>
              <th>Cidade/UF</th>
              <th>Contato</th>
              <th>Segmento</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  {clientes.length === 0 ? "Nenhum cliente cadastrado ainda." : "Nenhum cliente corresponde aos filtros."}
                </td>
              </tr>
            )}
            {paginados.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">{c.nome}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{c.documento || "—"}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{cidadeUf(c) || "—"}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  <div className="flex flex-col">
                    {c.telefone && <span>{c.telefone}</span>}
                    {c.email && <span className="hint">{c.email}</span>}
                    {!c.telefone && !c.email && "—"}
                  </div>
                </td>
                <td className="px-4 py-2">{c.segmento ? <Badge tone="indigo">{c.segmento}</Badge> : <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap text-xs">
                    <button onClick={() => abrirEdicao(c)} className="text-gta-indigo hover:underline">Editar</button>
                    <button onClick={() => excluir(c)} className="text-red-500 hover:underline dark:text-red-400">Excluir</button>
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
