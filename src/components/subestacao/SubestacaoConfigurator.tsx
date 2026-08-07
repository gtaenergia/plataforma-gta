"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SubestacaoParamsForm } from "./SubestacaoParamsForm";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";
import { Alert, Kpi } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { DetalhamentoPreco, EquipeResponsavelCard, useEquipeResponsavel } from "@/components/equipe/EquipeResponsavel";

const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(v, 2);
const parseBR = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};

const HOJE = new Date().toISOString().slice(0, 10);
const SALARIO_MINIMO = 1630;

interface Form {
  clienteNome: string;
  cidadeUf: string;
  localAtividade: string;
  referenciaSeq: number;
  dataEmissao: string;
  validadeDias: number;
  formaPagamento: string;
  tipoSE: "Aérea" | "Abrigada" | "Pedestal";
  tensaoMt: number;
  tensaoBt: number;
  modo: "carga" | "demanda";
  cargaKw: string;
  fatorDemanda: string;
  fatorPotencia: string;
  demandaKva: string;
  qtdSubestacoes: number;
  valorProjeto: string;
  incluirConexao: boolean;
  salarioMinimo: string;
  impostos: string;
  objeto: string;
  prazoExecucao: string;
  observacoesExtra: string;
}

const OBJETO_PADRAO =
  "Elaboração do projeto executivo de subestação, contemplando o dimensionamento do transformador e da proteção, diagramas unifilares, memoriais descritivos, lista de materiais, ART e o acompanhamento da aprovação junto à concessionária.";

const OBS_PADRAO = [
  "Serviços executados conforme normas técnicas vigentes e padrões da concessionária.",
  "Aprovação e prazos sujeitos à análise da concessionária.",
  "Dimensionamento preliminar; os valores finais são confirmados no projeto executivo.",
];

const FORM_INICIAL: Form = {
  clienteNome: "",
  cidadeUf: "",
  localAtividade: "",
  referenciaSeq: 1,
  dataEmissao: HOJE,
  validadeDias: 20,
  formaPagamento: "A combinar",
  tipoSE: "Aérea",
  tensaoMt: 13.8,
  tensaoBt: 380,
  modo: "carga",
  cargaKw: "",
  fatorDemanda: "0,6",
  fatorPotencia: "0,92",
  demandaKva: "",
  qtdSubestacoes: 1,
  valorProjeto: "",
  incluirConexao: false,
  salarioMinimo: String(SALARIO_MINIMO),
  impostos: "0",
  objeto: OBJETO_PADRAO,
  prazoExecucao: "30 a 45 dias úteis",
  observacoesExtra: OBS_PADRAO.join("\n"),
};

interface Sizing {
  demandaKva: number;
  atendimento: "BT" | "Aérea" | "Abrigada";
  aviso: string;
  trafoKva: number;
  aproveitamento: number;
  correntePrimaria: number;
  correnteSecundaria: number;
  elo: string;
  disjuntorBt: number;
  condutorMt: string;
  poste: string;
  bancoCapacitor: number;
}

interface Preco {
  horas: number;
  custo: number;
  margem: number;
  precoUnitario: number;
  precoTotal: number;
}

