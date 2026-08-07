"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { SpdaParamsForm } from "./SpdaParamsForm";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";
import { Alert, Kpi } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { DetalhamentoPreco, EquipeResponsavelCard, useEquipeResponsavel, type EquipeSalva } from "@/components/equipe/EquipeResponsavel";

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
  nBlocos: number;
  areaM2: string;
  custoLogistico: string;
  valorProjeto: string; // design total (risco + projeto), sugerido e editável
  valorExecucao: string;
  objeto: string;
  prazoExecucao: string;
  observacoesExtra: string;
}

const OBJETO_PADRAO =
  "Serviços de engenharia para proteção contra descargas atmosféricas (SPDA) conforme a ABNT NBR 5419, contemplando a análise de gerenciamento de risco e o projeto executivo de SPDA (captação, descidas e malha de aterramento), com pranchas, memoriais, lista de materiais e ART.";
const OBS_PADRAO = [
  "Serviços conforme a ABNT NBR 5419.",
  "Inclui 1 visita técnica com medição de resistividade do solo (método Wenner).",
  "Emissão de ART junto ao CREA/GO inclusa.",
  "Instalação física (execução) e fornecimento de materiais são orçados à parte, quando não incluídos.",
];

const FORM_INICIAL: Form = {
  clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: 1, dataEmissao: HOJE, validadeDias: 20, formaPagamento: "A combinar",
  nBlocos: 1, areaM2: "", custoLogistico: "0",
  valorProjeto: "", valorExecucao: "0",
  objeto: OBJETO_PADRAO, prazoExecucao: "30 a 45 dias", observacoesExtra: OBS_PADRAO.join("\n"),
};

interface Preco {
  risco: number; projetoCalc: number; projeto: number; aplicouPiso: boolean;
  design: number; impostos: number; custoLogistico: number; lucro: number; margem: number;
}

