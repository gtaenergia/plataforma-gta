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
import { TelhadoSimulador, type EstudoTelhadoSalvo } from "./TelhadoSimulador";
import { Combobox } from "@/components/Combobox";
import { Alert, Kpi } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { DetalhamentoPreco, EquipeResponsavelCard, useEquipeResponsavel, type EquipeSalva } from "@/components/equipe/EquipeResponsavel";

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
  /** Potência de cada microinversor (kW), livre. 0 = usa a sugestão. */
  microPotenciaKw: number;
  /** Qtd. de microinversores fixada à mão. 0 = usa a sugestão do cálculo. */
  microQtd: number;
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
  microQtd: 0,
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
  /** Travas do projeto real (limite de microgeração, ligação, overload). */
  avisos: { nivel: "atencao" | "critico"; titulo: string; detalhe: string }[];
  aplicado: { nPaineis: number; potenciaInversor: number; qtdInversores: number; eficiencia: number; overloadDesejado: number };
  /** Potência CA do conjunto (kW): no string, a de cada inversor × quantidade. */
  potenciaCaTotal: number;
  inversorSugerido: number;
  kwpTotal: number;
  overload: number;
  /** Só quando tipoInversor === "micro". */
  micro: null | {
    potenciaKw: number;
    qtdMicros: number;
    qtdSugerida: number;
    qtdManual: boolean;
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
    kit: number; valorTotal: number; servicos: number; margem: number; margemLiquida: number; lucro: number; lucroLiquido: number;
    /* Espelha `PricingResult["custos"]` do engine. Faltavam `execucaoCivil` e
       `cartorio`: o tipo mais estreito não dava erro, só deixava duas parcelas
       reais fora do detalhamento — e a conta na tela fecharia errado. */
    custos: { instalacao: number; materialCa: number; deslocamento: number; execucaoCivil: number; art: number; cartorio: number; imposto: number; comissao: number; total: number };
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

export function SolarConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  /* Por dimensionamento: o preço vem do kit e do fator, e as horas da GTA não
     somam. O catálogo separa usina residencial de comercial/rural, e este
     configurador não sabe qual é — por isso o tipo vem em branco, para a
     pessoa escolher. Ver `servico-demanda.ts`. */
  const equipe = useEquipeResponsavel({ servicoKey: "solar", criadoPor });
  /** O tempo de montar ESTA proposta — existe mesmo se o cliente não fechar. */
  const equipeOrc = useEquipeResponsavel({ servicoKey: "solar", criadoPor, escopo: "orcamento" });
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
  /** Parágrafo da simulação de telhado. "" = o usuário não marcou incluir. */
  const [textoTelhado, setTextoTelhado] = useState("");
  /** O texto digitado no Fator; `undefined` = mostra o número vigente. */
  const [textoFator, setTextoFator] = useState<string>();
  /**
   * O estudo do telhado, para gravar junto da proposta.
   *
   * Ele vivia só dentro do simulador e se perdia ao salvar: reabrir devolvia os
   * campos em branco, e quem tinha marcado "incluir na proposta" perdia junto o
   * parágrafo do documento — sem aviso, porque o resto da proposta voltava.
   */
  const [estudoTelhado, setEstudoTelhado] = useState<EstudoTelhadoSalvo | undefined>();
  /* Separado do de cima: o simulador só lê `inicial` na montagem, e a `key`
     o remonta quando o estudo salvo chega do servidor. */
  const [estudoTelhadoCarregado, setEstudoTelhadoCarregado] = useState<EstudoTelhadoSalvo | undefined>();
  const [painelCustom, setPainelCustom] = useState(false);
  const [invCustom, setInvCustom] = useState(false);
  const [microCustom, setMicroCustom] = useState(false);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);
  // Lista de materiais EDITÁVEL (composição do sistema) — semeada pela sugestão
  // do servidor (calc.bom) até o usuário editar/salvar.
  const [materiais, setMateriais] = useState<{ qtde: string; descricao: string }[]>([]);
  /**
   * A lista segue a sugestão do servidor ATÉ o usuário mexer nela. A partir
   * daí ela é dele: nenhum recálculo sobrescreve o que foi digitado (e quase
   * todo campo do formulário dispara recálculo). "Restaurar sugestão" é a
   * forma explícita de voltar a seguir.
   */
  const matTocado = useRef(false);
  /** A sugestão vigente quando a edição começou — base para detectar que o
   *  dimensionamento mudou DEPOIS disso (e só então avisar). */
  const bomNaEdicao = useRef("");
  // campos que o usuário já editou de propósito (a sugestão não sobrescreve)
  const touched = useRef({ nPaineis: false, inversor: false });

  /** Aviso de saída com edição pendente. Ver `useEdicaoPendente`. */
  const edicao = useEdicaoPendente();

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    // `set` é edição de gente; o preenchimento automático usa `setForm` direto
    // e não marca — senão a tela nasceria "suja" só de carregar.
    edicao.marcarEditado();
    setForm((f) => ({ ...f, [k]: v }));
  };
  const serializarBom = (itens: { qtde: string; descricao: string }[]) =>
    itens.map((b) => `${b.qtde}|${b.descricao}`).join("\n");

  /** Primeira edição: a lista passa a ser do usuário e guarda a sugestão da hora. */
  const marcarTocado = () => {
    if (matTocado.current) return;
    matTocado.current = true;
    bomNaEdicao.current = serializarBom(calc?.bom ?? []);
  };

  const setMat = (i: number, k: "qtde" | "descricao", v: string) => { marcarTocado(); setMateriais((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: v } : m))); };
  const addMat = () => { marcarTocado(); setMateriais((ms) => [...ms, { qtde: "1", descricao: "" }]); };
  const removeMat = (i: number) => { marcarTocado(); setMateriais((ms) => ms.filter((_, j) => j !== i)); };
  /** Volta a lista para a sugestão atual — e a religa ao cálculo. */
  const restaurarMat = () => {
    if (!calc?.bom) return;
    matTocado.current = false;
    bomNaEdicao.current = "";
    setMateriais(calc.bom.map((b) => ({ qtde: b.qtde, descricao: b.descricao })));
  };

  // carrega municípios, parâmetros padrão e (se reabrindo) a proposta salva
  useEffect(() => {
    fetch("/api/municipios").then((r) => r.json()).then((d) => setMunicipios(d.municipios ?? [])).catch(() => {});
    fetch("/api/distribuidoras").then((r) => r.json()).then((d) => setDistribuidoras(d.distribuidoras ?? [])).catch(() => {});
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`).then((r) => r.json()).then((d) => {
        if (d.proposta?.dados) {
          const dados = d.proposta.dados as Partial<Form> & { cond?: CondPag; materiais?: { qtde: string; descricao: string }[]; estudoTelhado?: EstudoTelhadoSalvo; equipeGta?: EquipeSalva; equipeOrcamento?: EquipeSalva };
          setForm({ ...FORM_INICIAL, ...dados });
          if (dados.cond) setCond(dados.cond as CondPag);
          if (dados.estudoTelhado) setEstudoTelhadoCarregado(dados.estudoTelhado);
          if (dados.equipeGta) equipe.restaurar(dados.equipeGta);
          if (dados.equipeOrcamento) equipeOrc.restaurar(dados.equipeOrcamento);
          // A lista salva é uma escolha do usuário: entra já "tocada", para que
          // nenhum recálculo posterior a substitua pela sugestão.
          if (Array.isArray(dados.materiais) && dados.materiais.length) { setMateriais(dados.materiais); matTocado.current = true; }
          // valores salvos são escolhas do usuário — não sobrescrever com sugestões
          touched.current = { nPaineis: (dados.nPaineis ?? 0) > 0, inversor: (dados.potenciaInversor ?? 0) > 0 };
          if (dados.potenciaPainel && !PAINEIS_COMERCIAIS.includes(dados.potenciaPainel)) setPainelCustom(true);
          if (dados.potenciaInversor && !INVERSORES_COMERCIAIS.includes(dados.potenciaInversor)) setInvCustom(true);
          // potência de micro fora do catálogo volta já no modo "Outra…"
          if (dados.microPotenciaKw && !MICROINVERSORES_COMERCIAIS.includes(dados.microPotenciaKw)) setMicroCustom(true);
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
    // O texto acompanha: sem isto o campo continuaria exibindo o fator antigo.
    setTextoFator(String(p.fator).replace(".", ","));
    setForm((f) => ({ ...f, eficiencia: p.eficiencia, overloadDesejado: p.overloadDesejado, fator: p.fator, viagens: p.viagens }));
  }

  // recálculo ao vivo (debounce) — dispara com município + consumo; painéis/inversor são sugeridos
  const temConsumo = form.consumo.some((c) => Number(c) > 0);
  const calcKey = JSON.stringify([
    form.municipio, form.consumo, form.margemSeguranca, form.tipoConexao, form.potenciaPainel, form.eficiencia,
    form.overloadDesejado, form.nPaineis, form.potenciaInversor, form.qtdInversores,
    form.tipoInversor, form.microPotenciaKw, form.microQtd, form.tipoTelhado, form.kit, form.fator, form.viagens, form.execucaoCivil,
    form.distribuidora, form.subgrupo, form.tarifaEnergia, form.dataEmissao,
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
            microQtd: form.microQtd,
            tipoTelhado: form.tipoTelhado,
            kit: form.kit,
            fator: form.fator,
            viagens: form.viagens,
            execucaoCivil: form.execucaoCivil,
            distribuidora: form.distribuidora,
            subgrupo: form.subgrupo,
            tarifaEnergia: form.tarifaEnergia,
            // Onde a projeção começa na rampa do Fio B: o ano da proposta, não
            // o de hoje — uma proposta emitida em dezembro entra em operação
            // no ano seguinte, e a rampa é por ano-calendário.
            anoInicial: Number(form.dataEmissao.slice(0, 4)) || undefined,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setCalc(data);
          // Semeia a lista com a sugestão SÓ enquanto o usuário não mexeu nela.
          // Depois disso a lista é dele — sobrescrever apagaria o que digitou.
          if (!matTocado.current && data.bom) {
            setMateriais(data.bom.map((b: { qtde: string; descricao: string }) => ({ qtde: b.qtde, descricao: b.descricao })));
          } else if (matTocado.current && !bomNaEdicao.current && data.bom) {
            // Proposta salva reaberta: o 1º cálculo vira a base de comparação,
            // para que mudanças a partir daqui acendam o aviso.
            bomNaEdicao.current = serializarBom(data.bom);
          }
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
    setForm((f) => ({ ...f, nPaineis: nP, potenciaInversor: inv, qtdInversores: 1, microPotenciaKw: 0, microQtd: 0 }));
  }

  /* `nivelMargem` vivia aqui, pintando a pílula de margem do painel que foi
     removido. O semáforo agora é o do `DetalhamentoPreco`, igual ao dos outros
     onze serviços — e as cores não tinham variante `dark:`, então no tema
     escuro o texto verde ficava sobre fundo verde-claro. */

  /**
   * O dimensionamento mudou DEPOIS que o usuário começou a editar a lista?
   * Compara a sugestão atual com a de quando a edição começou — não com a
   * lista digitada, senão qualquer edição já acenderia o aviso.
   */
  const listaDesatualizada = useMemo(() => {
    if (!matTocado.current || !calc?.bom?.length || !bomNaEdicao.current) return false;
    return serializarBom(calc.bom) !== bomNaEdicao.current;
    // `materiais` entra nas dependências de propósito: as refs acima mudam
    // sempre junto com ela (editar, restaurar), e sem isso o aviso ficaria
    // preso no valor antigo — continuava aceso logo após "Restaurar sugestão".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc?.bom, materiais]);

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

  /* A lista inteira vai para o Combobox: ele filtra sem acento e recorta a
     renderização a 100 itens — o teto que antes era improvisado aqui com o
     "digite 2+ letras". */
  const nomesMunicipios = useMemo(() => municipios.map((m) => m.nome), [municipios]);

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
      // O que vale é a potência CA TOTAL do conjunto — é ela que vai ao parecer
      // de acesso. Com mais de uma unidade, o desdobramento vem entre
      // parênteses, para o leitor saber o que comprar.
      potenciaInversor: calc.micro
        ? `${nf(calc.micro.potenciaCaTotalKw, 2)} kW (${calc.micro.qtdMicros} × ${kw(calc.micro.potenciaKw)} kW)`
        : calc.aplicado.qtdInversores > 1
          ? `${nf(calc.potenciaCaTotal, 2)} kW (${calc.aplicado.qtdInversores} × ${kw(calc.aplicado.potenciaInversor)} kW)`
          : `${kw(calc.aplicado.potenciaInversor)} kW`,
      overload: pct(calc.overload),
      qtdInversores: `${calc.aplicado.qtdInversores} ${calc.aplicado.qtdInversores > 1 ? "unidades" : "unidade"}`,
      tipoInversor: form.tipoInversor === "micro" ? "microinversor" : "inversor",
      simulacao: calc.geracao.linhas.map((l) => ({
        mes: l.mes,
        insolacao: nf(l.insolacao, 3),
        energia: nf(l.energia, 2),
        consumo: nf(l.consumo, 2),
      })),
      // Ordem: margem de segurança, estudo do telhado, texto padrão. O padrão
      // fica por último porque trata da ORIENTAÇÃO, que a simulação não cobre.
      textoObservacao:
        (form.margemSeguranca > 0
          ? `O dimensionamento inclui uma margem de segurança de ${form.margemSeguranca}%, considerando um consumo médio de ${nf(calc.sizing.consumoMedio, 0)} kWh/mês. `
          : "") +
        textoTelhado +
        form.textoObservacao,
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
      const payload = { serviceKey: "solar", cliente: form.clienteNome, status: st, dados: { ...form, cond, materiais, estudoTelhado, equipeGta: equipe.serializar(), equipeOrcamento: equipeOrc.serializar() } };
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

  const painelSelect = painelCustom ? "outro" : String(form.potenciaPainel);
  const invSelect = invCustom ? "outro" : String(form.potenciaInversor);
  const microSelect = microCustom ? "outro" : String(form.microPotenciaKw || 0);

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Identificação */}
      <section className="section-card">
        <h2 className="section-title">Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Nome do cliente *">
            <ClienteInput value={form.clienteNome} onNome={(v) => set("clienteNome", v)} onCidadeUf={(v) => set("cidadeUf", v)} />
          </Campo>
          <Campo className="sm:col-span-3" label="Cidade da instalação *" hint={<p className="mt-1 hint">Usada para buscar a irradiação solar (HSP) da região.</p>}>
            {/* Sem "criar": cidade fora da base não tem irradiação, e um nome
                digitado à mão produziria HSP nenhuma em silêncio. */}
            <Combobox
              value={form.municipio}
              onChange={preencherMunicipio}
              options={nomesMunicipios}
              permitirNovo={false}
              placeholder="Busque a cidade…"
            />
          </Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF (como sai no documento)">
            <input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" />
          </Campo>
          <Campo className="sm:col-span-3" label="Validade (dias)">
            <input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", Number(e.target.value))} />
          </Campo>
          <Campo className="sm:col-span-3" label="Emissão">
            <input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} />
          </Campo>
        </div>
        <p className="mt-2 hint">
          A referência (nº da proposta) é gerada automaticamente ao salvar.
        </p>
      </section>

      {/* 1 · Consumo */}
      <section className="section-card">
        <h2 className="section-title">Consumo mensal (kWh)</h2>
        <p className="mt-1 subtitle">
          Copie os 12 meses da conta de energia. É a única entrada necessária — o dimensionamento sai daqui.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-6">
          {MESES.map((mes, i) => (
            <div key={mes}>
              <label className="field-label uppercase tracking-wide" htmlFor={`consumo-${i}`}>{mes}</label>
              <input
                id={`consumo-${i}`}
                className="field-input"
                inputMode="numeric"
                value={form.consumo[i]}
                onChange={(e) => set("consumo", form.consumo.map((c, j) => (j === i ? e.target.value : c)))}
              />
            </div>
          ))}
          <Campo className="sm:col-span-2" label="Tipo de conexão">
            <select className="field-input" value={form.tipoConexao} onChange={(e) => set("tipoConexao", e.target.value as Form["tipoConexao"])}>
              <option value="mono">Monofásico</option>
              <option value="bi">Bifásico</option>
              <option value="tri">Trifásico</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Margem de segurança (%)" hint={<><p className="mt-1 hint">Folga p/ superdimensionar (ex.: +10%). 0 = sem folga.</p></>}>
            <input
              type="number"
              min="0"
              max="200"
              step="5"
              className="field-input"
              value={form.margemSeguranca}
              onChange={(e) => set("margemSeguranca", Number(e.target.value))}
              placeholder="0"
            />
          </Campo>
          {/* Texto, não rótulo: <label> só rotula controle de formulário, e um
              botão já se nomeia pelo próprio texto. */}
          <div className="sm:col-span-2">
            <span className="field-label">Preenchimento rápido</span>
            <button
              type="button"
              className="btn-secondary w-full"
              disabled={!Number(form.consumo[0])}
              onClick={() => set("consumo", Array(12).fill(form.consumo[0]))}
              title="Útil quando o cliente só informa a média mensal"
            >
              Repetir janeiro nos 12 meses
            </button>
          </div>
        </div>
      </section>

      {/* 2 · Dimensionamento */}
      <section className="section-card">
        <h2 className="section-title">Dimensionamento</h2>

        {!calc && (
          <p className="mt-2 subcard subtitle">
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
              <span className="text-slate-600 dark:text-slate-400"> · necessidade calculada: {nf(calc.sizing.kwpNecessaria, 2)} kWp</span>
            </div>
            <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={aplicarSugestao}>
              Aplicar sugestão
            </button>
          </div>
        )}

        {/* Avisos técnicos: nada bloqueia o orçamento, mas o que reprovaria na
            distribuidora (ou sairia errado na proposta) aparece aqui. */}
        {calc?.avisos?.length ? (
          <div className="mt-3 space-y-2">
            {calc.avisos.map((av) => (
              <Alert key={av.titulo} tone={av.nivel === "critico" ? "red" : "amber"} titulo={av.titulo}>
                {av.detalhe}
              </Alert>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            {/* `htmlFor` explícito: o rótulo fica FORA do wrapper do seletor,
                então sem ele não há associação — o leitor de tela anunciava
                apenas "caixa de combinação, 700 Wp". */}
            <label className="field-label" htmlFor="solar-painel">Potência do painel (Wp)</label>
            <div className="flex gap-2">
              <select
                id="solar-painel"
                className="field-input"
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
                <input type="number" className="field-input" value={form.potenciaPainel} onChange={(e) => set("potenciaPainel", Number(e.target.value))} />
              )}
            </div>
          </div>
          <Campo className="sm:col-span-1" label="Nº de painéis">
            <input
              type="number"
              className="field-input"
              value={form.nPaineis || ""}
              placeholder="auto"
              onChange={(e) => { touched.current.nPaineis = true; set("nPaineis", Number(e.target.value)); }}
            />
          </Campo>
          <Campo className="sm:col-span-2" label="Tipo de inversor">
            <select className="field-input" value={form.tipoInversor} onChange={(e) => set("tipoInversor", e.target.value as Form["tipoInversor"])}>
              <option value="string">Inversor (string)</option>
              <option value="micro">Microinversor</option>
            </select>
          </Campo>

          {/* Micro e string funcionam igual aqui: o catálogo é atalho e
              "Outra…" libera digitar. A quantidade também é editável — em
              branco segue a sugestão do cálculo. */}
          {ehMicro ? (
            <>
              <div className="sm:col-span-2">
                {/* mesmo caso do inversor string: o seletor mora dentro de um
                    wrapper, então o rótulo aponta por id em vez de <Campo>. */}
                <label className="field-label" htmlFor="solar-microinversor">Microinversor (kW)</label>
                <div className="flex gap-2">
                  <select
                    id="solar-microinversor"
                    className="field-input"
                    value={microSelect}
                    onChange={(e) => {
                      touched.current.inversor = true;
                      if (e.target.value === "outro") setMicroCustom(true);
                      else { setMicroCustom(false); set("microPotenciaKw", Number(e.target.value)); }
                    }}
                  >
                    {!form.microPotenciaKw && !microCustom && <option value={0}>Automático (sugerido)</option>}
                    {MICROINVERSORES_COMERCIAIS.map((p) => (
                      <option key={p} value={p}>{microLabel(p)}</option>
                    ))}
                    <option value="outro">Outra...</option>
                  </select>
                  {microCustom && (
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      className="field-input"
                      placeholder="kW"
                      value={form.microPotenciaKw || ""}
                      onChange={(e) => { touched.current.inversor = true; set("microPotenciaKw", Number(e.target.value)); }}
                    />
                  )}
                </div>
              </div>
              <Campo className="sm:col-span-1" label="Qtd. microinversores">
                <input
                  type="number"
                  min="1"
                  className="field-input"
                  value={form.microQtd || ""}
                  placeholder={calc?.micro ? String(calc.micro.qtdSugerida) : "auto"}
                  onChange={(e) => set("microQtd", Number(e.target.value))}
                  title="Em branco = a quantidade que o cálculo sugere. Digite para fixar outra."
                />
              </Campo>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                {/* "cada" no rótulo: é a potência de UMA unidade, e a
                    quantidade ao lado multiplica. Sem isso, ninguém sabia se
                    75 kW com 2 unidades queria dizer 75 ou 150. */}
                <label className="field-label" htmlFor="solar-inversor">Inversor (kW, cada)</label>
                <div className="flex gap-2">
                  <select
                    id="solar-inversor"
                    className="field-input"
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
                      className="field-input"
                      value={form.potenciaInversor}
                      onChange={(e) => { touched.current.inversor = true; set("potenciaInversor", Number(e.target.value)); }}
                    />
                  )}
                </div>
              </div>
              <Campo className="sm:col-span-1" label="Qtd. inversores">
                <input
                  type="number"
                  min={1}
                  className="field-input"
                  value={form.qtdInversores}
                  onChange={(e) => set("qtdInversores", Math.max(1, Number(e.target.value) || 1))}
                  title="A potência acima é a de CADA inversor. A quantidade multiplica a potência CA do sistema."
                />
              </Campo>
            </>
          )}
          <Campo className="sm:col-span-2" label="Tipo de telhado">
            <select className="field-input" value={form.tipoTelhado} onChange={(e) => set("tipoTelhado", e.target.value)}>
              {TIPOS_TELHADO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
        </div>

        {calc && (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
            <Kpi label="Potência do sistema" value={`${nf(calc.kwpTotal, 2)} kWp`} destaque />
            {/* Com mais de um inversor, a potência CA total substitui o consumo
                médio: é ela que a distribuidora enxerga e o denominador do
                overload — antes não aparecia em lugar nenhum no caminho string. */}
            {!calc.micro && calc.aplicado.qtdInversores > 1 ? (
              <Kpi label="Potência CA total" value={`${nf(calc.potenciaCaTotal, 2)} kW`} />
            ) : (
              <Kpi label="Consumo médio" value={`${nf(calc.sizing.consumoMedio, 0)} kWh/mês`} />
            )}
            <Kpi label="HSP média (local)" value={nf(calc.sizing.hspMedia, 2)} />
            <div className={`rounded-md p-2 shadow-sm ${overloadOk ? "bg-white dark:bg-slate-800" : "bg-amber-50 dark:bg-amber-900/30"}`}>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {calc.micro ? "Overload por micro" : "Overload do conjunto"}
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
            {calc.micro.qtdManual && calc.micro.qtdMicros !== calc.micro.qtdSugerida && (
              <p className="col-span-2 text-xs text-slate-500 sm:col-span-4 dark:text-slate-400">
                Quantidade definida por você ({calc.micro.qtdMicros}). Para este arranjo o cálculo sugeriria{" "}
                {calc.micro.qtdSugerida}
                {" — "}
                <button type="button" className="btn-link" onClick={() => set("microQtd", 0)}>
                  voltar ao sugerido
                </button>
                .
              </p>
            )}
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
          <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-400">Ajustes avançados (eficiência e overload)</summary>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Campo label="Eficiência do sistema (%)">
              <input
                type="number" step="1" min="30" max="100" className="field-input"
                value={Math.round(form.eficiencia * 100)}
                onChange={(e) => set("eficiencia", Number(e.target.value) / 100)}
              />
            </Campo>
            <Campo label="Overload desejado (%)">
              <input
                type="number" step="1" min="0" max="100" className="field-input"
                value={Math.round(form.overloadDesejado * 100)}
                onChange={(e) => set("overloadDesejado", Number(e.target.value) / 100)}
              />
            </Campo>
            <p className="col-span-2 self-end hint">
              Padrão vem dos Parâmetros (abaixo) — mude aqui só para esta proposta.
            </p>
          </div>
        </details>
      </section>

      {/* Cabe no telhado? — a resposta que a observação padrão da proposta
          hoje transfere ao cliente ("telhado com área útil compatível"). */}
      <TelhadoSimulador
        key={estudoTelhadoCarregado ? "salvo" : "novo"}
        potenciaPainel={form.potenciaPainel}
        nPaineisNecessarios={form.nPaineis > 0 ? form.nPaineis : Math.max(0, calc?.sizing.nPlacasSugerido ?? 0)}
        onTextoProposta={setTextoTelhado}
        inicial={estudoTelhadoCarregado}
        onEstadoChange={setEstudoTelhado}
      />

      {/* Geração + gráfico */}
      {calc?.geracao && (
        <section className="section-card">
          <h2 className="section-title">Simulação de geração</h2>
          <GraficoGeracao linhas={calc.geracao.linhas} />
          <div className="mt-3 overflow-x-auto">
            <table className="table-compacta">
              <thead>
                <tr><th className="py-1">Mês</th><th>Insolação</th><th>Geração (kWh)</th><th>Consumo (kWh)</th></tr>
              </thead>
              <tbody>
                {calc.geracao.linhas.map((l) => (
                  <tr key={l.mes}>
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
        <section className="section-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Lista de materiais (para cotar)</h2>
            <div className="flex items-center gap-3">
              {calc?.bom && <button type="button" className="btn-link text-xs" onClick={restaurarMat}>Restaurar sugestão</button>}
              <CopyButton label="Copiar lista" text={() => materiais.filter((m) => m.descricao.trim()).map((m) => `${m.qtde}\t${m.descricao}`).join("\n")} />
            </div>
          </div>
          <p className="mt-1 subtitle">Lista genérica (sem marca) para enviar ao distribuidor. Edite a qtde/descrição, adicione ou remova itens — vai assim para a proposta.</p>
          {/* A lista editada para de acompanhar o cálculo (senão apagaria o que
              foi digitado). Se o dimensionamento mudou depois disso, avisa —
              sem isso a proposta sairia com uma lista de outro sistema. */}
          {listaDesatualizada && (
            <Alert tone="amber" className="mt-2">
              O dimensionamento mudou depois que você editou esta lista — ela não acompanha mais o cálculo.
              Confira os itens ou{" "}
              <button type="button" className="toque font-semibold underline" onClick={restaurarMat}>
                restaure a sugestão
              </button>
              {" "}(isso descarta suas edições).
            </Alert>
          )}
          <div className="mt-3 space-y-2">
            {materiais.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="field-input shrink-0 grow-0 basis-20 text-center" value={m.qtde} onChange={(e) => setMat(i, "qtde", e.target.value)} placeholder="Qtde" />
                <input className="field-input min-w-0 flex-1" value={m.descricao} onChange={(e) => setMat(i, "descricao", e.target.value)} placeholder="Descrição do item" />
                <button type="button" className="icon-btn" onClick={() => removeMat(i)} aria-label="Remover item"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="toque mt-3 btn-link" onClick={addMat}>+ Adicionar material</button>
        </section>
      )}

      {/* 4 · Distribuidor e preço */}
      <section className="section-card">
        <h2 className="section-title">Preço e margem</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-2" label="Distribuidor">
            <select className="field-input" value={form.distribuidor} onChange={(e) => set("distribuidor", e.target.value)}>
              {DISTRIBUIDORES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Valor do kit (cotação) *">
            <input className="field-input" value={form.kit} onChange={(e) => set("kit", e.target.value)} placeholder="Ex.: 18.400,27" />
          </Campo>
          <Campo label="Fator">
            <input
              // Texto, não `type="number"`: medido num navegador pt-BR, o campo
              // numérico DESCARTA a vírgula e o dígito seguinte entra na frente
              // do que já estava. Aqui isso é pior que nas horas — "1,575"
              // viraria 5751, e o Fator multiplica o preço do kit.
              inputMode="decimal"
              className="field-input tabular-nums"
              value={textoFator ?? String(form.fator).replace(".", ",")}
              onChange={(e) => {
                setTextoFator(e.target.value);
                const n = Number(e.target.value.trim().replace(",", "."));
                if (Number.isFinite(n) && n > 0) set("fator", n);
              }}
            />
          </Campo>
          <Campo label="Viagens">
            <input type="number" min="0" className="field-input" value={form.viagens} onChange={(e) => set("viagens", Number(e.target.value))} />
          </Campo>
          <Campo className="sm:col-span-2" label="Execução civil (R$)">
            <input className="field-input" value={form.execucaoCivil} onChange={(e) => set("execucaoCivil", e.target.value)} />
          </Campo>
        </div>

        {/* Os números saíram daqui: viviam neste painel E no detalhamento logo
            abaixo, discordando um do outro. Agora existe um lugar só — o
            cartão "Detalhamento do preço". */}
      </section>

      {/* Condições de pagamento (seção compartilhada) */}
      <EquipeResponsavelCard estado={equipe} />
      <EquipeResponsavelCard estado={equipeOrc} />

      {/* A margem do Solar é medida sobre os SERVIÇOS, não sobre o valor
          total: o kit e a execução civil são repasse. As parcelas abaixo são
          exatamente as que o engine usa, para o cartão concordar com ele. */}
      {calc?.pricing && (
        <DetalhamentoPreco
          projeto={equipe}
          orcamento={equipeOrc}
          rotuloBase="Serviços da GTA"
          baseCent={Math.round(calc.pricing.servicos * 100)}
          precoSemEquipeCent={Math.round(calc.pricing.servicos * 100)}
          repasses={[
            { rotulo: "Kit fotovoltaico (distribuidor)", valor: calc.pricing.kit },
            ...(calc.pricing.custos.execucaoCivil > 0
              ? [{ rotulo: "Execução civil", valor: calc.pricing.custos.execucaoCivil }]
              : []),
          ]}
          custos={[
            { rotulo: "Instalação (mão de obra)", valor: calc.pricing.custos.instalacao },
            { rotulo: "Material CA", valor: calc.pricing.custos.materialCa },
            { rotulo: "Deslocamento", valor: calc.pricing.custos.deslocamento },
            // Execução civil NÃO entra: é repasse, já excluída de "Serviços"
            // junto com o kit — listá-la aqui repetiria o defeito da planilha.
            { rotulo: "ART", valor: calc.pricing.custos.art },
            { rotulo: "Cartório", valor: calc.pricing.custos.cartorio },
            { rotulo: "Imposto", valor: calc.pricing.custos.imposto },
            { rotulo: "Comissão", valor: calc.pricing.custos.comissao },
          ]}
        />
      )}

      <CondicoesPagamento total={calc?.pricing?.valorTotal ?? 0} value={cond} onChange={setCond} />

      {/* 5 · Economia e retorno */}
      <section className="section-card">
        <h2 className="section-title">Economia e retorno do investimento</h2>
        <p className="mt-1 subtitle">
          Informe a distribuidora e a tarifa da conta de energia. O Fio B (Lei 14.300) é buscado
          automaticamente. Requer o valor do kit preenchido acima.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Distribuidora">
            <Combobox
              value={form.distribuidora}
              onChange={(v) => set("distribuidora", v)}
              options={distribuidoras}
              placeholder="Ex.: Equatorial GO"
              rotuloNovo="Usar “{v}”"
            />
          </Campo>
          <Campo className="sm:col-span-1" label="Subgrupo">
            <select className="field-input" value={form.subgrupo} onChange={(e) => set("subgrupo", e.target.value as Form["subgrupo"])}>
              <option value="B1">B1 (residencial)</option>
              <option value="B2">B2 (rural)</option>
              <option value="B3">B3 (demais)</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-2" label="Tarifa de energia (R$/kWh)" hint={<><p className="mt-1 hint">Valor cheio da conta (com impostos).</p></>}>
            <input className="field-input" value={form.tarifaEnergia} onChange={(e) => set("tarifaEnergia", e.target.value)} placeholder="Ex.: 1,14" />
          </Campo>
        </div>

        {calc?.economia ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
              <Kpi label="Economia média/mês" value={brl(calc.economia.economiaMensalMedia)} destaque />
              <Kpi label="Economia no 1º ano" value={brl(calc.economia.economiaAno1)} />
              <div className="rounded-md bg-white p-2 shadow-sm dark:bg-slate-800">
                <div className="text-xs text-slate-600 dark:text-slate-400">Payback</div>
                <div className="mt-0.5 font-semibold text-green-700 dark:text-green-400">
                  {calc.economia.paybackAnos <= 25 ? paybackTexto(calc.economia.paybackMeses) : "acima de 25 anos"}
                </div>
              </div>
              <Kpi label="Economia em 25 anos" value={brl(calc.economia.economiaHorizonte)} />
            </div>
            <p className="mt-2 hint">
              Considera inflação da tarifa, degradação dos módulos, Fio B progressivo e o consumo simultâneo
              (ajustáveis nos Parâmetros). Gasto atual ≈ {brl(calc.economia.gastoSemSolarAno1 / 12)}/mês → com solar ≈ {brl(calc.economia.gastoComSolarAno1 / 12)}/mês.
            </p>
          </>
        ) : (
          <p className="mt-4 subcard subtitle">
            Preencha o <strong>valor do kit</strong>, a <strong>distribuidora</strong> e a <strong>tarifa</strong> para
            ver a economia mensal e o payback.
          </p>
        )}
      </section>

      {/* Parâmetros de preço e dimensionamento (retraído; disponível a todos) */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">
          Parâmetros de preço e dimensionamento
        </summary>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Valores padrão da plataforma (custos, imposto/NF, comissão, fator, eficiência). Ao salvar, valem
          para todos os próximos cálculos.
        </p>
        <div className="mt-4">
          <SolarParamsForm onSaved={aplicarParams} />
        </div>
      </details>

      {/* Textos (edição manual) */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <Campo label="Objeto"><input className="field-input" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} /></Campo>
          <Campo label="Objetivo"><textarea className="field-input min-h-[70px]" value={form.textoObjetivo} onChange={(e) => set("textoObjetivo", e.target.value)} /></Campo>
          <Campo label="Observação técnica"><textarea className="field-input min-h-[70px]" value={form.textoObservacao} onChange={(e) => set("textoObservacao", e.target.value)} /></Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Prazo de execução"><input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} /></Campo>
          </div>
        </div>
      </details>

      {/* 5 · Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}
        </button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || !calc?.pricing} title={!calc?.pricing ? "Informe o valor do kit para gerar" : undefined}>
          {gerando ? "Gerando…" : "Gerar .docx"}
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
        <button className="btn-link" onClick={() => router.push("/propostas")}>
          Ver propostas
        </button>
        {!calc?.pricing && <span className="hint">Informe o valor do kit para habilitar a geração.</span>}
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
      <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 bg-[#1B7A3E]" /> Geração</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 bg-[#E65100]" /> Consumo</span>
      </div>
    </div>
  );
}
