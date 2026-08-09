"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, EmptyState, Loading, SectionCard } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { SEGMENTOS, UFS, cidadeUf, type Cliente } from "@/lib/clientes/types";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";

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

/**
 * `fichaBase` liga a linha a uma tela de detalhe, quando existe uma.
 *
 * O CRM passa `/crm/clientes`, e a linha vira link para `{fichaBase}/{id}` —
 * o hub do cliente (negociações, contatos, quanto já fechou). Sem a prop, o
 * nome é texto puro.
 *
 * É string, e não função `(c) => href`, de propósito: quem monta esta lista é
 * uma página de SERVIDOR, e função não atravessa a fronteira servidor→cliente
 * — o Next recusa a serialização e a página cai com erro 500.
 */
export function ClientesList({ fichaBase }: { fichaBase?: string } = {}) {
  const hrefFicha = fichaBase ? (c: Cliente) => `${fichaBase}/${c.id}` : undefined;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [fSegmento, setFSegmento] = useState("");

  // Formulário: null = fechado; "novo" = criando; string(id) = editando.
  const [editando, setEditando] = useState<null | "novo" | string>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  /** Cadastro em andamento — ver `useEdicaoPendente`. */
  const edicao = useEdicaoPendente();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };

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
    // Fechar o formulário encerra a edição — por salvamento ou por desistência.
    edicao.marcarSalvo();
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

  if (loading) return <Loading>Carregando clientes…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Barra de ações + filtros */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Campo className="flex-1 sm:min-w-[220px]" label="Buscar nome / documento / cidade">
          <input className="field-input" placeholder="Digite para filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
        <Campo className="min-w-[160px]" label="Segmento">
          <select className="field-input" value={fSegmento} onChange={(e) => setFSegmento(e.target.value)}>
            <option value="">Todos</option>
            {segmentosComClientes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Campo>
        {editando === null && (
          <button className="btn-primary whitespace-nowrap" onClick={abrirNovo}>+ Novo cliente</button>
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
                <Campo className="sm:col-span-4" label="Nome / Razão social *">
                  <input className="field-input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required placeholder="Ex.: Fazenda Rio Doce Ltda" />
                </Campo>
                <Campo className="sm:col-span-2" label="Tipo">
                  <select className="field-input" value={form.tipoPessoa} onChange={(e) => set("tipoPessoa", e.target.value as "PF" | "PJ")}>
                    <option value="PJ">Pessoa jurídica</option>
                    <option value="PF">Pessoa física</option>
                  </select>
                </Campo>
                <Campo className="sm:col-span-3" label={<>{form.tipoPessoa === "PF" ? "CPF" : "CNPJ"}</>}>
                  <input className="field-input" value={form.documento} onChange={(e) => set("documento", e.target.value)} placeholder={form.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"} />
                </Campo>
                <Campo className="sm:col-span-3" label="Segmento">
                  <select className="field-input" value={form.segmento} onChange={(e) => set("segmento", e.target.value)}>
                    <option value="">—</option>
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Campo>
              </div>
            </div>

            {/* Contato */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contato</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <Campo className="sm:col-span-2" label="Nome do contato">
                  <input className="field-input" value={form.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} placeholder="Ex.: João (responsável)" />
                </Campo>
                <Campo className="sm:col-span-2" label="Telefone / WhatsApp">
                  <input className="field-input" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(62) 99999-9999" />
                </Campo>
                <Campo className="sm:col-span-2" label="E-mail">
                  <input type="email" className="field-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" />
                </Campo>
              </div>
            </div>

            {/* Endereço */}
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Endereço</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <Campo className="sm:col-span-2" label="CEP">
                  <input className="field-input" value={form.cep} onChange={(e) => set("cep", e.target.value)} placeholder="00000-000" />
                </Campo>
                <Campo className="sm:col-span-3" label="Logradouro">
                  <input className="field-input" value={form.logradouro} onChange={(e) => set("logradouro", e.target.value)} placeholder="Rua / Av." />
                </Campo>
                <Campo className="sm:col-span-1" label="Número">
                  <input className="field-input" value={form.numero} onChange={(e) => set("numero", e.target.value)} />
                </Campo>
                <Campo className="sm:col-span-2" label="Bairro">
                  <input className="field-input" value={form.bairro} onChange={(e) => set("bairro", e.target.value)} />
                </Campo>
                <Campo className="sm:col-span-3" label="Cidade">
                  <input className="field-input" value={form.cidade} onChange={(e) => set("cidade", e.target.value)} placeholder="Ex.: Anápolis" />
                </Campo>
                <Campo className="sm:col-span-1" label="UF">
                  <select className="field-input" value={form.uf} onChange={(e) => set("uf", e.target.value)}>
                    <option value="">—</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
              </div>
            </div>

            {/* Observações */}
            <Campo label="Observações">
              <textarea className="field-input min-h-[70px]" value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Notas internas sobre o cliente…" />
            </Campo>

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
                <div className="truncate font-medium text-gta-navy dark:text-slate-100">
                  {hrefFicha ? <Link href={hrefFicha(c)} className="hover:underline">{c.nome}</Link> : c.nome}
                </div>
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
                <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">
                  {hrefFicha ? (
                    <Link href={hrefFicha(c)} className="hover:underline">{c.nome}</Link>
                  ) : (
                    c.nome
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{c.documento || "—"}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{cidadeUf(c) || "—"}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                  <div className="flex flex-col">
                    {c.telefone && <span>{c.telefone}</span>}
                    {c.email && <span className="hint">{c.email}</span>}
                    {!c.telefone && !c.email && "—"}
                  </div>
                </td>
                {/* Texto, não <Badge>: são 7 segmentos e a pílula saía índigo em
                    TODOS, então a cor não distinguia Rural de Industrial — só
                    pintava a coluna inteira. O cabeçalho já diz o que é o valor,
                    como em Cidade/UF ao lado. No cartão do celular a pílula fica,
                    porque lá ela aparece uma vez por cartão, não em coluna. */}
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.segmento || <span className="sem-valor">—</span>}</td>
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
