"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QgbtParamsForm } from "./QgbtParamsForm";
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
  especificacao: string;
  qtdQuadros: number;
  custoUnitario: string;
  valorServico: string;
  objeto: string;
  prazoExecucao: string;
  observacoesExtra: string;
}

const OBJETO_PADRAO =
  "Fornecimento de Quadro Geral de Baixa Tensão (QGBT) montado, identificado e testado em bancada, conforme a especificação técnica do cliente e a ABNT NBR IEC 61439.";
const OBS_PADRAO = [
  "Montagem conforme a ABNT NBR IEC 61439.",
  "Quadro entregue montado, identificado e testado em bancada.",
  "Prazo de entrega condicionado ao fornecimento dos componentes.",
];

const FORM_INICIAL: Form = {
  clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: 1, dataEmissao: HOJE, validadeDias: 20, formaPagamento: "A combinar",
  especificacao: "", qtdQuadros: 1, custoUnitario: "",
  valorServico: "", objeto: OBJETO_PADRAO, prazoExecucao: "20 a 30 dias", observacoesExtra: OBS_PADRAO.join("\n"),
};

interface Preco {
  custoUnitario: number; qtdQuadros: number; custo: number; fatorK: number;
  custoSemEquipe: number; custoEquipe: number; faturamentoSemEquipe: number;
  faturamento: number; impostos: number; lucro: number; margem: number;
}