export function SpdaConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  /* Serviço por MÉTRICA: o preço vem de R$/bloco e R$/m², e a tabela já
     remunera o projeto. As horas da GTA não somam ao preço — aparecem no
     detalhamento e na margem. Ver `equipeFormaPreco`. */
  const equipe = useEquipeResponsavel({ servicoKey: "spda", criadoPor });
  /** O tempo de montar ESTA proposta — existe mesmo se o cliente não fechar. */
  const equipeOrc = useEquipeResponsavel({ servicoKey: "spda", criadoPor, escopo: "orcamento" });
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [preco, setPreco] = useState<Preco | null>(null);
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [aliq, setAliq] = useState(0.15);
  const [params, setParams] = useState({ valorPorBloco: 1650, precoPorM2: 3, pisoMinimo: 2500, aliqImpostos: 0.15 });
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const precoTocado = useRef(false);

  /** Aviso de saída com edição pendente. Ver `useEdicaoPendente`. */
  const edicao = useEdicaoPendente();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    // `set` é edição de gente; o preenchimento automático usa `setForm` direto
    // e não marca — senão a tela nasceria "suja" só de carregar.
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };
  const aplicarParams = () => { precoTocado.current = false; setRecalcNonce((n) => n + 1); };

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) { const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag; equipeGta?: EquipeSalva; equipeOrcamento?: EquipeSalva }; setForm({ ...FORM_INICIAL, ...dados }); precoTocado.current = true; if (dados.cond) setCond(dados.cond as CondPag); if (dados.equipeGta) equipe.restaurar(dados.equipeGta); if (dados.equipeOrcamento) equipeOrc.restaurar(dados.equipeOrcamento); }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=spda").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  const calcKey = JSON.stringify([form.nBlocos, form.areaM2, form.custoLogistico, recalcNonce]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/spda/calcular", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nBlocos: form.nBlocos, areaM2: parseBR(form.areaM2), custoLogistico: parseBR(form.custoLogistico) }),
        });
        if (res.ok) {
          const d = await res.json();
          setPreco(d.preco);
          if (d.params) setParams(d.params);
          if (d.params?.aliqImpostos != null) setAliq(d.params.aliqImpostos);
          if (!precoTocado.current) setForm((f) => ({ ...f, valorProjeto: nf(d.preco.design, 2) }));
        }
      } catch { /* ignora */ }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  // Divisão dos itens: risco (por bloco, calculado) + projeto (total − risco).
  const valorTotalProjeto = parseBR(form.valorProjeto);
  const riscoItem = preco?.risco ?? 0;
  const projetoItem = Math.max(0, valorTotalProjeto - riscoItem);
  const totalCliente = valorTotalProjeto + parseBR(form.valorExecucao);
  // Composição do faturamento (reflete o valor editado do projeto).
  const impostosVal = valorTotalProjeto * aliq;
  const lucroVal = valorTotalProjeto - impostosVal - (preco?.custoLogistico ?? 0);
  const margemVal = valorTotalProjeto > 0 ? lucroVal / valorTotalProjeto : 0;

  function montarItens() {
    const itens: { descricao: string; valor: string; condicao: string }[] = [];
    const n = form.nBlocos;
    const area = parseBR(form.areaM2);
    itens.push({
      descricao:
        `Análise de gerenciamento de risco (ABNT NBR 5419) para ${n > 1 ? `${n} estruturas` : "1 estrutura"}: visita técnica, ` +
        `medição de resistividade do solo, cálculo das componentes de risco (R1/R2/R3), definição da classe de SPDA, laudo e memorial de cálculo`,
      valor: nf(riscoItem, 2),
      condicao: "",
    });
    itens.push({
      descricao:
        `Projeto executivo de SPDA (ABNT NBR 5419)${area > 0 ? ` — área de cobertura ~${nf(area, 0)} m²` : ""}: captação, condutores de descida e ` +
        `malha de aterramento, com pranchas DWG/PDF, memorial descritivo, memorial de cálculo e lista de materiais`,
      valor: nf(projetoItem, 2),
      condicao: "",
    });
    if (parseBR(form.valorExecucao) > 0) {
      itens.push({
        descricao: "Execução do SPDA (mão de obra, ferramental, ensaios e relatório) — materiais conforme a lista do projeto, faturados à parte",
        valor: nf(parseBR(form.valorExecucao), 2),
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
      const payload = { serviceKey: "spda", cliente: form.clienteNome, status: totalCliente > 0 ? "precificada" : "rascunho", dados: { ...form, cond, equipeGta: equipe.serializar(), equipeOrcamento: equipeOrc.serializar() } };
      const res = savedId
        ? await fetch(`/api/propostas/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/propostas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const id = data.proposta?.id ?? savedId;
      setSavedId(id);
      edicao.marcarSalvo();
      if (!silencioso) setStatus("Proposta salva.");
      return id;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar."); return null;
    } finally { setSalvando(false); }
  }

  async function gerar() {
    if (!form.clienteNome) { setErro("Informe o nome do cliente."); return; }
    if (!form.cidadeUf) { setErro("Informe a Cidade/UF."); return; }
    if (valorTotalProjeto <= 0) { setErro("Informe o valor do projeto."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, totalCliente),
        titulo: "PROPOSTA TÉCNICA E COMERCIAL — SPDA E GERENCIAMENTO DE RISCO",
        objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "spda", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "spda.docx"; a.click();
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
          <Campo className="sm:col-span-3" label="Nome do cliente *"><ClienteInput value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} /></Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF *"><input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" /></Campo>
          <Campo className="sm:col-span-3" label="Local / obra"><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} placeholder="Ex.: Campus — Quirinópolis/GO" /></Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)"><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} /></Campo>
          <Campo className="sm:col-span-2" label="Emissão"><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></Campo>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Estrutura e área */}
      <section className="section-card">
        <h2 className="section-title">Estrutura e área</h2>
        <p className="mt-1 subtitle">O preço vem das métricas reais: <strong>risco por bloco</strong> + <strong>projeto por m²</strong>.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Nº de blocos / estruturas *"><input type="number" min={1} className="field-input" value={form.nBlocos} onChange={(e) => set("nBlocos", Math.max(1, Number(e.target.value)))} /></Campo>
          <Campo className="sm:col-span-2" label="Área total de cobertura (m²) *"><input className="field-input" inputMode="decimal" value={form.areaM2} onChange={(e) => set("areaM2", e.target.value)} placeholder="Ex.: 3.790" /></Campo>
          <Campo className="sm:col-span-2" label="Custo logístico estimado (R$)" hint={<><p className="mt-1 hint">Deslocamento, hospedagem, diárias, terrômetro, estagiário — só para conferir a margem.</p></>}><input className="field-input" inputMode="decimal" value={form.custoLogistico} onChange={(e) => set("custoLogistico", e.target.value)} placeholder="0" /></Campo>
        </div>

        {preco && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label={`Risco (${form.nBlocos} × bloco)`} value={brl(preco.risco)} />
            <Kpi label="Projeto (por m²)" value={brl(preco.projetoCalc)} />
            <Kpi label="Faturamento do projeto" value={brl(preco.design)} destaque />
            <Kpi label="Margem líquida" value={`${nf(preco.margem * 100, 1)}%`} destaque />
          </div>
        )}
        {preco?.aplicouPiso && (
          <p className="mt-2 inline-flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Piso mínimo aplicado: risco + projeto ({brl(preco.risco + preco.projetoCalc)}) ficou abaixo do piso, o valor foi elevado para proteger o custo fixo.</p>
        )}
      </section>

      {/* Preço */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {preco && precoTocado.current && (
            <button type="button" className="btn-link text-xs" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorProjeto: nf(preco.design, 2) })); }}>Usar sugerido {brl(preco.design)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Valor do projeto (R$) *" hint={preco ? <p className="mt-1 hint">risco {brl(riscoItem)} + projeto {brl(projetoItem)} = {brl(valorTotalProjeto)} · margem {nf(margemVal * 100, 0)}%</p> : null}>
            <input className="field-input" value={form.valorProjeto} onChange={(e) => { precoTocado.current = true; set("valorProjeto", e.target.value); }} placeholder="Ex.: 21.870,00" />
          </Campo>
          <Campo className="sm:col-span-2" label="Execução (R$, 0 = só projeto)" hint={<><p className="mt-1 hint">Mão de obra; materiais faturados à parte.</p></>}>
            <input className="field-input" value={form.valorExecucao} onChange={(e) => set("valorExecucao", e.target.value)} />
          </Campo>
          <div className="sm:col-span-2 flex items-end">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(totalCliente)}</div>
            </div>
          </div>
        </div>

        {preco && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Composição do faturamento (uso interno)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Gerenciamento de risco" value={brl(riscoItem)} />
              <Kpi label="Projeto de SPDA" value={brl(projetoItem)} />
              <Kpi label="Faturamento (projeto)" value={brl(valorTotalProjeto)} destaque />
              <Kpi label={`Impostos (${nf(aliq * 100, 0)}%)`} value={brl(impostosVal)} />
              <Kpi label="Custo logístico" value={brl(preco.custoLogistico)} />
              <Kpi label="Lucro líquido" value={brl(lucroVal)} />
              <Kpi label="Margem líquida" value={`${nf(margemVal * 100, 1)}%`} destaque />
            </div>
            <p className="mt-1 hint">
              Faturamento = risco (por bloco) + projeto (por m²), com piso mínimo. Margem = (faturamento − impostos − custo logístico) / faturamento. Ajuste as taxas em “Parâmetros de preço”.
            </p>
          </div>
        )}
      </section>

      {/* Condições de pagamento */}
      {/* Olha o PROJETO, não o total: a execução é orçada à parte e não é
          onde as horas de engenharia da GTA aparecem. */}
      <EquipeResponsavelCard estado={equipe} />
      <EquipeResponsavelCard estado={equipeOrc} />

      <DetalhamentoPreco
        projeto={equipe}
        orcamento={equipeOrc}
        rotuloBase="Faturamento do projeto"
        baseCent={Math.round(valorTotalProjeto * 100)}
        precoSemEquipeCent={Math.round(valorTotalProjeto * 100)}
        repasses={
          parseBR(form.valorExecucao) > 0
            ? [{ rotulo: "Execução do SPDA", valor: parseBR(form.valorExecucao) }]
            : []
        }
        custos={[
          { rotulo: "Custo logístico", valor: preco?.custoLogistico ?? 0 },
          { rotulo: "Impostos", valor: impostosVal },
        ]}
      />

      <CondicoesPagamento total={totalCliente} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <Campo label="Objeto"><textarea className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></Campo>
          <Campo label="Condições gerais (uma por linha)"><textarea className="field-input min-h-[90px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></Campo>
          <Campo label="Prazo de execução"><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></Campo>
        </div>
      </details>

      {/* Parâmetros */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (R$/bloco, R$/m², piso, impostos)</summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Faturamento = R$/bloco × nº de blocos + R$/m² × área, respeitando o piso mínimo. Ao salvar, valem para todos os próximos cálculos.</p>
        <div className="mt-4"><SpdaParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || valorTotalProjeto <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton
          serviceKey="spda"
          nome={`spda-${form.clienteNome || "proposta"}`}
          dados={() => ({
            cliente: form.clienteNome,
            nBlocos: form.nBlocos,
            valorPorBloco: params.valorPorBloco,
            area: parseBR(form.areaM2),
            precoPorM2: params.precoPorM2,
            piso: params.pisoMinimo,
            aliqImpostos: aliq,
          })}
        />
        <button className="btn-link" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
