"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CarregadorParamsForm } from "./CarregadorParamsForm";
import { CopyButton } from "@/components/CopyButton";
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

/** Classes comerciais de carregadores AC (mono ≤ 7,4 kW; tri 11/22 kW). */
const PRESETS: { label: string; kw: string; fase: "mono" | "tri" }[] = [
  { label: "3,7 kW mono", kw: "3.7", fase: "mono" },
  { label: "7,4 kW mono", kw: "7.4", fase: "mono" },
  { label: "11 kW tri", kw: "11", fase: "tri" },
  { label: "22 kW tri", kw: "22", fase: "tri" },
];

interface Form {
  clienteNome: string;
  cidadeUf: string;
  localAtividade: string;
  referenciaSeq: number;
  dataEmissao: string;
  validadeDias: number;
  formaPagamento: string;
  potenciaKw: string;
  fase: "mono" | "tri";
  distanciaM: string;
  qtdPontos: number;
  protecaoCcIntegrada: boolean;
  valorServico: string;
  valorEquipamento: string;
  subtitulo: string;
  objeto: string;
  textoObjetivo: string;
  prazoExecucao: string;
}

const SUBTITULO_PADRAO = "INFRAESTRUTURA PARA CARREGAMENTO DE VEÍCULO ELÉTRICO  ·  NBR 5410 / NBR 17019";
const OBJETO_PADRAO =
  "Implantação de ponto(s) de carregamento para veículos elétricos, contemplando projeto, infraestrutura elétrica, proteções, aterramento, instalação, parametrização e ART, conforme a ABNT NBR 5410.";
const OBJETIVO_PADRAO =
  "A presente proposta tem como objetivo a implantação da infraestrutura elétrica para carregamento de veículo(s) elétrico(s), contemplando o dimensionamento conforme a ABNT NBR 5410 e a NBR 17019, o fornecimento e a instalação dos materiais, as proteções elétricas, o aterramento dedicado e a parametrização do(s) ponto(s) de recarga, com segurança e em conformidade com as normas técnicas vigentes.";

const FORM_INICIAL: Form = {
  clienteNome: "", cidadeUf: "", localAtividade: "", referenciaSeq: 1, dataEmissao: HOJE, validadeDias: 20, formaPagamento: "A combinar",
  potenciaKw: "7.4", fase: "mono", distanciaM: "20", qtdPontos: 1, protecaoCcIntegrada: true,
  valorServico: "", valorEquipamento: "0",
  subtitulo: SUBTITULO_PADRAO, objeto: OBJETO_PADRAO, textoObjetivo: OBJETIVO_PADRAO, prazoExecucao: "15 a 30 dias",
};

interface Sizing {
  tensao: number; correnteNominal: number; correnteProjeto: number; disjuntorA: number;
  polos: number; secaoMm2: number; quedaPct: number; nCondutores: number; nDps: number; eletroduto: string; drTipo: "A" | "B";
}
interface BomItem { categoria: string; descricao: string; unidade: string; qtd: number; precoUnit: number; precoTotal: number }
interface Bom { itens: BomItem[]; custoMateriais: number }
/** Linha editável da lista de materiais (qtd/preço como texto p/ edição). */
interface MatRow { categoria: string; descricao: string; unidade: string; qtd: string; precoUnit: string }
interface Params { maoObraPorPonto: number; fatorK: number; aliqImpostos: number }

const seedRow = (it: BomItem): MatRow => ({
  categoria: it.categoria, descricao: it.descricao, unidade: it.unidade,
  qtd: String(it.qtd), precoUnit: nf(it.precoUnit, 2),
});
const rowTotal = (m: MatRow) => parseBR(m.qtd) * parseBR(m.precoUnit);
const serializarBom = (itens: MatRow[]) => itens.map((m) => `${m.qtd}|${m.descricao}|${m.precoUnit}`).join("\n");

