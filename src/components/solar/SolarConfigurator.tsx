"use client";

import { ClienteInput } from "@/components/clientes/ClienteInput";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  PAINEIS_COMERCIAIS,
  INVERSORES_COMERCIAIS,
  sugerirInversorComercial,
} from "@/services/solar/commercial";
import { MICROINVERSORES_COMERCIAIS, microLabel, sugerirMicroinversor, dimensionarMicro } from "@/services/solar/micro";
import { SolarParamsForm } from "@/components/admin/SolarParamsForm";
import { CopyButton } from "@/components/CopyButton";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { BaixarPlanilhaButton } from "@/components/BaixarPlanilhaButton";
import { Kpi } from "@/components/ui";

/** Formatação pt-BR local (sem depender de libs de servidor). */
const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(v, 2);
const pct = (v: number) => nf(v * 100, 2) + "%";
/** kW sem casas desnecessárias: 3.5 -> "3,5" · 10 -> "10" */
const kw = (v: number) => nf(v, Number.isInteger(v) ? 0 : 1);
/** "18.400,27" -> 18400.27 (número no formato BR). */
const parseBR = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};
/** Busca sem acento/caixa. */
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

/** Estruturas de fixação atendidas (define o kit de fixação da lista de materiais). */
const TIPOS_TELHADO = [
  "Colonial",
  "Telha metálica",
  "Telha",
  "Telha shingle",
  "Telha fibrocimento",
  "Laje",
  "Solo",
];

interface Form {
  clienteNome: string;
  municipio: string; // "GOIANIA - GO" (p/ HSP)
  cidadeUf: string; // "Goiânia/GO" (documento)
  objeto: string;
  subtitulo: string;
  referenciaSeq: number;
  dataEmissao: string;
  validadeDias: number;
  formaPagamento: string;
  consumo: string[]; // 12
  margemSeguranca: number; // % de folga sobre o consumo (superdimensionamento)
  tipoConexao: "mono" | "bi" | "tri";
  potenciaPainel: number;
  eficiencia: number; // fração (0,75)
  overloadDesejado: number; // fração (0,15)
  nPaineis: number; // 0 = automático (usa a sugestão)
  potenciaInversor: number; // 0 = automático
  qtdInversores: number;
  tipoInversor: "string" | "micro";
  /** Potência de cada microinversor (kW). 0 = usa a sugestão do servidor. */
  microPotenciaKw: number;
  tipoTelhado: string;
  distribuidor: string;
  distribuidorNome: string;
  distribuidorCnpj: string;
  kitItens: string;
  kit: string;
  fator: number;
  viagens: number;
  execucaoCivil: string;
  // economia
  distribuidora: string;
  subgrupo: "B1" | "B2" | "B3";
  tarifaEnergia: string; // R$/kWh
  textoObjetivo: string;
  textoObservacao: string;
  prazoExecucao: string;
}

const HOJE = new Date().toISOString().slice(0, 10);

const FORM_INICIAL: Form = {
  clienteNome: "",
  municipio: "",
  cidadeUf: "",
  objeto: "Implantação de Sistema de Microgeração Solar Fotovoltaica On-Grid",
  subtitulo: "SISTEMA FOTOVOLTAICO CONECTADO À REDE  ·  MICROGERAÇÃO SOLAR ON-GRID",
  referenciaSeq: 1,
  dataEmissao: HOJE,
  validadeDias: 20,
  formaPagamento: "A combinar",
  consumo: Array(12).fill(""),
  margemSeguranca: 0,
  tipoConexao: "tri",
  potenciaPainel: 700,
  eficiencia: 0.75,
  overloadDesejado: 0.15,
  nPaineis: 0,
  potenciaInversor: 0,
  qtdInversores: 1,
  tipoInversor: "string",
  microPotenciaKw: 0,
  tipoTelhado: "Telha metálica",
  distribuidor: "weg",
  distribuidorNome: "",
  distribuidorCnpj: "",
  kitItens: "módulos, inversor, estrutura e cabos",
  kit: "",
  fator: 1.575,
  viagens: 2,
  execucaoCivil: "0",
  distribuidora: "",
  subgrupo: "B1",
  tarifaEnergia: "",
  textoObjetivo:
    "A presente proposta tem como objetivo a implantação de um sistema de microgeração de energia solar fotovoltaica conectada à rede elétrica (On-Grid), proporcionando redução nos custos com energia elétrica através da geração própria de energia limpa e renovável.",
  textoObservacao:
    "Para o pleno funcionamento e atingimento da geração de energia estimada, é necessário que o telhado possua área útil compatível com orientação voltada para o Norte. Caso essas condições não sejam integralmente atendidas, a geração real poderá divergir dos valores previstos na simulação.",
  prazoExecucao: "45 a 60 dias",
};

interface Calc {
  sizing: { consumoMedio: number; hspMedia: number; disponibilidade: number; kwpNecessaria: number; nPlacasSugerido: number; inversorSugerido: number };
  aplicado: { nPaineis: number; potenciaInversor: number; qtdInversores: number; eficiencia: number; overloadDesejado: number };
  inversorSugerido: number;
  kwpTotal: number;
  overload: number;
  /** Só quando tipoInversor === "micro". */
  micro: null | {
    potenciaKw: number;
    qtdMicros: number;
    potenciaCaTotalKw: number;
    overload: number;
    modulosPorMicro: number;
    microsComModuloExtra: number;
    divisaoDesigual: boolean;
    ramais: number;
    microsPorRamal: number;
  };
  geracao: { linhas: { mes: string; insolacao: number; energia: number; consumo: number }[]; totalEnergia: number; totalConsumo: number };
  bom: { qtde: string; descricao: string }[];
  pricing: null | {
    valorTotal: number; servicos: number; margem: number; margemLiquida: number; lucro: number; lucroLiquido: number;
    custos: { instalacao: number; materialCa: number; deslocamento: number; art: number; imposto: number; comissao: number; total: number };
  };
  economia: null | {
    economiaAno1: number; economiaMensalMedia: number; gastoSemSolarAno1: number; gastoComSolarAno1: number;
    paybackAnos: number; paybackMeses: number; economiaPorAno: number[]; saldo: number[]; economiaHorizonte: number;
  };
  params?: {
    instalacaoPorPainel: number; materialCaPorWp: number; deslocamentoUnit: number;
    art: number; cartorio: number; impostoPct: number; comissaoPct: number;
  };
}