export function SubestacaoConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  // Por métrica: as horas da GTA não somam ao preço, só medem a margem.
  const equipe = useEquipeResponsavel({ servicoKey: "projeto-subestacao", criadoPor });
  /** O tempo de montar ESTA proposta — existe mesmo se o cliente não fechar. */
  const equipeOrc = useEquipeResponsavel({ servicoKey: "projeto-subestacao", criadoPor, escopo: "orcamento" });
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const [sizing, setSizing] = useState<Sizing | null>(null);
  const [preco, setPreco] = useState<Preco | null>(null);
  const [params, setParams] = useState<{ valorHora: number; artProjeto: number; margemProjeto: number } | null>(null);
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const precoTocado = useRef(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ao salvar os parâmetros de preço, recalcula e volta a aplicar a sugestão
  function aplicarParams() {
    precoTocado.current = false;
    setRecalcNonce((n) => n + 1);
  }

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag };
          setForm({ ...FORM_INICIAL, ...dados });
          if (dados.cond) setCond(dados.cond as CondPag);
          precoTocado.current = true;
        }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=projeto-subestacao").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  // parâmetros de preço (valor/hora, ART, margem) — para a planilha .xlsx
  useEffect(() => {
    fetch("/api/subestacao/config").then((r) => r.json()).then((d) => {
      if (d.params) setParams({ valorHora: d.params.valorHora, artProjeto: d.params.artProjeto, margemProjeto: d.params.margemProjeto });
    }).catch(() => {});
  }, [recalcNonce]);

  // cálculo ao vivo (debounce)
  const calcKey = JSON.stringify([
    form.modo, form.cargaKw, form.fatorDemanda, form.fatorPotencia, form.demandaKva,
    form.tensaoMt, form.tensaoBt, form.tipoSE, form.qtdSubestacoes, recalcNonce,
  ]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const temEntrada = form.modo === "carga" ? parseBR(form.cargaKw) > 0 : parseBR(form.demandaKva) > 0;
    if (!temEntrada) {
      setSizing(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/subestacao/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modo: form.modo,
            cargaKw: parseBR(form.cargaKw),
            fatorDemanda: parseBR(form.fatorDemanda),
            fatorPotencia: parseBR(form.fatorPotencia),
            demandaKva: parseBR(form.demandaKva),
            tensaoMt: form.tensaoMt,
            tensaoBt: form.tensaoBt,
            tipoSE: form.tipoSE,
            qtdSubestacoes: form.qtdSubestacoes,
          }),
        });
        if (res.ok) {
          const d = await res.json();
          setSizing(d.sizing);
          setPreco(d.preco);
          if (!precoTocado.current) setForm((f) => ({ ...f, valorProjeto: nf(d.preco.precoTotal, 2) }));
        }
      } catch {
        /* ignora erro transitório */
      }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  const conexaoValor = form.incluirConexao ? 2 * parseBR(form.salarioMinimo) : 0;
  const total = parseBR(form.valorProjeto) + conexaoValor + parseBR(form.impostos);

  function tituloDoc() {
    return `PROPOSTA TÉCNICA E COMERCIAL — PROJETO DE SUBESTAÇÃO${sizing ? ` ${nf(sizing.trafoKva, sizing.trafoKva % 1 ? 1 : 0)} kVA` : ""}`;
  }

  function montarItens() {
    if (!sizing) return null;
    const qtd = form.qtdSubestacoes;
    const kva = nf(sizing.trafoKva, sizing.trafoKva % 1 ? 1 : 0);
    const itens = [
      {
        descricao:
          `Elaboração de projeto executivo de ${qtd > 1 ? `${qtd} subestações` : "subestação"} ${form.tipoSE.toLowerCase()} de ${kva} kVA ` +
          `(${nf(form.tensaoMt, form.tensaoMt % 1 ? 1 : 0)} kV / ${form.tensaoBt} V), conforme a NT.002 da concessionária: dimensionamento do ` +
          `transformador e da proteção, diagramas unifilares, memoriais, lista de materiais, ART e acompanhamento da aprovação`,
        valor: nf(parseBR(form.valorProjeto), 2),
        condicao: "",
      },
    ];
    if (conexaoValor > 0) {
      itens.push({
        descricao: "Assessoria de conexão junto à concessionária (viabilidade, liberação de carga e acompanhamento) — 2 salários mínimos",
        valor: nf(conexaoValor, 2),
        condicao: "",
      });
    }
    if (parseBR(form.impostos) > 0) {
      itens.push({ descricao: "Impostos e emissão de Nota Fiscal", valor: nf(parseBR(form.impostos), 2), condicao: "" });
    }
    return itens;
  }

  function montarObservacoes() {
    const base = sizing
      ? `Base de dimensionamento (NT.002) — Demanda estimada: ${nf(sizing.demandaKva, 1)} kVA · ` +
        `Transformador: ${nf(sizing.trafoKva, sizing.trafoKva % 1 ? 1 : 0)} kVA · ` +
        `Corrente no primário (${nf(form.tensaoMt, form.tensaoMt % 1 ? 1 : 0)} kV): ${nf(sizing.correntePrimaria, 1)} A · ` +
        `Corrente no secundário (${form.tensaoBt} V): ${nf(sizing.correnteSecundaria, 0)} A · ` +
        `Proteção: elo fusível ${sizing.elo} e disjuntor geral de ${sizing.disjuntorBt} A · ` +
        `Condutor de MT: ${sizing.condutorMt}` +
        (sizing.atendimento === "Aérea" ? ` · Poste: ${sizing.poste}` : "") +
        ` · Banco de capacitores mínimo: ${nf(sizing.bancoCapacitor, sizing.bancoCapacitor % 1 ? 1 : 0)} kVAr.`
      : "";
    return [base, ...form.observacoesExtra.split("\n")].filter((l) => l.trim());
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true);
    setErro(null);
    try {
      const payload = { serviceKey: "projeto-subestacao", cliente: form.clienteNome, status: total > 0 ? "precificada" : "rascunho", dados: { ...form, cond } };
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
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function gerar() {
    const itens = montarItens();
    if (!itens) { setErro("Informe a carga/demanda para dimensionar antes de gerar."); return; }
    if (sizing && sizing.trafoKva === 0) { setErro("Demanda abaixo de 60 kVA: não há subestação a projetar (atendimento em BT)."); return; }
    if (!form.clienteNome) { setErro("Informe o nome do cliente."); return; }
    if (!form.cidadeUf) { setErro("Informe a Cidade/UF."); return; }
    if (parseBR(form.valorProjeto) <= 0) { setErro("Informe o valor do projeto."); return; }
    setGerando(true);
    setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome,
        cidadeUf: form.cidadeUf,
        localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq,
        dataEmissao: form.dataEmissao,
        validadeDias: form.validadeDias,
        formaPagamento: montarFormaPagamento(cond, total),
        titulo: tituloDoc(),
        objeto: form.objeto,
        prazoExecucao: form.prazoExecucao,
        itens,
        observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: "projeto-subestacao", formData, propostaId: id }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const filename = m ? decodeURIComponent(m[1]) : "projeto-subestacao.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setStatus("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  const aprovOk = sizing ? sizing.aproveitamento <= 1.0 : true;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Cliente e local */}
      <section className="section-card">
        <h2 className="section-title">Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Nome do cliente *">
            <ClienteInput className="field-input" value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} />
          </Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF *">
            <input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goianápolis/GO" />
          </Campo>
          <Campo className="sm:col-span-3" label="Local da obra">
            <input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} placeholder="Ex.: Edifício Residencial — Centro" />
          </Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)">
            <input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} />
          </Campo>
          <Campo className="sm:col-span-2" label="Emissão">
            <input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} />
          </Campo>
        </div>
        <p className="mt-2 hint">A referência (nº da proposta) é gerada automaticamente ao salvar.</p>
      </section>

      {/* Dados da subestação */}
      <section className="section-card">
        <h2 className="section-title">Dados da subestação</h2>
        <p className="mt-1 subtitle">
          Informe a carga (ou a demanda) — o sistema dimensiona o transformador e a proteção.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Tipo de subestação">
            <select className="field-input" value={form.tipoSE} onChange={(e) => set("tipoSE", e.target.value as Form["tipoSE"])}>
              {["Aérea", "Abrigada", "Pedestal"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Tensão primária (MT)">
            <select className="field-input" value={form.tensaoMt} onChange={(e) => set("tensaoMt", Number(e.target.value))}>
              <option value={13.8}>13,8 kV</option>
              <option value={34.5}>34,5 kV</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Tensão secundária (BT)">
            <select className="field-input" value={form.tensaoBt} onChange={(e) => set("tensaoBt", Number(e.target.value))}>
              <option value={380}>380/220 V</option>
              <option value={220}>220/127 V</option>
              <option value={440}>440/254 V</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Entrada por">
            <select className="field-input" value={form.modo} onChange={(e) => set("modo", e.target.value as Form["modo"])}>
              <option value="carga">Carga instalada (kW)</option>
              <option value="demanda">Demanda (kVA)</option>
            </select>
          </Campo>
          {form.modo === "carga" ? (
            <>
              <Campo className="sm:col-span-2" label="Carga instalada (kW) *">
                <input className="field-input" inputMode="decimal" value={form.cargaKw} onChange={(e) => set("cargaKw", e.target.value)} placeholder="Ex.: 250" />
              </Campo>
              <Campo className="sm:col-span-1" label="Fator de demanda">
                <input className="field-input" inputMode="decimal" value={form.fatorDemanda} onChange={(e) => set("fatorDemanda", e.target.value)} />
              </Campo>
              <Campo className="sm:col-span-1" label="Fator de potência">
                <input className="field-input" inputMode="decimal" value={form.fatorPotencia} onChange={(e) => set("fatorPotencia", e.target.value)} />
              </Campo>
            </>
          ) : (
            <Campo className="sm:col-span-2" label="Demanda (kVA) *">
              <input className="field-input" inputMode="decimal" value={form.demandaKva} onChange={(e) => set("demandaKva", e.target.value)} placeholder="Ex.: 225" />
            </Campo>
          )}
          <Campo className="sm:col-span-2" label="Nº de subestações">
            <input type="number" className="field-input" value={form.qtdSubestacoes} onChange={(e) => set("qtdSubestacoes", Number(e.target.value))} />
          </Campo>
        </div>

        {sizing?.aviso && <Alert tone="amber" className="mt-4">{sizing.aviso}</Alert>}

        {sizing && sizing.trafoKva > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Transformador (NT.002)" value={`${nf(sizing.trafoKva, sizing.trafoKva % 1 ? 1 : 0)} kVA`} destaque />
            <Kpi label="Demanda estimada" value={`${nf(sizing.demandaKva, 1)} kVA`} />
            <Kpi label="Corrente primária" value={`${nf(sizing.correntePrimaria, 1)} A`} />
            <Kpi label="Corrente secundária" value={`${nf(sizing.correnteSecundaria, 0)} A`} />
            <Kpi label="Elo fusível (MT)" value={sizing.elo} />
            <Kpi label="Disjuntor geral (BT)" value={`${sizing.disjuntorBt} A`} />
            <Kpi label="Condutor MT" value={sizing.condutorMt} />
            {sizing.atendimento === "Aérea" && <Kpi label="Poste (NT.002)" value={sizing.poste} />}
            <Kpi label="Banco de capacitores" value={`${nf(sizing.bancoCapacitor, sizing.bancoCapacitor % 1 ? 1 : 0)} kVAr`} />
            <div className={`rounded-md p-2 shadow-sm ${aprovOk ? "bg-white dark:bg-slate-800" : "bg-amber-50 dark:bg-amber-900/30"}`}>
              <div className="text-xs text-slate-600 dark:text-slate-400">Aproveitamento do trafo</div>
              <div className={`mt-0.5 font-semibold ${aprovOk ? "text-gta-navy dark:text-slate-100" : "text-amber-700 dark:text-amber-300"}`}>
                {nf(sizing.aproveitamento * 100, 0)}% {aprovOk ? "" : "· acima do nominal (NT.002)"}
              </div>
            </div>
          </div>
        )}
        {(!sizing || sizing.trafoKva === 0) && !sizing?.aviso && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
            Preencha a <strong>{form.modo === "carga" ? "carga instalada" : "demanda"}</strong> para dimensionar automaticamente.
          </p>
        )}
      </section>

      {/* Preço */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {preco && !precoTocado.current && (
            <button type="button" className="btn-link text-xs" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorProjeto: nf(preco.precoTotal, 2) })); }}>
              Usar sugerido {brl(preco.precoTotal)}
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Valor do projeto (R$) *" hint={preco ? (
              <p className="mt-1 hint">
                {nf(preco.horas, 1)} h × valor/hora + ART = custo {brl(preco.custo)} · margem {nf(preco.margem * 100, 0)}% → sugerido {brl(preco.precoTotal)}
              </p>
            ) : null}>

            <input className="field-input" value={form.valorProjeto} onChange={(e) => { precoTocado.current = true; set("valorProjeto", e.target.value); }} placeholder="Ex.: 8.000,00" />
          </Campo>
          <Campo className="sm:col-span-2" label="Impostos / NF (R$)">
            <input className="field-input" value={form.impostos} onChange={(e) => set("impostos", e.target.value)} />
          </Campo>
          <div className="sm:col-span-2 flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4" checked={form.incluirConexao} onChange={(e) => set("incluirConexao", e.target.checked)} />
              Incluir assessoria de conexão (2 SM = {brl(2 * parseBR(form.salarioMinimo))})
            </label>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
          <Kpi label="Projeto" value={brl(parseBR(form.valorProjeto))} />
          <Kpi label="Assessoria conexão" value={brl(conexaoValor)} />
          <Kpi label="Impostos / NF" value={brl(parseBR(form.impostos))} />
          <Kpi label="Total" value={brl(total)} destaque />
        </div>
      </section>

      {/* Condições de pagamento */}
      {/* `form.impostos` é valor em R$, não alíquota — a razão sobre o total é
          o que o cartão precisa. Total zero cai no imposto padrão. */}
      <EquipeResponsavelCard estado={equipe} />
      <EquipeResponsavelCard estado={equipeOrc} />

      <DetalhamentoPreco
        projeto={equipe}
        orcamento={equipeOrc}
        baseCent={Math.round(total * 100)}
        precoSemEquipeCent={Math.round(total * 100)}
        custos={[{ rotulo: "Impostos", valor: parseBR(form.impostos) }]}
      />

      <CondicoesPagamento total={total} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <Campo label="Objeto"><textarea className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></Campo>
          <Campo label="Condições gerais (uma por linha)"><textarea className="field-input min-h-[70px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></Campo>
          <Campo label="Prazo de execução"><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></Campo>
        </div>
      </details>

      {/* Parâmetros de preço (retraído; disponível a todos) */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">
          Parâmetros de preço (modelo por custo)
        </summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Preço = (horas × valor/hora + ART) × (1 + margem). Ao salvar, valem para todos os próximos cálculos.
        </p>
        <div className="mt-4">
          <SubestacaoParamsForm onSaved={aplicarParams} />
        </div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}
        </button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || !sizing || sizing.trafoKva === 0 || parseBR(form.valorProjeto) <= 0}>
          {gerando ? "Gerando…" : "Gerar .docx"}
        </button>
        <BaixarPlanilhaButton
          serviceKey="projeto-subestacao"
          nome={`projeto-subestacao-${form.clienteNome || "proposta"}`}
          disabled={!preco || !sizing || sizing.trafoKva === 0}
          dados={() => ({
            cliente: form.clienteNome,
            referencia: `Nº ${form.referenciaSeq}`,
            horas: preco?.horas ?? 0,
            valorHora: params?.valorHora ?? 150,
            art: params?.artProjeto ?? 500,
            margem: preco?.margem ?? params?.margemProjeto ?? 0.5,
            kVA: sizing?.trafoKva ?? 0,
          })}
        />
        <button className="btn-link" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
