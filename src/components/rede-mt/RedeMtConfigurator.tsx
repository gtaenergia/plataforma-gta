"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { RedeMtParamsForm } from "./RedeMtParamsForm";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";
import { Kpi } from "@/components/ui";

const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(v, 2);
const parseBR = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};

const HOJE = new Date().toISOString().slice(0, 10);

interface Form {
  clienteNome: string;
  cidadeUf: string;
  localAtividade: string;
  referenciaSeq: number;
  dataEmissao: string;
  validadeDias: number;
  formaPagamento: string;
  extensao: string;
  tensao: string;
  custoProjeto: string;
  custoExecucao: string;
  valorProjeto: string;
  valorExecucao: string;
  objeto: string;
  prazoExecucao: string;
  observacoesExtra: string;
}

const OBJETO_PADRAO =
  "Serviços de engenharia para rede de distribuição em média e baixa tensão, contemplando o projeto executivo (e a execução, quando aplicável) conforme os padrões da concessionária e as normas técnicas vigentes.";
const OBS_PADRAO = [
  "Serviços conforme normas técnicas vigentes e padrões da concessionária.",
  "Materiais e equipamentos principais faturados diretamente ao cliente na execução.",
  "Aprovação e energização sujeitas à concessionária.",
];

const FORM_INICIAL: Form = {
  clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: 1, dataEmissao: HOJE, validadeDias: 20, formaPagamento: "A combinar",
  extensao: "", tensao: "13,8 kV",
  custoProjeto: "", custoExecucao: "",
  valorProjeto: "0", valorExecucao: "0",
  objeto: OBJETO_PADRAO, prazoExecucao: "45 a 90 dias", observacoesExtra: OBS_PADRAO.join("\n"),
};

interface Preco {
  custoProjeto: number; faturamentoProjeto: number; impostosProjeto: number; lucroProjeto: number; margemProjeto: number; fatorKProjeto: number;
  custoExecucao: number; faturamentoExecucao: number; impostosExecucao: number; lucroExecucao: number; margemExecucao: number; fatorKExecucao: number;
  faturamentoTotal: number;
}

/** Linha da composição de custo: etapa + descrição + qtd × valor unitário. */
type CustoRow = { etapa: "projeto" | "execucao"; descricao: string; qtd: string; valorUnit: string };
const CUSTO_ROWS_PADRAO: CustoRow[] = [
  { etapa: "projeto", descricao: "Projeto executivo da rede (dimensionamento, pranchas, memoriais, ART)", qtd: "1", valorUnit: "" },
  { etapa: "execucao", descricao: "Postes, estruturas, cabos, proteções e aterramento", qtd: "1", valorUnit: "" },
  { etapa: "execucao", descricao: "Mão de obra e comissionamento", qtd: "1", valorUnit: "" },
];

