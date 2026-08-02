"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExecSeParamsForm } from "./ExecSeParamsForm";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";
import { Alert, Kpi } from "@/components/ui";

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
  potenciaKva: string;
  tipo: "Aérea" | "Abrigada" | "Pedestal";
  custoMateriais: string;
  custoMaoObra: string;
  custoProjetoOutros: string;
  valorServico: string; // faturamento sugerido e editável
  valorEquipamento: string;
  objeto: string;
  prazoExecucao: string;
  observacoesExtra: string;
}

const OBJETO_PADRAO =
  "Execução completa da subestação, contemplando obra civil, montagem eletromecânica, aterramento, ensaios de comissionamento e a documentação técnica pertinente, conforme os padrões da concessionária e as normas técnicas vigentes.";
const OBS_PADRAO = [
  "Equipamentos e materiais principais (transformador, cubículo) faturados diretamente ao cliente.",
  "Serviços conforme normas técnicas vigentes e padrões da concessionária.",
  "Energização sujeita à liberação da concessionária.",
];

const FORM_INICIAL: Form = {
  clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: 1, dataEmissao: HOJE, validadeDias: 20, formaPagamento: "A combinar",
  potenciaKva: "", tipo: "Aérea",
  custoMateriais: "", custoMaoObra: "", custoProjetoOutros: "",
  valorServico: "", valorEquipamento: "0",
  objeto: OBJETO_PADRAO, prazoExecucao: "60 a 90 dias", observacoesExtra: OBS_PADRAO.join("\n"),
};

interface Preco {
  custoMateriais: number; custoMaoObra: number; custoProjetoOutros: number; custo: number;
  fatorK: number; faturamento: number; impostos: number; lucro: number; margem: number;
}