export function QgbtConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  const router = useRouter();
  // Fator K: as horas da GTA entram na base e o preço sobe. Ver `equipeFormaPreco`.
  const equipe = useEquipeResponsavel({ servicoKey: "qgbt", criadoPor });
  /** O tempo de montar ESTA proposta — existe mesmo se não fechar. */
  const equipeOrc = useEquipeResponsavel({ servicoKey: "qgbt", criadoPor, escopo: "orcamento" });
  // O engine recebe as duas frentes somadas: para o Fator K é um custo só.
  const custoEquipeTotal = equipe.custoEquipe + equipeOrc.custoEquipe;
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
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag; equipeGta?: unknown; equipeOrcamento?: unknown };
          setForm({ ...FORM_INICIAL, ...dados }); precoTocado.current = true; if (dados.equipeGta) equipe.restaurar(dados.equipeGta as EquipeSalva); if (dados.equipeOrcamento) equipeOrc.restaurar(dados.equipeOrcamento as EquipeSalva); 
          if (dados.cond) setCond(dados.cond as CondPag);
        }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=qgbt").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  // `custoEquipe` entra na chave: trocar o responsável precisa refazer o preço.
  const calcKey = JSON.stringify([form.custoUnitario, form.qtdQuadros, custoEquipeTotal, recalcNonce]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/qgbt/calcular", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ custoUnitario: parseBR(form.custoUnitario), qtdQuadros: form.qtdQuadros, custoEquipe: custoEquipeTotal }),
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

  function montarItens() {
    const qtd = form.qtdQuadros;
    const esp = form.especificacao.trim();
    return [{
      descricao: `Fornecimento de ${qtd > 1 ? `${qtd} QGBTs` : "QGBT"}${esp ? ` (${esp})` : ""} montado(s), identificado(s) e testado(s) em bancada, conforme a ABNT NBR IEC 61439`,
      valor: nf(valorServico, 2),
      condicao: "",
    }];
  }

  function montarObservacoes() {
    return form.observacoesExtra.split("\n").filter((l) => l.trim());
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true); setErro(null);
    try {
      const payload = { serviceKey: "qgbt", cliente: form.clienteNome, status: valorServico > 0 ? "precificada" : "rascunho", dados: { ...form, cond, equipeGta: equipe.serializar(), equipeOrcamento: equipeOrc.serializar() } };
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
    if (valorServico <= 0) { setErro("Informe o custo (ou o valor)."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf, localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, valorServico),
        titulo: "PROPOSTA TÉCNICA E COMERCIAL — FORNECIMENTO DE QGBT",
        objeto: form.objeto, prazoExecucao: form.prazoExecucao, itens: montarItens(), observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "qgbt", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "qgbt.docx"; a.click();
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
          <Campo className="sm:col-span-3" label="Local / obra"><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} /></Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)"><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} /></Campo>
          <Campo className="sm:col-span-2" label="Emissão"><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></Campo>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Especificação e custo */}
      <section className="section-card">
        <h2 className="section-title">Quadro e custo</h2>
        <p className="mt-1 subtitle">Informe o custo dos componentes + montagem por quadro. Preço = <strong>custo × Fator K</strong>.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Especificação (A / V)"><input className="field-input" value={form.especificacao} onChange={(e) => set("especificacao", e.target.value)} placeholder="Ex.: 350 A / 380 V IP55" /></Campo>
          <Campo className="sm:col-span-1" label="Nº de quadros"><input type="number" min={1} className="field-input" value={form.qtdQuadros} onChange={(e) => set("qtdQuadros", Math.max(1, Number(e.target.value)))} /></Campo>
          <Campo className="sm:col-span-2" label="Custo por quadro (R$)"><input className="field-input" inputMode="decimal" value={form.custoUnitario} onChange={(e) => set("custoUnitario", e.target.value)} placeholder="Ex.: 21.058" /></Campo>
        </div>

        {preco && preco.custo > 0 && (
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
            <button type="button" className="btn-link text-xs" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorServico: nf(preco.faturamento, 2) })); }}>Usar sugerido {brl(preco.faturamento)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Valor total (R$) *" hint={preco && preco.custo > 0 ? <p className="mt-1 hint">custo {brl(preco.custo)} × Fator K {nf(preco.fatorK, 2)} → sugerido {brl(preco.faturamento)}</p> : null}>
            <input className="field-input" value={form.valorServico} onChange={(e) => { precoTocado.current = true; set("valorServico", e.target.value); }} placeholder="Ex.: 32.700,00" />
          </Campo>
          <div className="sm:col-span-3 flex items-end">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(valorServico)}</div>
            </div>
          </div>
        </div>

        {preco && preco.custo > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Composição do faturamento (uso interno)</p>
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Materiais e montagem" value={brl(preco.custoSemEquipe)} />
              <Kpi label="Equipe GTA" value={brl(preco.custoEquipe)} />
              <Kpi label="Custo total" value={brl(preco.custo)} />
              <Kpi label="Fator K (markup)" value={`× ${nf(preco.fatorK, 2)}`} />
              <Kpi label="Faturamento" value={brl(preco.faturamento)} destaque />
              <Kpi label="Impostos/NF" value={brl(preco.impostos)} />
              <Kpi label="Lucro líquido" value={brl(preco.lucro)} />
              <Kpi label="Margem líquida" value={`${nf(preco.margem * 100, 1)}%`} destaque />
            </div>
            <p className="mt-1 hint">Faturamento = custo × Fator K. Ajuste o Fator K e os impostos em “Parâmetros de preço”.</p>
          </div>
        )}
      </section>

      <EquipeResponsavelCard estado={equipe} />
      <EquipeResponsavelCard estado={equipeOrc} />

      {preco && (
        <DetalhamentoPreco
          projeto={equipe}
          orcamento={equipeOrc}
          baseCent={Math.round(preco.faturamento * 100)}
          precoSemEquipeCent={Math.round(preco.faturamentoSemEquipe * 100)}
          custos={[
            { rotulo: "Materiais e montagem", valor: preco.custoSemEquipe },
            { rotulo: "Impostos / NF", valor: preco.impostos },
          ]}
        />
      )}

      <CondicoesPagamento total={valorServico} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <Campo label="Objeto"><textarea className="field-input min-h-[70px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></Campo>
          <Campo label="Condições gerais (uma por linha)"><textarea className="field-input min-h-[90px]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} /></Campo>
          <Campo label="Prazo de execução"><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></Campo>
          <p className="hint">A forma de pagamento é montada na seção “Condições de pagamento” acima.</p>
        </div>
      </details>

      {/* Parâmetros */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (Fator K, impostos)</summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Faturamento = custo × Fator K. Padrão GTA: Fator K 1,55 e NF 15% → margem ≈ 20%.</p>
        <div className="mt-4"><QgbtParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || valorServico <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton serviceKey="qgbt" disabled={valorServico <= 0} nome={`qgbt-${form.clienteNome || "proposta"}`} dados={() => ({
          cliente: form.clienteNome,
          especificacao: form.especificacao,
          custoUnitario: parseBR(form.custoUnitario),
          qtdQuadros: form.qtdQuadros,
          custo: preco?.custo,
          valorServico,
          fatorK: preco?.fatorK ?? 1.55,
          aliqImpostos: preco && preco.faturamento > 0 ? preco.impostos / preco.faturamento : 0.15,
        })} />
        <button className="btn-link" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
