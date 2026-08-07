"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjetoBtParamsForm } from "./ProjetoBtParamsForm";
import { CondicoesPagamento, montarFormaPagamento, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";

import { Alert } from "@/components/ui";
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

/**
 * Disciplinas do projeto elétrico BT. Fiéis às propostas reais (CCB, Geolab):
 * força e iluminação são separáveis (Geolab cotou só força); marcar as duas
 * equivale ao "projeto predial completo".
 * `frag` = fragmento usado para compor o objeto dinâmico da proposta.
 */
const DISCIPLINAS = [
  { id: "forca", nome: "Força — tomadas (TUG/TUE)", taxaM2: 11, piso: 2500, ajuda: "Circuitos de tomadas de uso geral e específico.", descricao: "Projeto elétrico de força — dimensionamento e individualização dos circuitos de tomadas de uso geral (TUG) e específico (TUE)", frag: "projeto elétrico de força (circuitos de tomadas de uso geral e específico)" },
  { id: "iluminacao", nome: "Iluminação (luminotécnico)", taxaM2: 7, piso: 2000, ajuda: "Circuitos e pontos de iluminação.", descricao: "Projeto luminotécnico — dimensionamento dos circuitos e pontos de iluminação", frag: "projeto luminotécnico" },
  { id: "telecom", nome: "Telecom / cabeamento estruturado", taxaM2: 5, piso: 2000, ajuda: "Rede lógica e telefonia. Histórico (CCB): R$ 6.150.", descricao: "Projeto de telecomunicação e cabeamento estruturado (rede lógica e telefonia)", frag: "projeto de telecomunicações e cabeamento estruturado" },
  { id: "retrofit", nome: "Retrofit / adequação de existente", taxaM2: 10, piso: 2500, ajuda: "Modernização e correção de não conformidades da instalação existente.", descricao: "Retrofit e adequação da instalação elétrica predial existente, com correção de não conformidades", frag: "retrofit e adequação da instalação elétrica predial existente" },
] as const;

type Disciplina = (typeof DISCIPLINAS)[number];

/**
 * Preço por disciplina = área (m²) × taxa R$/m² × multiplicador do tipo,
 * com piso mínimo. Taxas ancoradas no CPMG Itapuranga (677 m² → ~R$ 18/m² do
 * projeto elétrico predial) e repartidas por disciplina. Multiplicador industrial
 * (Geolab) sobe a complexidade de força/iluminação.
 */
const TIPOS = [
  { id: "comercial", nome: "Residencial / Comercial" },
  { id: "industrial", nome: "Industrial" },
] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Taxas/pisos por disciplina + multiplicador industrial (ajustáveis em /api/projeto-bt/config). */
type PrecoParams = Record<string, number>;
/** Fallback client até a API carregar = os defaults das DISCIPLINAS. */
const PARAMS_DEFAULT: PrecoParams = {
  ...Object.fromEntries(DISCIPLINAS.flatMap((d) => [[`taxa${cap(d.id)}`, d.taxaM2], [`piso${cap(d.id)}`, d.piso]])),
  multIndustrial: 1.4,
};
/** Sugestão de preço = área × taxa × mult(tipo), arredondada a R$ 10, com piso. */
function sugestaoDisc(d: Disciplina, areaM2: number, tipoId: string, params: PrecoParams): number {
  const taxa = params[`taxa${cap(d.id)}`] ?? d.taxaM2;
  const piso = params[`piso${cap(d.id)}`] ?? d.piso;
  const mult = tipoId === "industrial" ? (params.multIndustrial ?? 1.4) : 1;
  return Math.max(Math.round((areaM2 * taxa * mult) / 10) * 10, piso);
}

type Vals = Record<string, string>;

/** Junta em PT: [a]→"a"; [a,b]→"a e b"; [a,b,c]→"a, b e c". */
function juntarPt(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}

/**
 * Objeto DINÂMICO: compõe o texto a partir das disciplinas marcadas. Força +
 * iluminação juntas viram "projeto elétrico predial (força e iluminação)".
 */
function fragOf(id: string): string {
  return DISCIPLINAS.find((d) => d.id === id)?.frag ?? "";
}
function montarObjeto(ids: string[]): string {
  const frags: string[] = [];
  const temForca = ids.includes("forca");
  const temIlum = ids.includes("iluminacao");
  // Força + iluminação juntas = "projeto predial completo".
  if (temForca && temIlum) frags.push("projeto elétrico predial de baixa tensão (força e iluminação)");
  else {
    if (temForca) frags.push(fragOf("forca"));
    if (temIlum) frags.push(fragOf("iluminacao"));
  }
  if (ids.includes("telecom")) frags.push(fragOf("telecom"));
  if (ids.includes("retrofit")) frags.push(fragOf("retrofit"));
  if (frags.length === 0) return "Elaboração de projeto elétrico de baixa tensão em conformidade com a ABNT NBR 5410, com pranchas técnicas, memoriais, lista de quantitativos e ART junto ao CREA/GO.";
  return `Elaboração ${juntarPt(frags.map((f) => `do ${f}`))}, em conformidade com a ABNT NBR 5410, com pranchas técnicas (DWG/PDF), memoriais descritivo e de cálculo, lista de quantitativos e ART junto ao CREA/GO.`;
}
const OBS_PADRAO = [
  "Projeto conforme a ABNT NBR 5410 e demais normas técnicas aplicáveis.",
  "Inclui até 2 (duas) revisões por adequação de escopo dentro do objeto contratado.",
  "Emissão de ART inclusa; emolumentos do CREA/GO por conta do contratante.",
  "Não inclui execução física, fornecimento de materiais nem projeto de SPDA/subestação (orçados à parte).",
];

/** Condição de pagamento padrão do Projeto BT (20/50/30). */
const COND_PADRAO_BT: CondPag = {
  modo: "parcelas",
  parcelas: [
    { pct: "20", texto: "na assinatura do contrato" },
    { pct: "50", texto: "na entrega do projeto executivo" },
    { pct: "30", texto: "após a aprovação do projeto" },
  ],
};

export function ProjetoBtConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  // Por métrica (valor por disciplina): as horas não somam ao preço.
  const equipe = useEquipeResponsavel({ servicoKey: "projeto-bt", criadoPor });
  /** O tempo de montar ESTA proposta — existe mesmo se o cliente não fechar. */
  const equipeOrc = useEquipeResponsavel({ servicoKey: "projeto-bt", criadoPor, escopo: "orcamento" });
  const router = useRouter();

  const inicial = (): Vals => ({
    clienteNome: "", cidadeUf: "", localAtividade: "", porte: "",
    referenciaSeq: "1", dataEmissao: HOJE, validadeDias: "20",
    formaPagamento: "20% na assinatura, 50% na entrega do projeto executivo e 30% na aprovação",
    objeto: montarObjeto(["forca", "iluminacao"]), prazoExecucao: "60 dias corridos após a assinatura do contrato",
    observacoesExtra: OBS_PADRAO.join("\n"),
    areaM2: "", tipo: "comercial", custoExecucao: "",
    // disciplinas: on/valor por id (padrão: predial completo = força + iluminação;
    // valor inicial = sugestão a área 0, que cai no piso)
    ...Object.fromEntries(DISCIPLINAS.flatMap((d) => [[`on_${d.id}`, d.id === "forca" || d.id === "iluminacao" ? "1" : ""], [`v_${d.id}`, String(d.piso)]])),
  });

  const [form, setForm] = useState<Vals>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  // Objeto: enquanto o vendedor não editar o texto à mão, ele é recomposto
  // automaticamente a partir das disciplinas marcadas.
  const objetoTocado = useRef(false);
  // Disciplinas cujo valor o vendedor editou à mão (não sobrescrever c/ a sugestão).
  const valoresTocados = useRef<Set<string>>(new Set());
  // Taxas R$/m² por disciplina — carregadas dos parâmetros salvos (admin).
  const [params, setParams] = useState<PrecoParams>(PARAMS_DEFAULT);
  // Condições de pagamento (tabela de parcelas ou "A combinar").
  const [cond, setCond] = useState<CondPag>(COND_PADRAO_BT);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (id: string) => setForm((f) => ({ ...f, [`on_${id}`]: f[`on_${id}`] ? "" : "1" }));

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Record<string, unknown>;
          setForm((f) => ({ ...f, ...(dados as Vals) }));
          if (dados.cond && typeof dados.cond === "object") setCond(dados.cond as CondPag);
          else if (Array.isArray(dados.parcelas) && dados.parcelas.length) setCond({ modo: "parcelas", parcelas: dados.parcelas as CondPag["parcelas"] });
          objetoTocado.current = true;
          DISCIPLINAS.forEach((di) => valoresTocados.current.add(di.id));
        }
      }).catch(() => {});
    } else {
      fetch(`/api/propostas/proximo?serviceKey=projeto-bt`).then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: String(d.seq) }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propostaId]);

  // Parâmetros de preço salvos (taxas R$/m² por disciplina).
  useEffect(() => {
    fetch("/api/projeto-bt/config").then((r) => r.json()).then((d) => { if (d.params) setParams(d.params as PrecoParams); }).catch(() => {});
  }, []);

  // Disciplinas marcadas (ids) — dispara a recomposição do objeto.
  const idsSelecionados = DISCIPLINAS.filter((d) => form[`on_${d.id}`]).map((d) => d.id).join(",");
  useEffect(() => {
    if (objetoTocado.current) return;
    setForm((f) => ({ ...f, objeto: montarObjeto(idsSelecionados ? idsSelecionados.split(",") : []) }));
  }, [idsSelecionados]);

  // Valor por disciplina: auto-preenchido pela sugestão (área × taxa × mult, com
  // piso) até o vendedor editar aquela disciplina à mão. Recalcula ao mudar área,
  // tipo ou os parâmetros salvos.
  const areaM2 = parseBR(form.areaM2);
  const tipoId = form.tipo || "comercial";
  useEffect(() => {
    setForm((f) => {
      const next = { ...f };
      for (const d of DISCIPLINAS) {
        if (!valoresTocados.current.has(d.id)) next[`v_${d.id}`] = nf(sugestaoDisc(d, areaM2, tipoId, params), 2);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaM2, tipoId, params]);
  const setValorDisc = (id: string, v: string) => { valoresTocados.current.add(id); set(`v_${id}`, v); };
  const aplicarParams = (p: PrecoParams) => setParams(p);

  const porteSufixo = form.porte?.trim() ? ` — ${form.porte.trim()}` : "";
  const selecionadas = DISCIPLINAS.filter((d) => form[`on_${d.id}`]);
  const total = selecionadas.reduce((s, d) => s + parseBR(form[`v_${d.id}`]), 0);
  const custoExec = parseBR(form.custoExecucao);
  const pctExec = custoExec > 0 ? (total / custoExec) * 100 : null;

  function montarItens() {
    return selecionadas.map((d) => ({ descricao: `${d.descricao}${porteSufixo}`, valor: nf(parseBR(form[`v_${d.id}`]), 2), condicao: "" }));
  }
  function montarObservacoes() {
    return (form.observacoesExtra ?? "").split("\n").filter((l) => l.trim());
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true); setErro(null);
    try {
      const payload = { serviceKey: "projeto-bt", cliente: form.clienteNome, status: total > 0 ? "precificada" : "rascunho", dados: { ...form, cond } };
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
    if (selecionadas.length === 0) { setErro("Selecione ao menos uma disciplina."); return; }
    if (total <= 0) { setErro("Informe o valor das disciplinas selecionadas."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, total),
        titulo: "PROPOSTA TÉCNICA E COMERCIAL — PROJETO ELÉTRICO DE BAIXA TENSÃO",
        objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "projeto-bt", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "projeto-bt.docx"; a.click();
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
          <Campo className="sm:col-span-3" label="Nome do cliente *"><ClienteInput value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} /></Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF *"><input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" /></Campo>
          <Campo className="sm:col-span-3" label="Local / obra"><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} /></Campo>
          <Campo className="sm:col-span-3" label="Porte / referência"><input className="field-input" value={form.porte} onChange={(e) => set("porte", e.target.value)} placeholder="Ex.: edifício 21 pav. / 800 m² / galpão industrial" /></Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)"><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", e.target.value)} /></Campo>
          <Campo className="sm:col-span-2" label="Emissão"><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></Campo>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar. O porte entra na descrição de cada disciplina.</p>
      </section>

      {/* Disciplinas */}
      {/* Porte do projeto (dirige o preço por m²) */}
      <section className="section-card">
        <h2 className="section-title">Porte do projeto</h2>
        <p className="mt-1 subtitle">A <strong>área construída</strong> dirige a sugestão de preço de cada disciplina (R$/m²). Em branco, cada disciplina parte do piso e você ajusta à mão.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Área construída (m²)">
            <input className="field-input" inputMode="decimal" value={form.areaM2} onChange={(e) => set("areaM2", e.target.value)} placeholder="Ex.: 800" />
          </Campo>
          <Campo className="sm:col-span-2" label="Tipo de edificação">
            <select className="field-input" value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.id === "industrial" ? ` (×${nf(params.multIndustrial ?? 1.4, 1)})` : ""}</option>)}
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label={<>Custo de execução (R$) <span className="font-normal text-slate-500 dark:text-slate-400">— opcional</span></>}>
            <input className="field-input" inputMode="decimal" value={form.custoExecucao} onChange={(e) => set("custoExecucao", e.target.value)} placeholder="p/ conferir o % (honorário/obra)" />
          </Campo>
        </div>
      </section>

      {/* Disciplinas */}
      <section className="section-card">
        <h2 className="section-title">Disciplinas do projeto</h2>
        <p className="mt-1 subtitle">Marque as disciplinas contratadas — cada uma vira um item na proposta, precificada pela área. O valor é editável por disciplina.</p>
        <div className="mt-4 space-y-2">
          {DISCIPLINAS.map((d) => {
            const on = !!form[`on_${d.id}`];
            const taxa = params[`taxa${cap(d.id)}`] ?? d.taxaM2;
            const mult = tipoId === "industrial" ? (params.multIndustrial ?? 1.4) : 1;
            const sug = sugestaoDisc(d, areaM2, tipoId, params);
            const editado = valoresTocados.current.has(d.id);
            return (
              <div key={d.id} className={`rounded-lg border p-3 transition ${on ? "border-gta-indigo/40 bg-indigo-50/40 dark:border-indigo-400/30 dark:bg-indigo-500/10" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-gta-indigo dark:text-indigo-300 focus:ring-gta-indigo" checked={on} onChange={() => toggle(d.id)} />
                    <span>
                      <span className="block text-sm font-medium text-gta-navy dark:text-slate-100">{d.nome}</span>
                      <span className="block hint">{d.ajuda}</span>
                    </span>
                  </label>
                  <div className="w-full sm:w-48">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400">R$</span>
                      {/* O rótulo visível é a caixa de seleção da disciplina, à
                          esquerda; sem `aria-label` o campo de valor é anunciado
                          sem dizer a qual disciplina pertence. */}
                      <input className="field-input pl-8 text-right" inputMode="decimal" aria-label={`Valor de ${d.nome}`} value={form[`v_${d.id}`] ?? ""} disabled={!on} onChange={(e) => setValorDisc(d.id, e.target.value)} />
                    </div>
                    {on && (
                      <p className="mt-1 flex items-center justify-end gap-1.5 text-right text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{areaM2 > 0 ? `${brl(taxa)}/m² × ${nf(areaM2, 0)}${mult !== 1 ? ` × ${nf(mult, 1)}` : ""} → ` : `piso `}{brl(sug)}</span>
                        {/* Alvo inline dentro de uma legenda de 11px: aqui `.btn-link` não serve,
                            porque forçaria text-sm e 24px de altura no meio da frase. A
                            WCAG isenta alvo embutido em texto corrido. */}
                        {editado && <button type="button" className="text-gta-indigo underline dark:text-indigo-300" onClick={() => { valoresTocados.current.delete(d.id); set(`v_${d.id}`, nf(sug, 2)); }}>usar</button>}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md bg-gta-navy p-3 text-white shadow-sm">
          <div className="text-sm text-slate-300">Total do projeto ({selecionadas.length} {selecionadas.length === 1 ? "disciplina" : "disciplinas"})</div>
          <div className="text-xl font-bold">{brl(total)}</div>
        </div>
        {pctExec !== null && (
          <p className={`mt-2 text-xs ${pctExec < 1.5 || pctExec > 6 ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-400"}`}>
            Conferência: honorário = <strong>{nf(pctExec, 2)}%</strong> do custo de execução informado. Referência real (CPMG): ~2,4%; faixa usual de projeto: 2–6%.
          </p>
        )}
        <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
          <span className="font-medium text-slate-600 dark:text-slate-300">Objeto{objetoTocado.current ? " (editado)" : ""}:</span> {form.objeto}
        </p>
      </section>

      <EquipeResponsavelCard estado={equipe} />
      <EquipeResponsavelCard estado={equipeOrc} />

      {/* Sem alíquota própria: usa a padrão da plataforma, que o hook traz. */}
      <DetalhamentoPreco
        projeto={equipe}
        orcamento={equipeOrc}
        baseCent={Math.round(total * 100)}
        precoSemEquipeCent={Math.round(total * 100)}
        custos={[{ rotulo: "Impostos", valor: total * equipe.impostoPadrao }]}
      />

      <CondicoesPagamento total={total} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between">
              {/* fora do <Campo> porque o rótulo divide a linha com o botão
                  "Recompor automático"; a associação vai no id explícito. */}
              <label htmlFor="projeto-bt-objeto" className="field-label">Objeto <span className="font-normal text-slate-500 dark:text-slate-400">(gerado a partir das disciplinas)</span></label>
              {objetoTocado.current && (
                <button type="button" className="btn-link text-xs" onClick={() => { objetoTocado.current = false; setForm((f) => ({ ...f, objeto: montarObjeto(idsSelecionados ? idsSelecionados.split(",") : []) })); }}>Recompor automático</button>
              )}
            </div>
            <textarea id="projeto-bt-objeto" className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => { objetoTocado.current = true; set("objeto", e.target.value); }} />
          </div>
          <Campo label="Condições gerais (uma por linha)"><textarea className="field-input min-h-[110px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></Campo>
          <Campo label="Prazo de entrega"><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></Campo>
          <p className="hint">A forma de pagamento é montada na seção “Condições de pagamento” acima.</p>
        </div>
      </details>

      {/* Parâmetros de preço (taxas R$/m²) */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (taxas R$/m² por disciplina)</summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Padrão ancorado no CPMG (677 m² → ~R$ 18/m² do predial elétrico). Ao salvar, valem para todas as novas propostas de Projeto BT.</p>
        <div className="mt-4"><ProjetoBtParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || total <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton serviceKey="projeto-bt" disabled={selecionadas.length === 0} nome={`projeto-bt-${form.clienteNome || "proposta"}`} dados={() => ({
          cliente: form.clienteNome,
          referencia: form.referenciaSeq ? String(form.referenciaSeq) : undefined,
          area: areaM2,
          mult: tipoId === "industrial" ? (params.multIndustrial ?? 1.4) : 1,
          disciplinas: selecionadas.map((d) => ({
            nome: d.nome,
            taxaM2: params[`taxa${cap(d.id)}`] ?? d.taxaM2,
            piso: params[`piso${cap(d.id)}`] ?? d.piso,
          })),
        })} />
        <button className="btn-link" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {statusMsg && <span className="text-sm text-green-600 dark:text-green-400">{statusMsg}</span>}
      </div>
    </div>
  );
}