export function ExecucaoSubestacaoConfigurator({ propostaId }: { propostaId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [preco, setPreco] = useState<Preco | null>(null);
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const precoTocado = useRef(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const aplicarParams = () => { precoTocado.current = false; setRecalcNonce((n) => n + 1); };

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) { const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag }; setForm({ ...FORM_INICIAL, ...dados }); precoTocado.current = true; if (dados.cond) setCond(dados.cond as CondPag); }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=execucao-subestacao").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  const calcKey = JSON.stringify([form.custoMateriais, form.custoMaoObra, form.custoProjetoOutros, recalcNonce]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/execucao-subestacao/calcular", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ custoMateriais: parseBR(form.custoMateriais), custoMaoObra: parseBR(form.custoMaoObra), custoProjetoOutros: parseBR(form.custoProjetoOutros) }),
        });
        if (res.ok) {
          const d = await res.json();
          setPreco(d.preco);
          if (!precoTocado.current && d.preco.custo > 0) setForm((f) => ({ ...f, valorServico: nf(d.preco.faturamento, 2) }));
        }
      } catch { /* ignora */ }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  const valorServico = parseBR(form.valorServico);
  const totalCliente = valorServico + parseBR(form.valorEquipamento);

  function montarItens() {
    const kva = form.potenciaKva.trim();
    const itens: { descricao: string; valor: string; condicao: string }[] = [];
    itens.push({
      descricao:
        `Execução completa da subestação${kva ? ` de ${kva} kVA` : ""} (${form.tipo.toLowerCase()}): obra civil, montagem eletromecânica, ` +
        `cabeamento, aterramento, quadros e proteções, ensaios de comissionamento e ART — equipamentos principais faturados à parte`,
      valor: nf(valorServico, 2),
      condicao: "",
    });
    if (parseBR(form.valorEquipamento) > 0) {
      itens.push({
        descricao: "Fornecimento dos equipamentos principais (transformador, cubículo e acessórios)",
        valor: nf(parseBR(form.valorEquipamento), 2),
        condicao: "faturamento direto do equipamento",
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
      const payload = { serviceKey: "execucao-subestacao", cliente: form.clienteNome, status: totalCliente > 0 ? "precificada" : "rascunho", dados: { ...form, cond } };
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
    if (valorServico <= 0) { setErro("Informe o custo (ou o valor do serviço)."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, totalCliente),
        titulo: `PROPOSTA TÉCNICA E COMERCIAL — EXECUÇÃO DE SUBESTAÇÃO${form.potenciaKva.trim() ? ` ${form.potenciaKva.trim()} kVA` : ""}`,
        objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "execucao-subestacao", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "execucao-subestacao.docx"; a.click();
      URL.revokeObjectURL(url);
      setStatus("Documento gerado e baixado. Registrado no histórico.");
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
          <div className="sm:col-span-3"><label className="field-label">Local / obra</label><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} placeholder="Ex.: Zona rural — GO" /></div>
          <div className="sm:col-span-1"><label className="field-label">Validade (dias)</label><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} /></div>
          <div className="sm:col-span-2"><label className="field-label">Emissão</label><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></div>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Custo da execução */}
      <section className="section-card">
        <h2 className="section-title">Custo da execução</h2>
        <p className="mt-1 subtitle">Informe o custo do levantamento (BOM). O preço é <strong>custo × Fator K</strong>; o equipamento principal é faturado à parte.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><label className="field-label">Potência (kVA)</label><input className="field-input" inputMode="decimal" value={form.potenciaKva} onChange={(e) => set("potenciaKva", e.target.value)} placeholder="Ex.: 750" /></div>
          <div className="sm:col-span-2">
            <label className="field-label">Tipo</label>
            <select className="field-input" value={form.tipo} onChange={(e) => set("tipo", e.target.value as Form["tipo"])}>
              <option value="Aérea">Aérea</option>
              <option value="Abrigada">Abrigada</option>
              <option value="Pedestal">Pedestal</option>
            </select>
          </div>
          <div className="sm:col-span-2"><label className="field-label">Materiais (R$)</label><input className="field-input" inputMode="decimal" value={form.custoMateriais} onChange={(e) => set("custoMateriais", e.target.value)} placeholder="Ex.: 55.000" /></div>
          <div className="sm:col-span-2"><label className="field-label">Mão de obra (R$)</label><input className="field-input" inputMode="decimal" value={form.custoMaoObra} onChange={(e) => set("custoMaoObra", e.target.value)} placeholder="Ex.: 6.000" /></div>
          <div className="sm:col-span-2"><label className="field-label">Projeto/ART/outros (R$)</label><input className="field-input" inputMode="decimal" value={form.custoProjetoOutros} onChange={(e) => set("custoProjetoOutros", e.target.value)} placeholder="Ex.: 12.000" /></div>
        </div>

        {preco && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Custo total" value={brl(preco.custo)} />
            <Kpi label="Fator K" value={`× ${nf(preco.fatorK, 2)}`} />
            <Kpi label="Faturamento" value={brl(preco.faturamento)} destaque />
            <Kpi label="Margem líquida" value={`${nf(preco.margem * 100, 1)}%`} destaque />
          </div>
        )}
      </section>

      {/* Preço */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {preco && precoTocado.current && preco.faturamento > 0 && (
            <button type="button" className="toque text-xs text-gta-indigo dark:text-indigo-300 hover:underline" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorServico: nf(preco.faturamento, 2) })); }}>Usar sugerido {brl(preco.faturamento)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label">Valor do serviço (R$) *</label>
            <input className="field-input" value={form.valorServico} onChange={(e) => { precoTocado.current = true; set("valorServico", e.target.value); }} placeholder="Ex.: 128.790,00" />
            {preco ? <p className="mt-1 hint">custo {brl(preco.custo)} × Fator K {nf(preco.fatorK, 2)} → sugerido {brl(preco.faturamento)}</p> : null}
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Equipamento (R$, à parte)</label>
            <input className="field-input" value={form.valorEquipamento} onChange={(e) => set("valorEquipamento", e.target.value)} />
            <p className="mt-1 hint">Transformador/cubículo; 0 = por conta do cliente.</p>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(totalCliente)}</div>
            </div>
          </div>
        </div>

        {preco && preco.custo > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Composição do faturamento (uso interno)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Custo total" value={brl(preco.custo)} />
              <Kpi label="Fator K (markup)" value={`× ${nf(preco.fatorK, 2)}`} />
              <Kpi label="Faturamento" value={brl(preco.faturamento)} destaque />
              <Kpi label="Impostos/NF" value={brl(preco.impostos)} />
              <Kpi label="Lucro líquido" value={brl(preco.lucro)} />
              <Kpi label="Margem líquida" value={`${nf(preco.margem * 100, 1)}%`} destaque />
            </div>
            <p className="mt-1 hint">Faturamento = custo × Fator K. Margem = (faturamento − custo − impostos) / faturamento. Ajuste em “Parâmetros de preço”.</p>
          </div>
        )}
      </section>

      <CondicoesPagamento total={totalCliente} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div><label className="field-label">Objeto</label><textarea className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div><label className="field-label">Condições gerais (uma por linha)</label><textarea className="field-input min-h-[90px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></div>
          <div><label className="field-label">Prazo de execução</label><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></div>
        </div>
      </details>

      {/* Parâmetros */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (Fator K, impostos)</summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Faturamento = custo × Fator K. Padrão de execução da GTA: Fator K 1,7 e NF 6% → margem ≈ 35%.</p>
        <div className="mt-4"><ExecSeParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || valorServico <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton
          serviceKey="execucao-subestacao"
          nome={`execucao-subestacao-${form.clienteNome || "proposta"}`}
          disabled={valorServico <= 0}
          dados={() => ({
            cliente: form.clienteNome,
            referencia: form.referenciaSeq ? String(form.referenciaSeq) : undefined,
            potenciaKva: form.potenciaKva.trim(),
            tipo: form.tipo,
            custoMateriais: parseBR(form.custoMateriais),
            custoMaoObra: parseBR(form.custoMaoObra),
            custoProjetoOutros: parseBR(form.custoProjetoOutros),
            valorServico,
            valorEquipamento: parseBR(form.valorEquipamento),
            fatorK: preco?.fatorK ?? 1.7,
            aliqImpostos: preco && preco.faturamento > 0 ? preco.impostos / preco.faturamento : 0.06,
          })}
        />
        <button className="toque text-sm text-gta-indigo dark:text-indigo-300 hover:underline" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