export function CarregadorConfigurator({ propostaId }: { propostaId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [sizing, setSizing] = useState<Sizing | null>(null);
  const [bom, setBom] = useState<Bom | null>(null);
  const [materiais, setMateriais] = useState<MatRow[]>([]);
  const [params, setParams] = useState<Params | null>(null);
  const [recalcNonce, setRecalcNonce] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  const precoTocado = useRef(false);
  /**
   * A lista segue a sugestão do cálculo ATÉ o usuário mexer nela; a partir daí
   * é dele e nenhum recálculo sobrescreve o que foi digitado. Vale ainda mais
   * aqui, onde o PREÇO sai da lista editada.
   */
  const matTocado = useRef(false);
  /** Sugestão vigente quando a edição começou — base para avisar que o
   *  dimensionamento mudou depois disso. */
  const bomNaEdicao = useRef("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const aplicarParams = () => { precoTocado.current = false; setRecalcNonce((n) => n + 1); };

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        const dados = d.proposta?.dados as (Partial<Form> & { materiais?: MatRow[]; cond?: CondPag }) | undefined;
        if (dados) {
          setForm({ ...FORM_INICIAL, ...dados });
          precoTocado.current = true;
          if (dados.cond) setCond(dados.cond as CondPag);
          // Lista salva é escolha do usuário: entra já "tocada".
          if (Array.isArray(dados.materiais) && dados.materiais.length) { setMateriais(dados.materiais); matTocado.current = true; }
        }
      }).catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=carregador").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  const calcKey = JSON.stringify([form.potenciaKw, form.fase, form.distanciaM, form.qtdPontos, form.protecaoCcIntegrada, recalcNonce]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (parseBR(form.potenciaKw) <= 0) { setSizing(null); setBom(null); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/carregador/calcular", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ potenciaKw: parseBR(form.potenciaKw), fase: form.fase, distanciaM: parseBR(form.distanciaM), qtdPontos: form.qtdPontos, protecaoCcIntegrada: form.protecaoCcIntegrada }),
        });
        if (res.ok) {
          const d = await res.json();
          setSizing(d.sizing); setBom(d.bom); setParams(d.params);
          // Re-semeia a lista SÓ enquanto o usuário não mexeu nela; depois
          // disso sobrescrever apagaria o que ele digitou.
          if (!matTocado.current) setMateriais(d.bom.itens.map(seedRow));
          else if (!bomNaEdicao.current) bomNaEdicao.current = serializarBom(d.bom.itens.map(seedRow));
        }
      } catch { /* ignora */ }
    }, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  // ---- preço recalculado a partir da lista EDITADA (mesma fórmula do engine) ----
  const custoMateriais = materiais.reduce((s, m) => s + rowTotal(m), 0);
  const preco = params
    ? (() => {
        const maoObra = params.maoObraPorPonto * Math.max(1, form.qtdPontos);
        const custoGeral = custoMateriais + maoObra;
        const faturamento = Math.round((custoGeral * params.fatorK) / 10) * 10;
        const impostos = faturamento * params.aliqImpostos;
        const lucro = faturamento - impostos - custoGeral;
        const margem = faturamento > 0 ? lucro / faturamento : 0;
        return { custoMateriais, maoObra, custoGeral, fatorK: params.fatorK, preco: faturamento, impostos, lucro, margem };
      })()
    : null;

  // sugere o valor do serviço quando o usuário ainda não editou o preço
  const sugerido = preco?.preco ?? 0;
  useEffect(() => {
    if (!precoTocado.current && sugerido > 0) setForm((f) => ({ ...f, valorServico: nf(sugerido, 2) }));
  }, [sugerido]);

  const totalCliente = parseBR(form.valorServico) + parseBR(form.valorEquipamento);

  // edição da lista de materiais
  /** Primeira edição: a lista passa a ser do usuário e guarda a sugestão da hora. */
  const marcarTocado = () => {
    if (matTocado.current) return;
    matTocado.current = true;
    bomNaEdicao.current = serializarBom(bom ? bom.itens.map(seedRow) : []);
  };
  const setMat = (i: number, k: keyof MatRow, v: string) => { marcarTocado(); setMateriais((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: v } : m))); };
  const addMat = () => { marcarTocado(); setMateriais((ms) => [...ms, { categoria: "Diversos", descricao: "", unidade: "un", qtd: "1", precoUnit: "0" }]); };
  const removeMat = (i: number) => { marcarTocado(); setMateriais((ms) => ms.filter((_, j) => j !== i)); };
  const restaurarSugestao = () => {
    if (!bom) return;
    matTocado.current = false;
    bomNaEdicao.current = "";
    setMateriais(bom.itens.map(seedRow));
  };
  /** O dimensionamento mudou depois que a edição começou? */
  const listaDesatualizada = useMemo(() => {
    if (!matTocado.current || !bom?.itens?.length || !bomNaEdicao.current) return false;
    return serializarBom(bom.itens.map(seedRow)) !== bomNaEdicao.current;
    // `materiais` entra de propósito: as refs mudam junto com ela, e sem isso
    // o aviso ficaria preso no valor antigo após "Restaurar sugestão".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bom, materiais]);

  function montarMateriais() {
    return materiais
      .filter((m) => m.descricao.trim())
      .map((m) => ({ qtde: `${m.qtd} ${m.unidade}`.trim(), descricao: m.descricao }));
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) { setErro("Informe o nome do cliente para salvar."); return null; }
    setSalvando(true); setErro(null);
    try {
      const payload = { serviceKey: "carregador", cliente: form.clienteNome, status: totalCliente > 0 ? "precificada" : "rascunho", dados: { ...form, materiais, cond } };
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
    if (!sizing) { setErro("Informe a potência do carregador para dimensionar."); return; }
    if (!form.clienteNome) { setErro("Informe o nome do cliente."); return; }
    if (!form.cidadeUf) { setErro("Informe a Cidade/UF."); return; }
    if (parseBR(form.valorServico) <= 0) { setErro("Informe o valor do serviço."); return; }
    setGerando(true); setErro(null);
    try {
      let id = savedId;
      if (!id) { id = (await salvar(true)) ?? undefined; if (!id) return; }
      const formData = {
        clienteNome: form.clienteNome, cidadeUf: form.cidadeUf,
        referenciaSeq: form.referenciaSeq, dataEmissao: form.dataEmissao, validadeDias: form.validadeDias, formaPagamento: montarFormaPagamento(cond, totalCliente),
        subtitulo: form.subtitulo, objeto: form.objeto, textoObjetivo: form.textoObjetivo,
        potenciaKw: form.potenciaKw, sizing, materiais: montarMateriais(),
        valorServico: form.valorServico, valorEquipamento: form.valorEquipamento,
        prazoExecucao: form.prazoExecucao,
      };
      const res = await fetch("/api/gerar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: "carregador", formData, propostaId: id }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Falha ao gerar."); }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : "carregador.docx"; a.click();
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
          <div className="sm:col-span-3"><label className="field-label">Local da instalação</label><input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} placeholder="Ex.: Garagem — vaga 12" /></div>
          <div className="sm:col-span-1"><label className="field-label">Validade (dias)</label><input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} /></div>
          <div className="sm:col-span-2"><label className="field-label">Emissão</label><input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} /></div>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Dados do carregador */}
      <section className="section-card">
        <h2 className="section-title">Carregador e infraestrutura</h2>
        <p className="mt-1 subtitle">O sistema dimensiona a proteção e o cabo (NBR 5410) e sugere a lista de materiais.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="btn-secondary !py-2 text-xs sm:!py-1.5" onClick={() => setForm((f) => ({ ...f, potenciaKw: p.kw, fase: p.fase }))}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><label className="field-label">Potência (kW) *</label><input className="field-input" inputMode="decimal" value={form.potenciaKw} onChange={(e) => set("potenciaKw", e.target.value)} placeholder="Ex.: 7,4 / 11 / 22" /></div>
          <div className="sm:col-span-2">
            <label className="field-label">Alimentação</label>
            <select className="field-input" value={form.fase} onChange={(e) => set("fase", e.target.value as Form["fase"])}>
              <option value="mono">Monofásico (220 V)</option>
              <option value="tri">Trifásico (380 V)</option>
            </select>
          </div>
          <div className="sm:col-span-1"><label className="field-label">Distância (m)</label><input className="field-input" inputMode="decimal" value={form.distanciaM} onChange={(e) => set("distanciaM", e.target.value)} /></div>
          <div className="sm:col-span-1"><label className="field-label">Nº de pontos</label><input type="number" className="field-input" value={form.qtdPontos} onChange={(e) => set("qtdPontos", Number(e.target.value))} /></div>
          <div className="sm:col-span-6">
            <label className="field-label">Proteção diferencial (NBR 17019)</label>
            <select className="field-input" value={form.protecaoCcIntegrada ? "sim" : "nao"} onChange={(e) => set("protecaoCcIntegrada", e.target.value === "sim")}>
              <option value="sim">Carregador com detecção de 6 mA CC integrada → DR Tipo A</option>
              <option value="nao">Sem detecção integrada → DR Tipo B (obrigatório)</option>
            </select>
            <p className="mt-1 hint">A NBR 17019 proíbe DR Tipo AC. A maioria dos WallBox (WEG, Intelbras, Wallbox) tem detecção de 6 mA CC integrada.</p>
          </div>
        </div>

        {sizing && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Disjuntor" value={`${sizing.disjuntorA} A · ${sizing.polos}P`} destaque />
            <Kpi label="Corrente nominal" value={`${nf(sizing.correnteNominal, 1)} A`} />
            <Kpi label="Corrente de projeto" value={`${nf(sizing.correnteProjeto, 1)} A`} />
            <Kpi label="Condutor" value={`${sizing.nCondutores} × ${sizing.secaoMm2} mm²`} />
            <Kpi label="Eletroduto" value={sizing.eletroduto} />
            <Kpi label="Queda de tensão" value={`${nf(sizing.quedaPct * 100, 2)}%`} />
            <Kpi label="DR (NBR 17019)" value={`Tipo ${sizing.drTipo} · ${sizing.disjuntorA} A`} />
            <Kpi label="DPS" value={`${sizing.nDps} × Classe II`} />
          </div>
        )}
        {!sizing && (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">Informe a <strong>potência</strong> para dimensionar.</p>
        )}
      </section>

      {/* Lista de materiais editável */}
      {materiais.length > 0 && (
        <section className="section-card">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title">Lista de materiais (custo interno)</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={restaurarSugestao}>Restaurar sugestão</button>
              <CopyButton label="Copiar lista" text={() => materiais.map((m) => `${m.qtd}\t${m.unidade}\t${m.descricao}`).join("\n")} />
            </div>
          </div>
          <p className="mt-1 subtitle">
            Sugestão a partir dos orçamentos da GTA — <strong>edite quantidades e preços</strong> (mudam com frequência). Custo total: <strong>{brl(custoMateriais)}</strong>.
          </p>
          {/* Editada, a lista para de acompanhar o cálculo (senão apagaria o que
              foi digitado). Aqui o PREÇO sai dela, então avisar é essencial. */}
          {listaDesatualizada && (
            <Alert tone="amber" className="mt-2">
              O dimensionamento mudou depois que você editou esta lista — ela não acompanha mais o cálculo, e o custo
              acima vem dela. Confira os itens ou{" "}
              <button type="button" className="toque font-semibold underline" onClick={restaurarSugestao}>
                restaure a sugestão
              </button>
              {" "}(isso descarta suas edições).
            </Alert>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="table-compacta min-w-[560px]">
              <thead>
                <tr>
                  <th className="py-1 pr-2 font-medium">Material</th>
                  <th className="w-16 px-1 font-medium">Qtd</th>
                  <th className="w-14 px-1 font-medium">Un.</th>
                  <th className="w-24 px-1 text-right font-medium">Unit. (R$)</th>
                  <th className="w-24 px-1 text-right font-medium">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {materiais.map((m, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2"><input className="field-input !px-2 !py-1 text-sm" value={m.descricao} onChange={(e) => setMat(i, "descricao", e.target.value)} placeholder="Descrição" /></td>
                    <td className="px-1"><input className="field-input !px-2 !py-1 text-sm" inputMode="decimal" value={m.qtd} onChange={(e) => setMat(i, "qtd", e.target.value)} /></td>
                    <td className="px-1"><input className="field-input !px-1.5 !py-1 text-sm" value={m.unidade} onChange={(e) => setMat(i, "unidade", e.target.value)} /></td>
                    <td className="px-1"><input className="field-input !px-2 !py-1 text-right text-sm" inputMode="decimal" value={m.precoUnit} onChange={(e) => setMat(i, "precoUnit", e.target.value)} /></td>
                    <td className="whitespace-nowrap px-1 text-right text-slate-600 dark:text-slate-300">{brl(rowTotal(m))}</td>
                    <td className="px-0 text-center">
                      <button type="button" onClick={() => removeMat(i)} className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-600 dark:text-slate-600 dark:hover:bg-red-900/20 dark:hover:text-red-400" aria-label="Remover material">
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-secondary mt-3 !py-1.5 text-xs" onClick={addMat}>+ Adicionar material</button>
        </section>
      )}

      {/* Preço */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {preco && precoTocado.current && (
            <button type="button" className="toque -my-1 px-1 py-2 text-xs text-gta-indigo hover:underline" onClick={() => { precoTocado.current = false; setForm((f) => ({ ...f, valorServico: nf(preco.preco, 2) })); }}>Usar sugerido {brl(preco.preco)}</button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label">Valor do serviço (R$) *</label>
            <input className="field-input" value={form.valorServico} onChange={(e) => { precoTocado.current = true; set("valorServico", e.target.value); }} placeholder="Ex.: 5.000,00" />
            {preco ? <p className="mt-1 hint">custo {brl(preco.custoGeral)} × Fator K {nf(preco.fatorK, 2)} → sugerido {brl(preco.preco)} · margem líq. {nf(preco.margem * 100, 0)}%</p> : null}
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Equipamento / carregador (R$)</label>
            <input className="field-input" value={form.valorEquipamento} onChange={(e) => set("valorEquipamento", e.target.value)} />
            <p className="mt-1 hint">0 = fornecido pelo cliente.</p>
          </div>
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
              <Kpi label="Custo materiais" value={brl(preco.custoMateriais)} />
              <Kpi label="Mão de obra" value={brl(preco.maoObra)} />
              <Kpi label="Custo geral" value={brl(preco.custoGeral)} />
              <Kpi label="Fator K (markup)" value={`× ${nf(preco.fatorK, 2)}`} />
              <Kpi label="Faturamento" value={brl(preco.preco)} destaque />
              <Kpi label="Impostos" value={brl(preco.impostos)} />
              <Kpi label="Lucro líquido" value={brl(preco.lucro)} />
              <Kpi label="Margem líquida" value={`${nf(preco.margem * 100, 1)}%`} destaque />
            </div>
            <p className="mt-1 hint">
              Faturamento = custo geral × Fator K. O custo dos materiais vem da lista editável acima. Ajuste o Fator K e os impostos em “Parâmetros de preço”.
            </p>
          </div>
        )}
      </section>

      <CondicoesPagamento total={totalCliente} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div><label className="field-label">Subtítulo do cabeçalho</label><input className="field-input" value={form.subtitulo} onChange={(e) => set("subtitulo", e.target.value)} /></div>
          <div><label className="field-label">Objeto</label><textarea className="field-input min-h-[60px]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div><label className="field-label">Texto do objetivo</label><textarea className="field-input min-h-[90px]" value={form.textoObjetivo} onChange={(e) => set("textoObjetivo", e.target.value)} /></div>
          <div><label className="field-label">Prazo de execução</label><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></div>
          <p className="hint">A forma de pagamento é montada na seção “Condições de pagamento” acima.</p>
        </div>
      </details>

      {/* Parâmetros */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Parâmetros de preço (mão de obra, Fator K, impostos)</summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Faturamento = (materiais + mão de obra) × Fator K. Padrão GTA: Fator K 1,65 e impostos 7,01% → margem líquida ≈ 30%. Ao salvar, valem para todos os próximos cálculos.</p>
        <div className="mt-4"><CarregadorParamsForm onSaved={aplicarParams} /></div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}</button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || !sizing || parseBR(form.valorServico) <= 0}>{gerando ? "Gerando…" : "Gerar .docx"}</button>
        <BaixarPlanilhaButton serviceKey="carregador" disabled={!sizing} nome={`carregador-${form.clienteNome || "proposta"}`} dados={() => ({
          cliente: form.clienteNome,
          sizing: sizing ? { potenciaKw: parseBR(form.potenciaKw), corrente: sizing.correnteProjeto, disjuntor: sizing.disjuntorA, secaoCabo: sizing.secaoMm2, dr: `Tipo ${sizing.drTipo}` } : undefined,
          materiais: materiais.map((m) => ({ descricao: m.descricao, unidade: m.unidade, qtd: parseBR(m.qtd), precoUnit: parseBR(m.precoUnit) })),
          maoObraPorPonto: params?.maoObraPorPonto ?? 800,
          qtdPontos: Math.max(1, form.qtdPontos),
          fatorK: params?.fatorK ?? 1.65,
          aliqImpostos: params?.aliqImpostos ?? 0.0701,
        })} />
        <button className="toque text-sm text-gta-indigo hover:underline" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
