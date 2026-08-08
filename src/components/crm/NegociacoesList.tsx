"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, EmptyState, Loading, Marca, SectionCard } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { formatBRL, parseNumber } from "@/lib/format";
import type { Cliente } from "@/lib/clientes/types";
import {
  SITUACAO_LABEL,
  SITUACAO_TONE,
  valorDaNegociacao,
  type Funil,
  type ItemCatalogo,
  type Negociacao,
  type SituacaoNegociacao,
} from "@/lib/crm/types";
import { dataCurta } from "./util";

type FormState = {
  nome: string;
  funilId: string;
  etapaId: string;
  valor: string;
  empresaId: string;
  responsavel: string;
  fonteId: string;
  previsao: string;
};

const FORM_VAZIO: FormState = {
  nome: "", funilId: "", etapaId: "", valor: "", empresaId: "", responsavel: "", fonteId: "", previsao: "",
};

interface UsuarioOpcao {
  email: string;
  name: string;
}

/**
 * `usuarioAtual` (e-mail) vem do servidor, e não de um `fetch`: é o que deixa o
 * campo Responsável já vir com o SEU nome. A versão anterior oferecia uma opção
 * "Eu mesmo" além da lista de pessoas — e como você também está na lista,
 * apareciam duas entradas para a mesma pessoa.
 */
