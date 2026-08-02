"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICOS_SIMPLES } from "./servicos-simples-configs";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";

import { Alert } from "@/components/ui";
const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(v, 2);
const parseBR = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};
const HOJE = new Date().toISOString().slice(0, 10);

type Vals = Record<string, string>;

interface Campo {
  name: string;
  label: string;
  /** "number" = contagem inteira; "currency" = valor em R$ (aceita vírgula); "text" livre. */
  type?: "text" | "number" | "currency";
  width?: string; // classe sm:col-span-N
  placeholder?: string;
  help?: string;
  default: string;
}

export interface ServicoSimplesConfig {
  serviceKey: string;
  tituloSecao: string;
  tituloDoc: string;
  objetoPadrao: string;
  obsPadrao: string[];
  prazoPadrao: string;
  formaPadrao?: string;
  campos: Campo[];
  /** Preço sugerido a partir dos valores dos campos. */
  calcularPreco: (v: Vals) => number;
  /** Texto de ajuda sob o valor (opcional). */
  ajudaPreco?: (v: Vals, preco: number) => string;
  /** Descrição do item da proposta. */
  montarDescricao: (v: Vals) => string;
  condicao?: string;
  precoLabel?: string;
}

export function ServicoSimplesConfigurator({ serviceKey, propostaId }: { serviceKey: string; propostaId?: string }) {
  const router = useRouter();
  const config = SERVICOS_SIMPLES[serviceKey];

  const inicial = (): Vals => ({
    clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: "1", dataEmissao: HOJE, validadeDias: "20",
    formaPagamento: config.formaPadrao ?? "A combinar",
    valorServico: "", objeto: config.objetoPadrao, prazoExecucao: config.prazoPadrao, observacoesExtra: config.obsPadrao.join("\n"),
    ...Object.fromEntries(config.campos.map((c) => [c.name, c.default])),
  });

  const [form, setForm] = useState<Vals>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const precoTocado = useRef(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const driver = (): Vals => Object.fromEntries(config.campos.map((c) => [c.name, String(form[c.name] ?? "")]));

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Record<string, unknown>;
          setForm((f) => ({ ...f, ...(dados as Vals) }));
          if (dados.cond && typeof dados.cond === "object") setCond(dados.cond as CondPag);
          precoTocado.current = true;
        }
      }).catch(() => {});
    } else {
      fetch(`/api/propostas/proximo?serviceKey=${config.serviceKey}`).then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: String(d.seq) }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaId]);

  const precoSugerido = config.calcularPreco(driver());
  useEffect(() => {
    if (!precoTocado.current && precoSugerido > 0) setForm((f) => ({ ...f, valorServico: nf(precoSugerido, 2) }));
  }, [precoSugerido]);

  const valorServico = parseBR(form.valorServico);

  function montarItens() {
    return [{ descricao: config.montarDescricao(driver()), valor: nf(valorServico, 2), condicao: "" }];
  }
  function montarObservacoes() {
    return (form.observacoesExtra ?? "").split("\n").filter((l) => l.trim());
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true); setErro(null);
    try {
      const payload = { serviceKey: config.serviceKey, cliente: form.clienteNome, status: valorServico > 0 ? "precificada" : "rascunho", dados: { ...form, cond } };
      const res = savedId
        ? await fetch(`/api/propostas/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/propostas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const id = data.proposta?.id ?? savedId;
      setSavedId(id);
      if (!silencioso) setStatusMsg("Proposta salva.");
      return id;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar."); return null;
    } finally { setSalvando(false); }
  }

  async function gerar() {
    if (!form.clienteNome) { setErro("Informe o nome do cliente."); return; }
    if (!form.cidadeUf) { setErro("Informe a Cidade/UF."); return; }
    if (valorServico <= 0) { setErro("Informe o valor do serviço."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, valorServico),
        titulo: config.tituloDoc, objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: config.serviceKey, formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : `${config.serviceKey}.docx`; a.click();
      URL.revokeObjectURL(url);
      setStatusMsg("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally { setGerando(false); }
  }

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Cliente e local */}
      <section className="section-card">
        <h2 className="section-title">Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3"><label className="field-label">Nome do cliente *</label><ClienteInput className="field-input" value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} /></div>
          <div className="sm:col-span-3"><label className="field-label">Cidade/UF *</label><input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" /></div>
          <div className="sm:col-span-3"><label className="field-label">Local / obra</label><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} /></div>
          <div className="sm:col-span-1"><label className="field-label">Validade (dias)</label><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="field-label">Emissão</label><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></div>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Campos do serviço */}
      <section className="section-card">
        <h2 className="section-title">{config.tituloSecao}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          {config.campos.map((c) => (
            <div key={c.name} className={c.width ?? "sm:col-span-2"}>
              <label className="field-label">{c.label}</label>
              <input className="field-input" type={c.type === "number" ? "number" : "text"} inputMode={c.type === "number" || c.type === "currency" ? "decimal" : undefined} value={form[c.name] ?? ""} onChange={(e) => set(c.name, e.target.value)} placeholder={c.placeholder} />
              {c.help && <p className="mt-1 hint">{c.help}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Preço */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {precoSugerido > 0 && precoTocado.current && (
            <button type="button" className="toque text-xs text-gta-indigo dark:text-indigo-300 hover:underline" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorServico: nf(precoSugerido, 2) })); }}>Usar sugerido {brl(precoSugerido)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className="field-label">{config.precoLabel ?? "Valor do serviço (R$)"} *</label>
            <input className="field-input" value={form.valorServico} onChange={(e) => { precoTocado.current = true; set("valorServico", e.target.value); }} />
            {precoSugerido > 0 && config.ajudaPreco ? <p className="mt-1 hint">{config.ajudaPreco(driver(), precoSugerido)}</p> : null}
          </div>
          <div className="sm:col-span-3 flex items-end">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(valorServico)}</div>
            </div>
          </div>
        </div>
      </section>

      <CondicoesPagamento total={valorServico} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div><label className="field-label">Objeto</label><textarea className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div><label className="field-label">Condições gerais (uma por linha)</label><textarea className="field-input min-h-[90px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></div>
          <div><label className="field-label">Prazo de execução</label><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></div>
          <p className="hint">A forma de pagamento é montada na seção “Condições de pagamento” acima.</p>
        </div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || valorServico <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton serviceKey={config.serviceKey} disabled={valorServico <= 0} nome={`${config.serviceKey}-${form.clienteNome || "proposta"}`} dados={() => ({
          cliente: form.clienteNome, servico: config.tituloSecao,
          itens: [{ descricao: config.montarDescricao(driver()), valor: valorServico }],
          total: valorServico,
        })} />
        <button className="toque text-sm text-gta-indigo dark:text-indigo-300 hover:underline" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {statusMsg && <span className="text-sm text-green-600 dark:text-green-400">{statusMsg}</span>}
      </div>
    </div>
  );
}