export function RedeMtConfigurator({ propostaId }: { propostaId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const [custoRows, setCustoRows] = useState<CustoRow[]>(CUSTO_ROWS_PADRAO);
  const [preco, setPreco] = useState<Preco | null>(null);
  const [params, setParams] = useState<{ fatorKProjeto: number; nfProjeto: number; fatorKExecucao: number; nfExecucao: number } | null>(null);
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const precoTocado = useRef(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const aplicarParams = () => { precoTocado.current = false; setRecalcNonce((n) => n + 1); };
  // Composição de custo editável: as somas por etapa viram o custo → Fator K.
  const setRow = (i: number, patch: Partial<CustoRow>) => { precoTocado.current = false; setCustoRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  const addRow = () => setCustoRows((rs) => [...rs, { etapa: "execucao", descricao: "", qtd: "1", valorUnit: "" }]);
  const removeRow = (i: number) => { precoTocado.current = false; setCustoRows((rs) => rs.filter((_, j) => j !== i)); };
  const rowTotal = (r: CustoRow) => parseBR(r.qtd) * parseBR(r.valorUnit);
  const custoProjeto = custoRows.filter((r) => r.etapa === "projeto").reduce((s, r) => s + rowTotal(r), 0);
  const custoExecucao = custoRows.filter((r) => r.etapa === "execucao").reduce((s, r) => s + rowTotal(r), 0);

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) { const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag; custoRows?: CustoRow[] }; setForm({ ...FORM_INICIAL, ...dados }); precoTocado.current = true; if (dados.cond) setCond(dados.cond as CondPag); if (Array.isArray(dados.custoRows) && dados.custoRows.length) setCustoRows(dados.custoRows); }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=rede-mt").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  const calcKey = JSON.stringify([custoProjeto, custoExecucao, recalcNonce]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/rede-mt/calcular", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ custoProjeto, custoExecucao }),
        });
        if (res.ok) {
          const d = await res.json();
          setPreco(d.preco);
          if (d.params) setParams(d.params);
          if (!precoTocado.current) setForm((f) => ({ ...f, valorProjeto: nf(d.preco.faturamentoProjeto, 2), valorExecucao: nf(d.preco.faturamentoExecucao, 2) }));
        }
      } catch { /* ignora */ }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  const valorProjeto = parseBR(form.valorProjeto);
  const valorExecucao = parseBR(form.valorExecucao);
  const totalCliente = valorProjeto + valorExecucao;
  const suf = form.extensao.trim() ? ` (${form.extensao.trim()}${form.tensao.trim() ? `, ${form.tensao.trim()}` : ""})` : (form.tensao.trim() ? ` (${form.tensao.trim()})` : "");

  function montarItens() {
    const itens: { descricao: string; valor: string; condicao: string }[] = [];
    if (valorProjeto > 0) {
      itens.push({
        descricao: `Projeto executivo de rede de distribuição MT/BT${suf}, com dimensionamentos, diagramas, memoriais, lista de materiais, ART e acompanhamento da aprovação junto à concessionária`,
        valor: nf(valorProjeto, 2),
        condicao: "",
      });
    }
    if (valorExecucao > 0) {
      itens.push({
        descricao: `Execução da rede de distribuição MT/BT${suf}: postes, estruturas, cabos, proteções, aterramento e comissionamento — materiais e equipamentos principais faturados diretamente ao cliente`,
        valor: nf(valorExecucao, 2),
        condicao: "",
      });
    }
    return itens;
  }

  function montarObservacoes() {
    return form.observacoesExtra.split("\n").filter((l) => l.trim());
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true); setErro(null);
    try {
      const payload = { serviceKey: "rede-mt", cliente: form.clienteNome, status: totalCliente > 0 ? "precificada" : "rascunho", dados: { ...form, cond, custoRows } };
      const res = savedId
        ? await fetch(`/api/propostas/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/propostas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const id = data.proposta?.id ?? savedId;
      setSavedId(id);
      if (!silencioso) setStatus("Proposta salva.");
      return id;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar."); return null;
    } finally { setSalvando(false); }
  }

  async function gerar() {
    if (!form.clienteNome) { setErro("Informe o nome do cliente."); return; }
    if (!form.cidadeUf) { setErro("Informe a Cidade/UF."); return; }
    if (totalCliente <= 0) { setErro("Informe o custo de projeto e/ou execução."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, totalCliente),
        titulo: "PROPOSTA TÉCNICA E COMERCIAL — REDE DE DISTRIBUIÇÃO MT/BT",
        objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "rede-mt", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "rede-mt.docx"; a.click();
      URL.revokeObjectURL(url);
      setStatus("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally { setGerando(false); }
  }

  const inputCls = "field-input";
  const sec = "section-card";
  const h2 = "section-title";

  return (
    <div className="space-y-6">
      {erro && <p className="field-error">{erro}</p>}

      {/* Cliente e local */}
      <section className={sec}>
        <h2 className={h2}>Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3"><label className="field-label">Nome do cliente *</label><ClienteInput className={inputCls} value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} /></div>
          <div className="sm:col-span-3"><label className="field-label">Cidade/UF *</label><input className={inputCls} value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" /></div>
          <div className="sm:col-span-3"><label className="field-label">Local / obra</label><input className={inputCls} value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} placeholder="Ex.: Fazenda — zona rural/GO" /></div>
          <div className="sm:col-span-1"><label className="field-label">Validade (dias)</label><input type="number" className={inputCls} value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} /></div>
          <div className="sm:col-span-2"><label className="field-label">Emissão</label><input type="date" className={inputCls} value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></div>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Escopo e custo */}
      <section className={sec}>
        <h2 className={h2}>Escopo e custo</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monte a composição do custo por linha (etapa projeto ou execução). O app soma cada etapa e aplica o <strong>Fator K</strong> para sugerir o preço.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3"><label className="field-label">Extensão / porte</label><input className={inputCls} value={form.extensao} onChange={(e) => set("extensao", e.target.value)} placeholder="Ex.: 1 km / loteamento 80 lotes" /></div>
          <div className="sm:col-span-3"><label className="field-label">Tensão</label><input className={inputCls} value={form.tensao} onChange={(e) => set("tensao", e.target.value)} placeholder="Ex.: 13,8 kV" /></div>
        </div>

        {/* Composição de custo editável */}
        <div className="mt-4 space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:flex dark:text-slate-500">
            <span className="w-28">Etapa</span><span className="flex-1">Descrição do custo</span><span className="w-14 text-right">Qtd</span><span className="w-28 text-right">Valor un.</span><span className="w-28 text-right">Total</span><span className="w-6" />
          </div>
          {custoRows.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select className={`${inputCls} sm:w-28`} value={r.etapa} onChange={(e) => setRow(i, { etapa: e.target.value as CustoRow["etapa"] })}>
                <option value="projeto">Projeto</option>
                <option value="execucao">Execução</option>
              </select>
              <input className={`${inputCls} flex-1`} value={r.descricao} onChange={(e) => setRow(i, { descricao: e.target.value })} placeholder="Descrição do item de custo" />
              <input className={`${inputCls} text-right sm:w-14`} inputMode="decimal" value={r.qtd} onChange={(e) => setRow(i, { qtd: e.target.value })} placeholder="1" />
              <input className={`${inputCls} text-right sm:w-28`} inputMode="decimal" value={r.valorUnit} onChange={(e) => setRow(i, { valorUnit: e.target.value })} placeholder="0,00" />
              <div className="text-right text-sm font-medium text-slate-600 sm:w-28 dark:text-slate-300">{brl(rowTotal(r))}</div>
              <button type="button" className="icon-btn" onClick={() => removeRow(i)} aria-label="Remover"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm font-medium text-gta-indigo hover:underline" onClick={addRow}>+ Adicionar item de custo</button>
          <div className="text-xs text-slate-500 dark:text-slate-400">Custo projeto: <strong className="text-slate-700 dark:text-slate-200">{brl(custoProjeto)}</strong> · Custo execução: <strong className="text-slate-700 dark:text-slate-200">{brl(custoExecucao)}</strong></div>
        </div>

        {preco && (preco.faturamentoProjeto > 0 || preco.faturamentoExecucao > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Projeto (faturamento)" value={brl(preco.faturamentoProjeto)} />
            <Kpi label="Margem projeto" value={`${nf(preco.margemProjeto * 100, 0)}%`} />
            <Kpi label="Execução (faturamento)" value={brl(preco.faturamentoExecucao)} />
            <Kpi label="Margem execução" value={`${nf(preco.margemExecucao * 100, 0)}%`} />
          </div>
        )}
      </section>

      {/* Preço */}
      <section className={sec}>
        <div className="flex items-center justify-between">
          <h2 className={h2}>Preço</h2>
          {preco && precoTocado.current && preco.faturamentoTotal > 0 && (
            <button type="button" className="toque text-xs text-gta-indigo hover:underline" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorProjeto: nf(preco.faturamentoProjeto, 2), valorExecucao: nf(preco.faturamentoExecucao, 2) })); }}>Usar sugerido {brl(preco.faturamentoTotal)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label">Valor do projeto (R$)</label>
            <input className={inputCls} value={form.valorProjeto} onChange={(e) => { precoTocado.current = true; set("valorProjeto", e.target.value); }} />
            {preco && preco.custoProjeto > 0 ? <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">custo {brl(preco.custoProjeto)} × {nf(preco.fatorKProjeto, 3)} / (1−NF) → {brl(preco.faturamentoProjeto)}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Valor da execução (R$)</label>
            <input className={inputCls} value={form.valorExecucao} onChange={(e) => { precoTocado.current = true; set("valorExecucao", e.target.value); }} />
            {preco && preco.custoExecucao > 0 ? <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">custo {brl(preco.custoExecucao)} × Fator K {nf(preco.fatorKExecucao, 2)} → {brl(preco.faturamentoExecucao)}</p> : null}
          </div>
          <div className="sm:col-span-2 flex items-end">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(totalCliente)}</div>
            </div>
          </div>
        </div>

        {preco && (preco.custoProjeto > 0 || preco.custoExecucao > 0) && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Composição do faturamento (uso interno)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Custo (projeto)" value={brl(preco.custoProjeto)} />
              <Kpi label="Custo (execução)" value={brl(preco.custoExecucao)} />
              <Kpi label="Faturamento total" value={brl(preco.faturamentoTotal)} destaque />
              <Kpi label="Impostos/NF" value={brl(preco.impostosProjeto + preco.impostosExecucao)} />
              <Kpi label="Lucro líquido" value={brl(preco.lucroProjeto + preco.lucroExecucao)} />
              <Kpi label="Margem projeto" value={`${nf(preco.margemProjeto * 100, 1)}%`} />
              <Kpi label="Margem execução" value={`${nf(preco.margemExecucao * 100, 1)}%`} />
            </div>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Projeto: faturamento = custo × Fator K / (1 − NF). Execução: custo × Fator K, NF sobre o faturamento. Ajuste em “Parâmetros de preço”.</p>
          </div>
        )}
      </section>

      {/* Condições de pagamento */}
      <CondicoesPagamento total={totalCliente} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className={sec}>
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div><label className="field-label">Objeto</label><textarea className={`${inputCls} min-h-[70px]`} value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div><label className="field-label">Condições gerais (uma por linha)</label><textarea className={`${inputCls} min-h-[90px]`} value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></div>
          <div><label className="field-label">Prazo de execução</label><input className={inputCls} value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></div>
        </div>
      </details>

      {/* Parâmetros */}
      <details className={sec}>
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (Fator K e NF de projeto e execução)</summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Padrão GTA: projeto Fator K 1,889 / NF 15% (margem 40%); execução Fator K 1,7 / NF 6% (margem ~35%).</p>
        <div className="mt-4"><RedeMtParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando..." : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || totalCliente <= 0}>{gerando ? "Gerando..." : "Gerar .docx"}</button>
        <BaixarPlanilhaButton serviceKey="rede-mt" nome={`rede-mt-${form.clienteNome || "proposta"}`} dados={() => ({
          cliente: form.clienteNome,
          referencia: form.referenciaSeq ? String(form.referenciaSeq) : undefined,
          custoRows: custoRows.map((r) => ({ etapa: r.etapa, descricao: r.descricao, qtd: parseBR(r.qtd), valorUnit: parseBR(r.valorUnit) })),
          fatorKProjeto: params?.fatorKProjeto ?? preco?.fatorKProjeto ?? 1.889,
          nfProjeto: params?.nfProjeto ?? 0.15,
          fatorKExecucao: params?.fatorKExecucao ?? preco?.fatorKExecucao ?? 1.7,
          nfExecucao: params?.nfExecucao ?? 0.06,
        })} />
        <button className="toque text-sm text-gta-indigo hover:underline" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