export function NegociacoesList({ usuarioAtual }: { usuarioAtual: string }) {
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOpcao[]>([]);
  const [fontes, setFontes] = useState<ItemCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [fFunil, setFFunil] = useState("");
  const [fSituacao, setFSituacao] = useState("");

  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/negociacoes").then((r) => r.json()),
      fetch("/api/crm/funis").then((r) => r.json()),
      fetch("/api/clientes").then((r) => r.json()),
      fetch("/api/usuarios").then((r) => r.json()),
      fetch("/api/crm/fontes").then((r) => r.json()),
    ])
      .then(([n, f, c, u, fo]) => {
        setNegociacoes(n.negociacoes ?? []);
        setFunis(f.funis ?? []);
        setClientes(c.clientes ?? []);
        setUsuarios(u.usuarios ?? []);
        setFontes(fo.fontes ?? []);
      })
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  /**
   * O botão "+ Nova negociação" do quadro chega aqui com #novo na URL.
   *
   * O pedido fica GUARDADO e só abre o formulário quando os funis chegarem:
   * abrir na hora deixava funil/etapa com valor "" — o seletor MOSTRAVA a
   * primeira opção (comportamento do <select> sem opção vazia), mas o envio ia
   * vazio e o servidor recusava com "Dados inválidos". Era o "não consigo
   * criar" em pessoa: o erro não apontava campo nenhum, porque na tela os
   * campos pareciam preenchidos.
   */
  const [pediuNovo, setPediuNovo] = useState(false);
  useEffect(() => {
    const olharHash = () => {
      if (window.location.hash === "#novo") setPediuNovo(true);
    };
    olharHash();
    // `hashchange`: quem JÁ está em /crm/negociacoes e clica no botão do
    // quadro não remonta o componente — sem o listener, nada acontecia.
    window.addEventListener("hashchange", olharHash);
    return () => window.removeEventListener("hashchange", olharHash);
  }, []);
  useEffect(() => {
    if (pediuNovo && funis.length > 0) {
      abrirNovo();
      setPediuNovo(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pediuNovo, funis]);

  const porId = useMemo(() => new Map(funis.map((f) => [f.id, f])), [funis]);
  const nomeEtapa = (n: Negociacao) => porId.get(n.funilId)?.etapas.find((e) => e.id === n.etapaId)?.nome ?? "—";

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return negociacoes.filter((n) => {
      if (fFunil && n.funilId !== fFunil) return false;
      if (fSituacao && n.situacao !== fSituacao) return false;
      if (q && !`${n.nome} ${n.empresaNome} ${n.responsavelNome}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [negociacoes, busca, fFunil, fSituacao]);

  const { paginados, controles } = usePaginacao(filtradas);

  function abrirNovo() {
    setErro(null);
    const primeiro = funis[0];
    setForm({ ...FORM_VAZIO, funilId: primeiro?.id ?? "", etapaId: primeiro?.etapas[0]?.id ?? "" });
    setCriando(true);
  }
  function fecharForm() {
    edicao.marcarSalvo();
    setCriando(false);
    setForm(FORM_VAZIO);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro("Informe o nome da negociação."); return; }
    // Última linha de defesa do caso acima: se algum caminho novo abrir o
    // formulário sem inicializar, o erro nomeia o campo em vez de "Dados inválidos".
    if (!form.funilId || !form.etapaId) { setErro("Escolha o funil e a etapa."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const empresa = clientes.find((c) => c.id === form.empresaId);
      // O mesmo `|| usuarioAtual` do campo: sem isso, criar sem tocar no
      // seletor mandaria responsável vazio.
      const usuario = usuarios.find((u) => u.email === (form.responsavel || usuarioAtual));
      const fonte = fontes.find((f) => f.id === form.fonteId);
      const res = await fetch("/api/crm/negociacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          funilId: form.funilId,
          etapaId: form.etapaId,
          valor: parseNumber(form.valor),
          empresaId: empresa?.id ?? "",
          empresaNome: empresa?.nome ?? "",
          responsavel: usuario?.email ?? "",
          responsavelNome: usuario?.name ?? "",
          fonteId: fonte?.id ?? "",
          fonteNome: fonte?.nome ?? "",
          previsao: form.previsao,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setNegociacoes((prev) => [data.negociacao as Negociacao, ...prev]);
      fecharForm();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading) return <Loading>Carregando negociações…</Loading>;

  const funilDoForm = porId.get(form.funilId);

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Barra de ações + filtros */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Campo className="flex-1 sm:min-w-[220px]" label="Buscar nome / empresa / responsável">
          <input className="field-input" placeholder="Digite para filtrar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </Campo>
        {funis.length > 1 && (
          <Campo className="min-w-[160px]" label="Funil">
            <select className="field-input" value={fFunil} onChange={(e) => setFFunil(e.target.value)}>
              <option value="">Todos</option>
              {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo className="min-w-[150px]" label="Situação">
          <select className="field-input" value={fSituacao} onChange={(e) => setFSituacao(e.target.value)}>
            <option value="">Todas</option>
            {(Object.keys(SITUACAO_LABEL) as SituacaoNegociacao[]).map((s) => (
              <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>
            ))}
          </select>
        </Campo>
        {!criando && <button className="btn-primary whitespace-nowrap" onClick={abrirNovo}>+ Nova negociação</button>}
      </div>

      {/* Criação — a edição completa mora na ficha da negociação */}
      {criando && (
        <SectionCard
          title="Nova negociação"
          actions={<button type="button" className="btn-secondary !py-2 text-sm" onClick={fecharForm}>Cancelar</button>}
        >
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <Campo className="sm:col-span-4" label="Nome da negociação *">
                <input className="field-input" value={form.nome} onChange={(e) => set("nome", e.target.value)} required placeholder="Ex.: Subestação 500 kVA — Fazenda Rio Doce" />
              </Campo>
              <Campo className="sm:col-span-2" label="Valor (R$)">
                <input className="field-input" inputMode="decimal" value={form.valor} onChange={(e) => set("valor", e.target.value)} placeholder="0,00" />
              </Campo>
              <Campo className="sm:col-span-2" label="Funil">
                <select
                  className="field-input"
                  value={form.funilId}
                  onChange={(e) => {
                    const f = porId.get(e.target.value);
                    setForm((prev) => ({ ...prev, funilId: e.target.value, etapaId: f?.etapas[0]?.id ?? "" }));
                    edicao.marcarEditado();
                  }}
                >
                  {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-2" label="Etapa">
                <select className="field-input" value={form.etapaId} onChange={(e) => set("etapaId", e.target.value)}>
                  {(funilDoForm?.etapas ?? []).map((et) => <option key={et.id} value={et.id}>{et.nome}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-2" label="Previsão de fechamento">
                <input type="date" className="field-input" value={form.previsao} onChange={(e) => set("previsao", e.target.value)} />
              </Campo>
              <Campo className="sm:col-span-2" label="Empresa">
                <select className="field-input" value={form.empresaId} onChange={(e) => set("empresaId", e.target.value)}>
                  <option value="">—</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-2" label="Responsável">
                {/* `|| usuarioAtual`: o campo abre em você mesmo sem depender de
                    quem abriu o formulário ter preenchido (o atalho `#novo` do
                    quadro não passa por `abrirNovo`). */}
                <select className="field-input" value={form.responsavel || usuarioAtual} onChange={(e) => set("responsavel", e.target.value)}>
                  {usuarios.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
                </select>
              </Campo>
              <Campo className="sm:col-span-2" label="Fonte">
                <select className="field-input" value={form.fonteId} onChange={(e) => set("fonteId", e.target.value)}>
                  <option value="">—</option>
                  {fontes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={fecharForm}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? "Salvando…" : "Criar negociação"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <div className="subtitle">
        {filtradas.length} de {negociacoes.length} {negociacoes.length === 1 ? "negociação" : "negociações"}
      </div>

      {/* Cartões (mobile) */}
      <div className="space-y-3 md:hidden">
        {filtradas.length === 0 && (
          <EmptyState>{negociacoes.length === 0 ? "Nenhuma negociação ainda — crie a primeira." : "Nada corresponde aos filtros."}</EmptyState>
        )}
        {paginados.map((n) => (
          <Link key={n.id} href={`/crm/negociacoes/${n.id}`} className="block p-3 card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-gta-navy dark:text-slate-100">{n.nome}</div>
                <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{n.empresaNome || "—"}</div>
              </div>
              <Marca tone={SITUACAO_TONE[n.situacao]} className="shrink-0 text-xs">{SITUACAO_LABEL[n.situacao]}</Marca>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</span>
              <span>{nomeEtapa(n)}</span>
              {n.previsao && <span>{dataCurta(n.previsao)}</span>}
              {n.responsavelNome && <span>{n.responsavelNome}</span>}
            </div>
          </Link>
        ))}
      </div>

      {/* Tabela (desktop) */}
      <div className="hidden overflow-x-auto md:block card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Negociação</th>
              <th>Empresa</th>
              <th>Etapa</th>
              <th className="text-right">Valor</th>
              <th>Responsável</th>
              <th>Previsão</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  {negociacoes.length === 0 ? "Nenhuma negociação ainda — crie a primeira." : "Nada corresponde aos filtros."}
                </td>
              </tr>
            )}
            {paginados.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/crm/negociacoes/${n.id}`} className="text-gta-navy hover:underline dark:text-slate-100">{n.nome}</Link>
                </td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.empresaNome || <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{nomeEtapa(n)}</td>
                <td className="px-4 py-2 text-right font-medium text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.responsavelNome || <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.previsao ? dataCurta(n.previsao) : <span className="sem-valor">—</span>}</td>
                <td className="px-4 py-2"><Marca tone={SITUACAO_TONE[n.situacao]}>{SITUACAO_LABEL[n.situacao]}</Marca></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginacao {...controles} />
    </div>
  );
}