const DISTRIBUIDORES = [
  { value: "weg", label: "WEG" },
  { value: "belenergy", label: "BelEnergy" },
  { value: "outro", label: "Outro distribuidor" },
];

export function SolarConfigurator({ propostaId }: { propostaId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(FORM_INICIAL);
  const [municipios, setMunicipios] = useState<{ nome: string; uf: string }[]>([]);
  const [distribuidoras, setDistribuidoras] = useState<string[]>([]);
  const [calc, setCalc] = useState<Calc | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [painelCustom, setPainelCustom] = useState(false);
  const [invCustom, setInvCustom] = useState(false);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  // Lista de materiais EDITÁVEL (composição do sistema) — semeada pela sugestão
  // do servidor (calc.bom) até o usuário editar/salvar.
  const [materiais, setMateriais] = useState<{ qtde: string; descricao: string }[]>([]);
  const pularReseed = useRef(false);
  // campos que o usuário já editou de propósito (a sugestão não sobrescreve)
  const touched = useRef({ nPaineis: false, inversor: false });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setMat = (i: number, k: "qtde" | "descricao", v: string) => setMateriais((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const addMat = () => setMateriais((ms) => [...ms, { qtde: "1", descricao: "" }]);
  const removeMat = (i: number) => setMateriais((ms) => ms.filter((_, j) => j !== i));
  const restaurarMat = () => { if (calc?.bom) setMateriais(calc.bom.map((b) => ({ qtde: b.qtde, descricao: b.descricao }))); };

  // carrega municípios, parâmetros padrão e (se reabrindo) a proposta salva
  useEffect(() => {
    fetch("/api/municipios").then((r) => r.json()).then((d) => setMunicipios(d.municipios ?? [])).catch(() => {});
    fetch("/api/distribuidoras").then((r) => r.json()).then((d) => setDistribuidoras(d.distribuidoras ?? [])).catch(() => {});
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag; materiais?: { qtde: string; descricao: string }[] };
          setForm({ ...FORM_INICIAL, ...dados });
          if (dados.cond) setCond(dados.cond as CondPag);
          if (Array.isArray(dados.materiais) && dados.materiais.length) { setMateriais(dados.materiais); pularReseed.current = true; }
          // valores salvos são escolhas do usuário — não sobrescrever com sugestões
          touched.current = { nPaineis: (dados.nPaineis ?? 0) > 0, inversor: (dados.potenciaInversor ?? 0) > 0 };
          if (dados.potenciaPainel && !PAINEIS_COMERCIAIS.includes(dados.potenciaPainel)) setPainelCustom(true);
          if (dados.potenciaInversor && !INVERSORES_COMERCIAIS.includes(dados.potenciaInversor)) setInvCustom(true);
        }
      }).catch(() => {});
    } else {
      // proposta nova: usa os parâmetros vigentes e o próximo nº de referência
      fetch("/api/solar/config").then((r) => r.json()).then((d) => {
        if (d.params) {
          setForm((f) => ({
            ...f,
            eficiencia: d.params.eficiencia,
            overloadDesejado: d.params.overloadDesejado,
            fator: d.params.fator,
            viagens: d.params.viagens,
          }));
        }
      }).catch(() => {});
      fetch("/api/propostas/proximo?serviceKey=solar").then((r) => r.json()).then((d) => {
        if (d.seq) setForm((f) => ({ ...f, referenciaSeq: d.seq }));
      }).catch(() => {});
    }
  }, [propostaId]);

  // aplica os parâmetros salvos no card de configuração à proposta atual
  function aplicarParams(p: { eficiencia: number; overloadDesejado: number; fator: number; viagens: number }) {
    setForm((f) => ({ ...f, eficiencia: p.eficiencia, overloadDesejado: p.overloadDesejado, fator: p.fator, viagens: p.viagens }));
  }

  // recálculo ao vivo (debounce) — dispara com município + consumo; painéis/inversor são sugeridos
  const temConsumo = form.consumo.some((c) => Number(c) > 0);
  const calcKey = JSON.stringify([
    form.municipio, form.consumo, form.margemSeguranca, form.tipoConexao, form.potenciaPainel, form.eficiencia,
    form.overloadDesejado, form.nPaineis, form.potenciaInversor, form.qtdInversores,
    form.tipoInversor, form.microPotenciaKw, form.tipoTelhado, form.kit, form.fator, form.viagens, form.execucaoCivil,
    form.distribuidora, form.subgrupo, form.tarifaEnergia,
  ]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!form.municipio || !temConsumo) {
      setCalc(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/solar/calcular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            municipio: form.municipio,
            consumo: form.consumo.map((c) => c || 0),
            margemSeguranca: form.margemSeguranca,
            tipoConexao: form.tipoConexao,
            potenciaPainel: form.potenciaPainel,
            eficiencia: form.eficiencia,
            overloadDesejado: form.overloadDesejado,
            nPaineis: form.nPaineis,
            potenciaInversor: form.potenciaInversor,
            qtdInversores: form.qtdInversores,
            tipoInversor: form.tipoInversor,
            microPotenciaKw: form.microPotenciaKw,
            tipoTelhado: form.tipoTelhado,
            kit: form.kit,
            fator: form.fator,
            viagens: form.viagens,
            execucaoCivil: form.execucaoCivil,
            distribuidora: form.distribuidora,
            subgrupo: form.subgrupo,
            tarifaEnergia: form.tarifaEnergia,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCalc(data);
          // semeia a lista editável com a sugestão — exceto logo após carregar
          // uma proposta salva (preserva o que o usuário editou).
          if (pularReseed.current) pularReseed.current = false;
          else if (data.bom) setMateriais(data.bom.map((b: { qtde: string; descricao: string }) => ({ qtde: b.qtde, descricao: b.descricao })));
        }
      } catch {
        /* ignora erro de cálculo transitório */
      }
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey]);

  // preenche painéis/inversor com o valor aplicado pelo servidor enquanto o
  // usuário não mexer nesses campos (a sugestão "segue" o consumo)
  useEffect(() => {
    if (!calc) return;
    setForm((f) => {
      const next = { ...f };
      let mudou = false;
      if (!touched.current.nPaineis && calc.aplicado.nPaineis !== f.nPaineis) {
        next.nPaineis = calc.aplicado.nPaineis;
        mudou = true;
      }
      if (!touched.current.inversor && calc.aplicado.potenciaInversor !== f.potenciaInversor) {
        next.potenciaInversor = calc.aplicado.potenciaInversor;
        mudou = true;
      }
      return mudou ? next : f;
    });
  }, [calc]);

  function aplicarSugestao() {
    if (!calc) return;
    const nP = Math.max(1, calc.sizing.nPlacasSugerido);
    const inv = sugerirInversorComercial((nP * form.potenciaPainel) / 1000, form.overloadDesejado);
    touched.current = { nPaineis: false, inversor: false };
    setInvCustom(false);
    // microPotenciaKw 0 volta a seguir a sugestão automática do servidor
    setForm((f) => ({ ...f, nPaineis: nP, potenciaInversor: inv, qtdInversores: 1, microPotenciaKw: 0 }));
  }

  const nivelMargem = useMemo(() => {
    const m = calc?.pricing?.margemLiquida ?? 0;
    if (!calc?.pricing) return null;
    if (m >= 0.3) return { cls: "bg-green-100 text-green-800", label: "saudável" };
    if (m >= 0.15) return { cls: "bg-amber-100 text-amber-800", label: "atenção" };
    return { cls: "bg-red-100 text-red-700", label: "baixa" };
  }, [calc?.pricing]);

  const ehMicro = form.tipoInversor === "micro";

  /**
   * Texto do inversor na linha de sugestão — acompanha o tipo escolhido: no
   * micro mostra a unidade sugerida E quantas seriam necessárias (é a
   * quantidade que muda com o tamanho do sistema, não a potência da unidade).
   */
  const sugestaoInversor = useMemo(() => {
    const kwpSug = (Math.max(1, calc?.sizing.nPlacasSugerido ?? 1) * form.potenciaPainel) / 1000;
    if (!ehMicro) {
      return `inversor ${kw(sugerirInversorComercial(kwpSug, form.overloadDesejado))} kW`;
    }
    const potMicro = sugerirMicroinversor(kwpSug, form.overloadDesejado);
    const d = dimensionarMicro({
      nPaineis: Math.max(1, calc?.sizing.nPlacasSugerido ?? 1),
      potenciaPainelW: form.potenciaPainel,
      potenciaKw: potMicro,
      overloadDesejado: form.overloadDesejado,
    });
    return `${d.qtdMicros} microinversor${d.qtdMicros > 1 ? "es" : ""} de ${kw(potMicro)} kW (${nf(d.potenciaCaTotalKw, 2)} kW CA)`;
  }, [ehMicro, calc?.sizing.nPlacasSugerido, form.potenciaPainel, form.overloadDesejado]);
  // O microinversor é dimensionado para a geração real do módulo, então tolera
  // (e costuma trabalhar com) um sobredimensionamento maior que o inversor string.
  const overloadOk = calc ? calc.overload >= 0 && calc.overload <= (ehMicro ? 0.6 : 0.35) : true;

  // datalist filtrado: só busca com 2+ letras (5.508 opções travam o navegador)
  const sugestoesMunicipio = useMemo(() => {
    const q = normalizar(form.municipio);
    if (q.length < 2) return [];
    return municipios.filter((m) => normalizar(m.nome).includes(q)).slice(0, 50);
  }, [municipios, form.municipio]);

  function preencherMunicipio(nome: string) {
    set("municipio", nome);
    // sugere cidadeUf a partir do município (usuário pode ajustar acentuação)
    if (!form.cidadeUf && nome.includes(" - ")) {
      const [cid, uf] = nome.split(" - ");
      const cap = cid.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
      set("cidadeUf", `${cap}/${uf}`);
    }
  }

  /** Monta o formData no formato que o /api/gerar (serviço solar) já espera. */
  function montarFormData() {
    if (!calc) return null;
    return {
      clienteNome: form.clienteNome,
      cidadeUf: form.cidadeUf,
      objeto: form.objeto,
      subtitulo: form.subtitulo,
      referenciaSeq: form.referenciaSeq,
      dataEmissao: form.dataEmissao,
      validadeDias: form.validadeDias,
      formaPagamento: montarFormaPagamento(cond, calc?.pricing?.valorTotal ?? 0),
      textoObjetivo: form.textoObjetivo,
      potenciaPainel: `${form.potenciaPainel} W`,
      qtdPaineis: `${calc.aplicado.nPaineis} unidades`,
      potenciaTotal: `${nf(calc.kwpTotal, 2)} kWp`,
      // No micro o que vale é a potência CA total do conjunto e a unidade em W.
      potenciaInversor: calc.micro
        ? `${nf(calc.micro.potenciaCaTotalKw, 2)} kW (${calc.micro.qtdMicros} × ${kw(calc.micro.potenciaKw)} kW)`
        : `${kw(calc.aplicado.potenciaInversor)} kWp`,
      overload: pct(calc.overload),
      qtdInversores: `${calc.aplicado.qtdInversores} ${calc.aplicado.qtdInversores > 1 ? "unidades" : "unidade"}`,
      tipoInversor: form.tipoInversor === "micro" ? "microinversor" : "inversor",
      simulacao: calc.geracao.linhas.map((l) => ({
        mes: l.mes,
        insolacao: nf(l.insolacao, 3),
        energia: nf(l.energia, 2),
        consumo: nf(l.consumo, 2),
      })),
      textoObservacao: (form.margemSeguranca > 0
        ? `O dimensionamento inclui uma margem de segurança de ${form.margemSeguranca}%, considerando um consumo médio de ${nf(calc.sizing.consumoMedio, 0)} kWh/mês. `
        : "") + form.textoObservacao,
      materiais: materiais.filter((m) => m.descricao.trim()).map((m) => ({ qtde: m.qtde, descricao: m.descricao })),
      distribuidor: form.distribuidor,
      distribuidorNome: form.distribuidorNome,
      distribuidorCnpj: form.distribuidorCnpj,
      kitItens: form.kitItens,
      valorKit: form.kit,
      valorGta: calc.pricing ? nf(calc.pricing.servicos, 2) : "0",
      prazoExecucao: form.prazoExecucao,
      // economia/payback (entra no .docx quando calculada)
      economiaMensal: calc.economia ? brl(calc.economia.economiaMensalMedia) : "",
      economiaAno1: calc.economia ? brl(calc.economia.economiaAno1) : "",
      paybackTexto: calc.economia
        ? (calc.economia.paybackAnos <= 25 ? paybackTexto(calc.economia.paybackMeses) : "acima de 25 anos")
        : "",
    };
  }

  async function salvar(silencioso = false) {
    if (!form.clienteNome) {
      setErro("Informe o nome do cliente para salvar.");
      return null;
    }
    setSalvando(true);
    setErro(null);
    try {
      const st = calc?.pricing ? "precificada" : "rascunho";
      const payload = { serviceKey: "solar", cliente: form.clienteNome, status: st, dados: { ...form, cond, materiais } };
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
    const formData = montarFormData();
    if (!formData) {
      setErro("Preencha o município e o consumo para calcular antes de gerar.");
      return;
    }
    if (!form.clienteNome) {
      setErro("Informe o nome do cliente.");
      return;
    }
    if (!form.cidadeUf) {
      setErro("Informe a Cidade/UF do documento.");
      return;
    }
    if (!form.kit || !calc?.pricing) {
      setErro("Informe o valor do kit (cotação) antes de gerar o documento.");
      return;
    }
    setGerando(true);
    setErro(null);
    try {
      // Garante um registro no histórico antes de gerar (evita duplicar:
      // o /api/gerar apenas marca este id como "gerada").
      let id = savedId;
      if (!id) {
        id = (await salvar(true)) ?? undefined;
        if (!id) return; // salvar já reportou o erro
      }
      const res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: "solar", formData, propostaId: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Falha ao gerar.");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const filename = m ? decodeURIComponent(m[1]) : "proposta-solar.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  const inputCls = "field-input";
  const sec = "section-card";
  const h2 = "section-title";

  const painelSelect = painelCustom ? "outro" : String(form.potenciaPainel);
  const invSelect = invCustom ? "outro" : String(form.potenciaInversor);

  return (
    <div className="space-y-6">
      {erro && <p className="field-error">{erro}</p>}

      {/* Identificação */}
      <section className={sec}>
        <h2 className={h2}>Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className="field-label">Nome do cliente *</label>
            <ClienteInput className={inputCls} value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label">Cidade da instalação *</label>
            <input
              className={inputCls}
              list="municipios-list"
              value={form.municipio}
              onChange={(e) => preencherMunicipio(e.target.value)}
              placeholder="Digite 2+ letras e selecione..."
            />
            <datalist id="municipios-list">
              {sugestoesMunicipio.map((m) => (
                <option key={m.nome} value={m.nome} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Usada para buscar a irradiação solar (HSP) da região.</p>
          </div>
          <div className="sm:col-span-3">
            <label className="field-label">Cidade/UF (como sai no documento)</label>
            <input className={inputCls} value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label">Validade (dias)</label>
            <input type="number" className={inputCls} value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label">Emissão</label>
            <input type="date" className={inputCls} value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          A referência (nº da proposta) é gerada automaticamente ao salvar.
        </p>
      </section>

      {/* 1 · Consumo */}
      <section className={sec}>
        <h2 className={h2}>Consumo mensal (kWh)</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Copie os 12 meses da conta de energia. É a única entrada necessária — o dimensionamento sai daqui.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
          {MESES.map((mes, i) => (
            <div key={mes}>
              <label className="field-label">{mes.slice(0, 3)}</label>
              <input
                className={inputCls}
                inputMode="numeric"
                value={form.consumo[i]}
                onChange={(e) => set("consumo", form.consumo.map((c, j) => (j === i ? e.target.value : c)))}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="field-label">Tipo de conexão</label>
            <select className={inputCls} value={form.tipoConexao} onChange={(e) => set("tipoConexao", e.target.value as Form["tipoConexao"])}>
              <option value="mono">Monofásico</option>
              <option value="bi">Bifásico</option>
              <option value="tri">Trifásico</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Margem de segurança (%)</label>
            <input
              type="number"
              min="0"
              max="200"
              step="5"
              className={inputCls}
              value={form.margemSeguranca}
              onChange={(e) => set("margemSeguranca", Number(e.target.value))}
              placeholder="0"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Folga p/ superdimensionar (ex.: +10%). 0 = sem folga.</p>
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              type="button"
              className="btn-secondary !py-2 text-xs"
              disabled={!Number(form.consumo[0])}
              onClick={() => set("consumo", Array(12).fill(form.consumo[0]))}
              title="Útil quando o cliente só informa a média mensal"
            >
              Repetir Jan nos 12 meses
            </button>
          </div>
        </div>
      </section>

      {/* 2 · Dimensionamento */}
      <section className={sec}>
        <h2 className={h2}>Dimensionamento</h2>

        {!calc && (
          <p className="mt-2 subcard text-sm text-slate-500 dark:text-slate-400">
            Preencha a <strong>cidade da instalação</strong> e o <strong>consumo</strong> acima — o
            sistema sugere os painéis e o inversor automaticamente.
          </p>
        )}

        {calc && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gta-navy/20 bg-gta-navy/5 p-4 dark:border-slate-600 dark:bg-slate-900/50">
            <div className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-gta-navy dark:text-slate-100">Sugestão para este consumo:</span>{" "}
              <strong>{Math.max(1, calc.sizing.nPlacasSugerido)} painéis</strong> de {form.potenciaPainel} Wp
              {" "}(≈ {nf((Math.max(1, calc.sizing.nPlacasSugerido) * form.potenciaPainel) / 1000, 2)} kWp)
              {" "}+ <strong>{sugestaoInversor}</strong>
              <span className="text-slate-500 dark:text-slate-400"> · necessidade calculada: {nf(calc.sizing.kwpNecessaria, 2)} kWp</span>
            </div>
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={aplicarSugestao}>
              Aplicar sugestão
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label">Potência do painel (Wp)</label>
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={painelSelect}
                onChange={(e) => {
                  if (e.target.value === "outro") setPainelCustom(true);
                  else { setPainelCustom(false); set("potenciaPainel", Number(e.target.value)); }
                }}
              >
                {PAINEIS_COMERCIAIS.map((p) => <option key={p} value={p}>{p} Wp</option>)}
                <option value="outro">Outra...</option>
              </select>
              {painelCustom && (
                <input type="number" className={inputCls} value={form.potenciaPainel} onChange={(e) => set("potenciaPainel", Number(e.target.value))} />
              )}
            </div>
          </div>
          <div className="sm:col-span-1">
            <label className="field-label">Nº de painéis</label>
            <input
              type="number"
              className={inputCls}
              value={form.nPaineis || ""}
              placeholder="auto"
              onChange={(e) => { touched.current.nPaineis = true; set("nPaineis", Number(e.target.value)); }}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Tipo de inversor</label>
            <select className={inputCls} value={form.tipoInversor} onChange={(e) => set("tipoInversor", e.target.value as Form["tipoInversor"])}>
              <option value="string">Inversor (string)</option>
              <option value="micro">Microinversor</option>
            </select>
          </div>

          {/* String: escolhe a potência do inversor central e quantos são.
              Micro: escolhe o MODELO (W × módulos) — a quantidade é derivada. */}
          {ehMicro ? (
            <>
              <div className="sm:col-span-2">
                <label className="field-label">Microinversor</label>
                <select
                  className={inputCls}
                  value={form.microPotenciaKw || calc?.micro?.potenciaKw || 0}
                  onChange={(e) => { touched.current.inversor = true; set("microPotenciaKw", Number(e.target.value)); }}
                >
                  {!form.microPotenciaKw && <option value={0}>Automático (sugerido)</option>}
                  {MICROINVERSORES_COMERCIAIS.map((p) => (
                    <option key={p} value={p}>{microLabel(p)}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="field-label">Qtd. microinversores</label>
                <input
                  type="number"
                  className={`${inputCls} bg-slate-50 dark:bg-slate-900/50`}
                  value={calc?.micro?.qtdMicros ?? ""}
                  placeholder="auto"
                  readOnly
                  title="Calculado a partir do nº de painéis e dos módulos por microinversor."
                />
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <label className="field-label">Inversor (kW)</label>
                <div className="flex gap-2">
                  <select
                    className={inputCls}
                    value={invSelect}
                    onChange={(e) => {
                      touched.current.inversor = true;
                      if (e.target.value === "outro") setInvCustom(true);
                      else { setInvCustom(false); set("potenciaInversor", Number(e.target.value)); }
                    }}
                  >
                    {!INVERSORES_COMERCIAIS.includes(form.potenciaInversor) && !invCustom && (
                      <option value={String(form.potenciaInversor)}>
                        {form.potenciaInversor === 0 ? "Automático" : `${kw(form.potenciaInversor)} kW`}
                      </option>
                    )}
                    {INVERSORES_COMERCIAIS.map((p) => <option key={p} value={p}>{kw(p)} kW</option>)}
                    <option value="outro">Outro...</option>
                  </select>
                  {invCustom && (
                    <input
                      type="number"
                      step="0.5"
                      className={inputCls}
                      value={form.potenciaInversor}
                      onChange={(e) => { touched.current.inversor = true; set("potenciaInversor", Number(e.target.value)); }}
                    />
                  )}
                </div>
              </div>
              <div className="sm:col-span-1">
                <label className="field-label">Qtd. inversores</label>
                <input type="number" className={inputCls} value={form.qtdInversores} onChange={(e) => set("qtdInversores", Number(e.target.value))} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className="field-label">Tipo de telhado</label>
            <select className={inputCls} value={form.tipoTelhado} onChange={(e) => set("tipoTelhado", e.target.value)}>
              {TIPOS_TELHADO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {calc && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Potência do sistema" value={`${nf(calc.kwpTotal, 2)} kWp`} destaque />
            <Kpi label="Consumo médio" value={`${nf(calc.sizing.consumoMedio, 0)} kWh/mês`} />
            <Kpi label="HSP média (local)" value={nf(calc.sizing.hspMedia, 2)} />
            <div className={`rounded-md p-2 shadow-sm ${overloadOk ? "bg-white dark:bg-slate-800" : "bg-amber-50 dark:bg-amber-900/30"}`}>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {calc.micro ? "Overload por micro" : "Overload do inversor"}
              </div>
              <div className={`mt-0.5 font-semibold ${overloadOk ? "text-gta-navy dark:text-slate-100" : "text-amber-700 dark:text-amber-300"}`}>
                {pct(calc.overload)} {overloadOk ? "" : "· verificar"}
              </div>
            </div>
          </div>
        )}

        {/* Resumo específico do arranjo com microinversores */}
        {calc?.micro && (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gta-indigo/20 bg-indigo-50/50 p-3 text-sm sm:grid-cols-4 dark:border-indigo-500/30 dark:bg-indigo-900/20">
            <Kpi label="Microinversores" value={`${calc.micro.qtdMicros} × ${kw(calc.micro.potenciaKw)} kW`} />
            <Kpi
              label="Módulos por micro"
              value={calc.micro.divisaoDesigual
                ? `${calc.micro.modulosPorMicro}–${calc.micro.modulosPorMicro + 1}`
                : String(calc.micro.modulosPorMicro)}
            />
            <Kpi label="Potência CA total" value={`${nf(calc.micro.potenciaCaTotalKw, 2)} kW`} />
            <Kpi
              label="Circuitos CA"
              value={calc.micro.microsPorRamal > 1
                ? `${calc.micro.ramais} (até ${calc.micro.microsPorRamal}/circuito)`
                : `${calc.micro.ramais} (1 por unidade)`}
            />
            {calc.micro.divisaoDesigual && (
              <p className="col-span-2 text-xs text-amber-700 sm:col-span-4 dark:text-amber-300">
                Os {calc.aplicado.nPaineis} painéis não se dividem igualmente entre os {calc.micro.qtdMicros}{" "}
                microinversores: {calc.micro.microsComModuloExtra}{" "}
                {calc.micro.microsComModuloExtra > 1 ? "unidades ficam" : "unidade fica"} com{" "}
                {calc.micro.modulosPorMicro + 1} módulos e o restante com {calc.micro.modulosPorMicro}. Para dividir
                exato, use um nº de painéis múltiplo de {calc.micro.qtdMicros}.
              </p>
            )}
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400">Ajustes avançados (eficiência e overload)</summary>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="field-label">Eficiência do sistema (%)</label>
              <input
                type="number" step="1" min="30" max="100" className={inputCls}
                value={Math.round(form.eficiencia * 100)}
                onChange={(e) => set("eficiencia", Number(e.target.value) / 100)}
              />
            </div>
            <div>
              <label className="field-label">Overload desejado (%)</label>
              <input
                type="number" step="1" min="0" max="100" className={inputCls}
                value={Math.round(form.overloadDesejado * 100)}
                onChange={(e) => set("overloadDesejado", Number(e.target.value) / 100)}
              />
            </div>
            <p className="col-span-2 self-end text-xs text-slate-400 dark:text-slate-500">
              Padrão vem dos Parâmetros (abaixo) — mude aqui só para esta proposta.
            </p>
          </div>
        </details>
      </section>

      {/* Geração + gráfico */}
      {calc?.geracao && (
        <section className={sec}>
          <h2 className={h2}>Simulação de geração</h2>
          <GraficoGeracao linhas={calc.geracao.linhas} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
                <tr><th className="py-1">Mês</th><th>Insolação</th><th>Geração (kWh)</th><th>Consumo (kWh)</th></tr>
              </thead>
              <tbody>
                {calc.geracao.linhas.map((l) => (
                  <tr key={l.mes} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-1">{l.mes}</td>
                    <td>{nf(l.insolacao, 3)}</td>
                    <td className="font-medium text-green-700 dark:text-green-400">{nf(l.energia, 0)}</td>
                    <td className="text-orange-600 dark:text-orange-400">{nf(l.consumo, 0)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-semibold dark:border-slate-600">
                  <td className="py-1">Total anual</td><td></td>
                  <td className="text-green-700 dark:text-green-400">{nf(calc.geracao.totalEnergia, 0)}</td>
                  <td className="text-orange-600 dark:text-orange-400">{nf(calc.geracao.totalConsumo, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Lista de materiais (editável) */}
      {materiais.length > 0 && (
        <section className={sec}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={h2}>Lista de materiais (para cotar)</h2>
            <div className="flex items-center gap-3">
              {calc?.bom && <button type="button" className="toque text-xs text-gta-indigo hover:underline" onClick={restaurarMat}>Restaurar sugestão</button>}
              <CopyButton label="Copiar lista" text={() => materiais.filter((m) => m.descricao.trim()).map((m) => `${m.qtde}\t${m.descricao}`).join("\n")} />
            </div>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lista genérica (sem marca) para enviar ao distribuidor. Edite a qtde/descrição, adicione ou remova itens — vai assim para a proposta.</p>
          <div className="mt-3 space-y-2">
            {materiais.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${inputCls} shrink-0 grow-0 basis-20 text-center`} value={m.qtde} onChange={(e) => setMat(i, "qtde", e.target.value)} placeholder="Qtde" />
                <input className={`${inputCls} min-w-0 flex-1`} value={m.descricao} onChange={(e) => setMat(i, "descricao", e.target.value)} placeholder="Descrição do item" />
                <button type="button" className="icon-btn" onClick={() => removeMat(i)} aria-label="Remover item"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="toque mt-3 text-sm font-medium text-gta-indigo hover:underline" onClick={addMat}>+ Adicionar material</button>
        </section>
      )}

      {/* 4 · Distribuidor e preço */}
      <section className={sec}>
        <h2 className={h2}>Preço e margem</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label">Distribuidor</label>
            <select className={inputCls} value={form.distribuidor} onChange={(e) => set("distribuidor", e.target.value)}>
              {DISTRIBUIDORES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Valor do kit (cotação) *</label>
            <input className={inputCls} value={form.kit} onChange={(e) => set("kit", e.target.value)} placeholder="Ex.: 18.400,27" />
          </div>
          <div>
            <label className="field-label">Fator</label>
            <input type="number" step="0.05" className={inputCls} value={form.fator} onChange={(e) => set("fator", Number(e.target.value))} />
          </div>
          <div>
            <label className="field-label">Viagens</label>
            <input type="number" min="0" className={inputCls} value={form.viagens} onChange={(e) => set("viagens", Number(e.target.value))} />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Execução civil (R$)</label>
            <input className={inputCls} value={form.execucaoCivil} onChange={(e) => set("execucaoCivil", e.target.value)} />
          </div>
        </div>

        {calc?.pricing && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Valor total" value={brl(calc.pricing.valorTotal)} destaque />
            <Kpi label="Serviços GTA" value={brl(calc.pricing.servicos)} />
            <Kpi label="Lucro (líq.)" value={brl(calc.pricing.lucroLiquido)} />
            <div className="rounded-md bg-white p-2 shadow-sm dark:bg-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">Margem líquida</div>
              <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${nivelMargem?.cls}`}>
                {pct(calc.pricing.margemLiquida)} · {nivelMargem?.label}
              </div>
            </div>
            <div className="col-span-2 text-xs text-slate-400 sm:col-span-4 dark:text-slate-500">
              Custos: instalação {brl(calc.pricing.custos.instalacao)} · material CA {brl(calc.pricing.custos.materialCa)} ·
              deslocamento {brl(calc.pricing.custos.deslocamento)} · ART {brl(calc.pricing.custos.art)} ·
              imposto {brl(calc.pricing.custos.imposto)} · comissão {brl(calc.pricing.custos.comissao)}
            </div>
          </div>
        )}
      </section>

      {/* Condições de pagamento (seção compartilhada) */}
      <CondicoesPagamento total={calc?.pricing?.valorTotal ?? 0} value={cond} onChange={setCond} />

      {/* 5 · Economia e retorno */}
      <section className={sec}>
        <h2 className={h2}>Economia e retorno do investimento</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Informe a distribuidora e a tarifa da conta de energia. O Fio B (Lei 14.300) é buscado
          automaticamente. Requer o valor do kit preenchido acima.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <label className="field-label">Distribuidora</label>
            <input
              className={inputCls}
              list="distribuidoras-list"
              value={form.distribuidora}
              onChange={(e) => set("distribuidora", e.target.value)}
              placeholder="Ex.: Equatorial GO"
            />
            <datalist id="distribuidoras-list">
              {distribuidoras.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>
          <div className="sm:col-span-1">
            <label className="field-label">Subgrupo</label>
            <select className={inputCls} value={form.subgrupo} onChange={(e) => set("subgrupo", e.target.value as Form["subgrupo"])}>
              <option value="B1">B1 (residencial)</option>
              <option value="B2">B2 (rural)</option>
              <option value="B3">B3 (demais)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Tarifa de energia (R$/kWh)</label>
            <input className={inputCls} value={form.tarifaEnergia} onChange={(e) => set("tarifaEnergia", e.target.value)} placeholder="Ex.: 1,14" />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Valor cheio da conta (com impostos).</p>
          </div>
        </div>

        {calc?.economia ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Economia média/mês" value={brl(calc.economia.economiaMensalMedia)} destaque />
              <Kpi label="Economia no 1º ano" value={brl(calc.economia.economiaAno1)} />
              <div className="rounded-md bg-white p-2 shadow-sm dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">Payback</div>
                <div className="mt-0.5 font-semibold text-green-700 dark:text-green-400">
                  {calc.economia.paybackAnos <= 25 ? paybackTexto(calc.economia.paybackMeses) : "acima de 25 anos"}
                </div>
              </div>
              <Kpi label="Economia em 25 anos" value={brl(calc.economia.economiaHorizonte)} />
            </div>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Considera inflação da tarifa, degradação dos módulos, Fio B progressivo e o consumo simultâneo
              (ajustáveis nos Parâmetros). Gasto atual ≈ {brl(calc.economia.gastoSemSolarAno1 / 12)}/mês → com solar ≈ {brl(calc.economia.gastoComSolarAno1 / 12)}/mês.
            </p>
          </>
        ) : (
          <p className="mt-4 subcard text-sm text-slate-500 dark:text-slate-400">
            Preencha o <strong>valor do kit</strong>, a <strong>distribuidora</strong> e a <strong>tarifa</strong> para
            ver a economia mensal e o payback.
          </p>
        )}
      </section>

      {/* Parâmetros de preço e dimensionamento (retraído; disponível a todos) */}
      <details className={sec}>
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">
          Parâmetros de preço e dimensionamento
        </summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Valores padrão da plataforma (custos, imposto/NF, comissão, fator, eficiência). Ao salvar, valem
          para todos os próximos cálculos.
        </p>
        <div className="mt-4">
          <SolarParamsForm onSaved={aplicarParams} />
        </div>
      </details>

      {/* Textos (edição manual) */}
      <details className={sec}>
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <div><label className="field-label">Objeto</label><input className={inputCls} value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div><label className="field-label">Objetivo</label><textarea className={`${inputCls} min-h-[70px]`} value={form.textoObjetivo} onChange={(e) => set("textoObjetivo", e.target.value)} /></div>
          <div><label className="field-label">Observação técnica</label><textarea className={`${inputCls} min-h-[70px]`} value={form.textoObservacao} onChange={(e) => set("textoObservacao", e.target.value)} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="field-label">Prazo de execução</label><input className={inputCls} value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></div>
          </div>
        </div>
      </details>

      {/* 5 · Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? "Salvando..." : savedId ? "Salvar alterações" : "Salvar proposta"}
        </button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || !calc?.pricing} title={!calc?.pricing ? "Informe o valor do kit para gerar" : undefined}>
          {gerando ? "Gerando..." : "Gerar .docx"}
        </button>
        <BaixarPlanilhaButton
          serviceKey="solar"
          disabled={!calc?.pricing}
          nome={`solar-${form.clienteNome || "proposta"}`}
          dados={() => ({
            cliente: form.clienteNome,
            referencia: String(form.referenciaSeq),
            // dimensionamento (aba Dimensionamento)
            sizing: calc
              ? {
                  consumoMedio: calc.sizing.consumoMedio,
                  hspMedia: calc.sizing.hspMedia,
                  disponibilidade: calc.sizing.disponibilidade,
                  kwpNecessaria: calc.sizing.kwpNecessaria,
                  nPaineis: calc.aplicado.nPaineis,
                  potenciaPainel: form.potenciaPainel,
                  potenciaInversor: calc.aplicado.potenciaInversor,
                  qtdInversores: form.qtdInversores,
                }
              : undefined,
            kwp: calc?.kwpTotal ?? 0,
            // preço (aba Preço)
            kit: parseBR(form.kit),
            fator: form.fator,
            execucaoCivil: parseBR(form.execucaoCivil),
            valorTotal: calc?.pricing?.valorTotal ?? 0,
            servicos: calc?.pricing?.servicos ?? 0,
            eficiencia: form.eficiencia,
            precoParams: calc?.params
              ? {
                  instalacaoPorPainel: calc.params.instalacaoPorPainel,
                  materialCaPorWp: calc.params.materialCaPorWp,
                  deslocamentoUnit: calc.params.deslocamentoUnit,
                  viagens: form.viagens,
                  art: calc.params.art,
                  impostoPct: calc.params.impostoPct,
                  comissaoPct: calc.params.comissaoPct,
                }
              : undefined,
            custos: calc?.pricing
              ? {
                  instalacao: calc.pricing.custos.instalacao,
                  materialCa: calc.pricing.custos.materialCa,
                  deslocamento: calc.pricing.custos.deslocamento,
                  art: calc.pricing.custos.art,
                  imposto: calc.pricing.custos.imposto,
                  comissao: calc.pricing.custos.comissao,
                }
              : undefined,
            // materiais editáveis (aba Materiais)
            materiais: materiais.filter((m) => m.descricao.trim()).map((m) => ({ qtde: m.qtde, descricao: m.descricao })),
            // geração (aba Geração)
            geracao: calc?.geracao?.linhas.map((l) => ({ mes: l.mes, hsp: l.insolacao })) ?? [],
            // economia/payback (aba Payback)
            economia: calc?.economia
              ? {
                  economiaPorAno: calc.economia.economiaPorAno,
                  investimento: calc.pricing?.valorTotal ?? 0,
                  paybackAnos: calc.economia.paybackAnos,
                  economiaAno1: calc.economia.economiaAno1,
                  economiaHorizonte: calc.economia.economiaHorizonte,
                }
              : undefined,
          })}
        />
        <button className="toque text-sm text-gta-indigo hover:underline" onClick={() => router.push("/propostas")}>
          Ver propostas
        </button>
        {!calc?.pricing && <span className="text-xs text-slate-400 dark:text-slate-500">Informe o valor do kit para habilitar a geração.</span>}
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}

/** "26" -> "2 anos e 2 meses". */
function paybackTexto(meses: number): string {
  const anos = Math.floor(meses / 12);
  const m = meses % 12;
  const pa = anos > 0 ? `${anos} ano${anos > 1 ? "s" : ""}` : "";
  const pm = m > 0 ? `${m} m${m > 1 ? "eses" : "ês"}` : "";
  return [pa, pm].filter(Boolean).join(" e ") || "menos de 1 mês";
}

function GraficoGeracao({ linhas }: { linhas: { mes: string; energia: number; consumo: number }[] }) {
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.energia, l.consumo)));
  const W = 620, H = 180, pad = 24, bw = (W - pad * 2) / linhas.length;
  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[340px] sm:min-w-[520px]">
        {linhas.map((l, i) => {
          const x = pad + i * bw;
          const hg = ((H - pad * 2) * l.energia) / max;
          const hc = ((H - pad * 2) * l.consumo) / max;
          return (
            <g key={i}>
              <rect x={x + bw * 0.15} y={H - pad - hg} width={bw * 0.32} height={hg} fill="#1B7A3E" />
              <rect x={x + bw * 0.53} y={H - pad - hc} width={bw * 0.32} height={hc} fill="#E65100" />
              <text x={x + bw / 2} y={H - pad + 12} textAnchor="middle" fontSize="8" fill="#64748b">{l.mes.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 bg-[#1B7A3E]" /> Geração</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 bg-[#E65100]" /> Consumo</span>
      </div>
    </div>
  );
}
