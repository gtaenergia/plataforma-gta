/**
 * Carregador veicular (EV) — dimensionamento (NBR 5410) + lista de materiais
 * paramétrica + precificação pelo modelo comercial real da GTA.
 * Dimensionamento (planilha do Eduardo): In = P/V, Ib = In×1,25, disjuntor
 * comercial, seção por ampacidade e queda de tensão; eletroduto pela taxa de
 * ocupação (≤40%); os materiais mudam conforme a potência (seção) e o tipo
 * (mono/tri: nº de condutores, polos do disjuntor/DR, nº de DPS, porte do quadro).
 *
 * Preço (planilha "Carregadores Avenida Parque — versão revisada"):
 *   custoGeral   = materiais + mão de obra
 *   faturamento  = custoGeral × Fator K      (Fator K = markup; padrão 1,65)
 *   impostos     = faturamento × alíquota    (padrão 7,01% = 5% + 2,01%)
 *   lucro        = faturamento − impostos − custoGeral
 *   margem líq.  = lucro / faturamento       (≈ 30% com K=1,65)
 */

export type Fase = "mono" | "tri";

const DISJUNTORES = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160];
/** Ampacidade (A) por seção (mm²) — cobre EPR/HEPR, método B1 (aprox. NBR 5410). */
const AMPACIDADE: { s: number; i: number }[] = [
  { s: 2.5, i: 24 }, { s: 4, i: 32 }, { s: 6, i: 41 }, { s: 10, i: 57 },
  { s: 16, i: 76 }, { s: 25, i: 101 }, { s: 35, i: 125 }, { s: 50, i: 151 }, { s: 70, i: 192 },
];
const CONDUTIVIDADE_CU = 56;
const menorMaiorIgual = (arr: number[], v: number) => arr.find((x) => x >= v) ?? arr[arr.length - 1];

/** Diâmetro externo aprox. do cabo isolado (mm) por seção (mm²). */
const CABO_OD: Record<number, number> = { 2.5: 4, 4: 4.5, 6: 5, 10: 6.5, 16: 8, 25: 10, 35: 11, 50: 13, 70: 15 };

interface Eletroduto { nome: string; diamInt: number; barra: number; luva: number; curva: number }
/** Eletrodutos galvanizados (GTA usa no mínimo 1"). diamInt em mm; preços R$. */
const ELETRODUTOS: Eletroduto[] = [
  { nome: '1"', diamInt: 27, barra: 45, luva: 5, curva: 15 },
  { nome: '1.1/4"', diamInt: 36, barra: 62, luva: 8, curva: 22 },
  { nome: '1.1/2"', diamInt: 41, barra: 78, luva: 10, curva: 28 },
  { nome: '2"', diamInt: 52, barra: 105, luva: 14, curva: 38 },
  { nome: '2.1/2"', diamInt: 68, barra: 150, luva: 20, curva: 55 },
];

/** Menor eletroduto com taxa de ocupação ≤ 40% (NBR 5410, ≥3 condutores). */
function selecionarEletroduto(secaoMm2: number, nCondutores: number): Eletroduto {
  const od = CABO_OD[secaoMm2] ?? 15;
  const areaCabos = nCondutores * Math.PI * (od / 2) ** 2;
  for (const e of ELETRODUTOS) {
    const areaUtil = Math.PI * (e.diamInt / 2) ** 2 * 0.4;
    if (areaCabos <= areaUtil) return e;
  }
  return ELETRODUTOS[ELETRODUTOS.length - 1];
}

export interface SizingEVInput {
  potenciaKw: number;
  fase: Fase;
  distanciaM: number;
  /** Carregador com proteção contra corrente contínua residual (RDC-DD 6 mA)
   *  integrada → permite DR Tipo A. Sem ela → exige DR Tipo B (NBR 17019). */
  protecaoCcIntegrada?: boolean;
}
export interface SizingEV {
  tensao: number;
  correnteNominal: number; // In (A)
  correnteProjeto: number; // Ib = In×1,25 (A)
  disjuntorA: number;
  polos: number; // 2 (mono) | 4 (tri)
  secaoMm2: number;
  quedaPct: number;
  nCondutores: number; // 3 (mono: F+N+T) | 5 (tri: 3F+N+T)
  nDps: number; // 2 (mono) | 4 (tri)
  eletroduto: string; // ex.: '1.1/4"'
  drTipo: "A" | "B"; // NBR 17019: nunca AC
  /** Disjuntor ou condutor saturaram no fim do catálogo — a especificação
   *  resultante fica SUBDIMENSIONADA e não pode ser usada como está. */
  acimaDoCatalogo: boolean;
  /** Queda maior que 4% mesmo na maior bitola disponível. */
  quedaAcimaDoLimite: boolean;
}

/**
 * Queda de tensão (fração).
 *
 * O fator muda com o sistema: monofásico percorre ida e volta (2·I·L),
 * trifásico equilibrado usa √3·I·L. Antes o código aplicava 2 nos dois casos,
 * superestimando a queda trifásica em 15,5% (2/√3) e às vezes puxando uma
 * bitola acima do necessário.
 */
function quedaDeTensao(fase: Fase, corrente: number, comprimentoM: number, secaoMm2: number, tensao: number): number {
  const fator = fase === "mono" ? 2 : Math.sqrt(3);
  return (fator * corrente * comprimentoM) / (CONDUTIVIDADE_CU * secaoMm2 * tensao);
}

/** Teto prático da recarga em corrente alternada (IEC 61851 modo 3: 63 A/fase). */
export const POTENCIA_MAX_CA_KW = 44;

export function dimensionarEV(i: SizingEVInput): SizingEV {
  const fase = i.fase;
  const tensao = fase === "mono" ? 220 : 380;
  const raiz = fase === "mono" ? 1 : Math.sqrt(3);
  const P = Math.max(0, i.potenciaKw) * 1000;
  const In = P / (raiz * tensao);
  const Ib = In * 1.25;
  const L = Math.max(1, i.distanciaM);

  // NBR 5410: Ib ≤ In(dispositivo) ≤ Iz(condutor). O disjuntor era escolhido
  // sobre In (a corrente da carga), não sobre Ib — então a proposta saía com
  // "42 A de projeto" protegidos por um disjuntor de 40 A, violando a primeira
  // condição em todos os casos. Recarga veicular é carga contínua (horas em
  // corrente plena), que é o motivo de o fator 1,25 existir.
  const maiorDisjuntor = DISJUNTORES[DISJUNTORES.length - 1];
  const disjuntorA = menorMaiorIgual(DISJUNTORES, Ib);
  const acimaDoCatalogoDisjuntor = Ib > maiorDisjuntor;

  // O condutor protege-se pelo DISJUNTOR, não pela corrente de projeto: a
  // ampacidade tem de suportar o que o dispositivo deixa passar.
  const maiorAmpacidade = AMPACIDADE[AMPACIDADE.length - 1];
  let escolha = maiorAmpacidade;
  let achou = false;
  for (const a of AMPACIDADE) {
    if (a.i < disjuntorA) continue;
    escolha = a;
    achou = true;
    if (quedaDeTensao(fase, In, L, a.s, tensao) <= 0.04) break;
  }
  const acimaDoCatalogoCabo = !achou;

  const quedaPct = quedaDeTensao(fase, In, L, escolha.s, tensao);
  const nCondutores = fase === "mono" ? 3 : 5;
  const eletroduto = selecionarEletroduto(escolha.s, nCondutores);

  return {
    tensao,
    correnteNominal: In,
    correnteProjeto: Ib,
    disjuntorA,
    polos: fase === "mono" ? 2 : 4,
    secaoMm2: escolha.s,
    quedaPct,
    nCondutores,
    nDps: fase === "mono" ? 2 : 4,
    eletroduto: eletroduto.nome,
    drTipo: i.protecaoCcIntegrada ? "A" : "B",
    acimaDoCatalogo: acimaDoCatalogoDisjuntor || acimaDoCatalogoCabo,
    quedaAcimaDoLimite: quedaPct > 0.04,
  };
}

// ----------------------------------------------------- Lista de materiais (BOM)

// Preços-base de referência (R$), calibrados por cotações reais da GTA
// (Megaluz/KG/Schneider, 2025). São só a SUGESTÃO inicial — editáveis na tela.
export const PRECOS_BASE = {
  abracadeira: 2.5, buchaArruela: 3, dps: 60, haste: 66, caixaInspecao: 25,
  conectorAterr: 12, terminal: 1.8, fitaIsolante: 15, fitaAutofusao: 25,
};
const CABO_PRECO: Record<number, number> = { 2.5: 5, 4: 6.5, 6: 8, 10: 12, 16: 18, 25: 28, 35: 38, 50: 55, 70: 78 };
/** Disjuntor (base bipolar). Tetrapolar ≈ ×1,9. */
const DISJ_PRECO: Record<number, number> = { 16: 45, 20: 48, 25: 52, 32: 56, 40: 60, 50: 70, 63: 90, 80: 120, 100: 150, 125: 190, 160: 240 };
/** DR Tipo A (base bipolar). Tetrapolar ≈ ×1,8; Tipo B ≈ ×3,5 (dispositivo especial). */
const DR_PRECO: Record<number, number> = { 25: 300, 40: 350, 50: 380, 63: 420, 80: 520, 100: 620, 125: 750, 160: 900 };
/** Quadro de distribuição IP65 por porte (mono menor / tri maior). */
const QUADRO_PRECO = { mono: 80, tri: 140 };

/** Chave da tabela que atende `k` — exata, ou a menor acima dela. */
const chaveDe = (tabela: Record<number, number>, k: number) =>
  k in tabela ? k : menorMaiorIgual(Object.keys(tabela).map(Number).sort((a, b) => a - b), k);
const precoDe = (tabela: Record<number, number>, k: number) => tabela[chaveDe(tabela, k)] ?? 0;

/** Formata a seção (mm²) em pt-BR: 2,5 · 10 · 16. */
const secFmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export interface BomItemEV {
  /** Id no catálogo de preços — permite avisar sobre o que ESTA lista usa. */
  precoId?: string;
  categoria: string;
  descricao: string;
  unidade: string;
  qtd: number;
  precoUnit: number;
  precoTotal: number;
}

/** Chave do eletroduto no catálogo central (1" -> "1", 1.1/4" -> "1_1_4"). */
const chaveEletroduto = (nome: string) => nome.replace(/"/g, "").replace(/[./]/g, "_");

export function gerarBomEV(
  s: SizingEV,
  distanciaM: number,
  qtd: number,
  /** Preços revisados em /nova → Preços de materiais. Ausentes caem no padrão. */
  precos?: Record<string, number>,
): { itens: BomItemEV[]; custoMateriais: number } {
  const L = Math.max(1, distanciaM);
  const n = Math.max(1, qtd);
  const tri = s.polos === 4;
  const eletroduto = selecionarEletroduto(s.secaoMm2, s.nCondutores);
  const barras = Math.ceil(L / 3);
  /** Preço do registro central, com o padrão do motor como reserva. */
  const P = (id: string, padrao: number) => {
    const v = precos?.[`carregador.${id}`];
    return v != null && Number.isFinite(v) && v >= 0 ? v : padrao;
  };
  const ed = chaveEletroduto(eletroduto.nome);

  const item = (categoria: string, descricao: string, unidade: string, qtdLiquida: number, precoUnit: number, precoId?: string): BomItemEV => {
    const q = Math.ceil(qtdLiquida);
    return { precoId, categoria, descricao, unidade, qtd: q, precoUnit, precoTotal: q * precoUnit };
  };

  const precoDisj = Math.round(P(`disjuntor.${chaveDe(DISJ_PRECO, s.disjuntorA)}`, precoDe(DISJ_PRECO, s.disjuntorA)) * (tri ? 1.9 : 1));
  const drTipoB = s.drTipo === "B";
  const precoDr = Math.round(P(`dr.${chaveDe(DR_PRECO, s.disjuntorA)}`, precoDe(DR_PRECO, s.disjuntorA)) * (tri ? 1.8 : 1) * (drTipoB ? 3.5 : 1));
  const drDescricao = drTipoB
    ? `Interruptor DR Tipo B ${s.disjuntorA} A / 30 mA (${s.polos}P) — proteção CC (NBR 17019)`
    : `Interruptor DR Tipo A ${s.disjuntorA} A / 30 mA (${s.polos}P) — carregador com RDC-DD 6 mA integrado`;

  // Cada ponto tem circuito exclusivo (NBR 17019), então a infraestrutura
  // acompanha a quantidade — ela ficava congelada enquanto quadro, disjuntor,
  // DR e DPS multiplicavam: uma obra de 4 pontos era orçada com o cabo e o
  // eletroduto de UM, subfaturando a instalação.
  const itens: BomItemEV[] = [
    item("Infraestrutura", `Eletroduto galvanizado pesado ${eletroduto.nome} (barra 3 m)`, "barra", barras * n, P(`eletroduto.${ed}.barra`, eletroduto.barra), `carregador.eletroduto.${ed}.barra`),
    item("Infraestrutura", `Luva galvanizada ${eletroduto.nome}`, "un", barras * n, P(`eletroduto.${ed}.luva`, eletroduto.luva), `carregador.eletroduto.${ed}.luva`),
    item("Infraestrutura", `Curva galvanizada ${eletroduto.nome} 90º`, "un", 4 * n, P(`eletroduto.${ed}.curva`, eletroduto.curva), `carregador.eletroduto.${ed}.curva`),
    item("Infraestrutura", `Abraçadeira tipo D / Unistrut ${eletroduto.nome}`, "un", Math.ceil(L * 0.75) * n, P("abracadeira", PRECOS_BASE.abracadeira), "carregador.abracadeira"),
    item("Infraestrutura", `Bucha e arruela de alumínio ${eletroduto.nome}`, "par", 4 * n, P("buchaArruela", PRECOS_BASE.buchaArruela), "carregador.buchaArruela"),
    item("Cabeamento", `Cabo flexível HEPR ${secFmt(s.secaoMm2)} mm² (${tri ? "3F+N+T" : "F+N+T"})`, "m", L * s.nCondutores * n, P(`cabo.${chaveDe(CABO_PRECO, s.secaoMm2)}`, precoDe(CABO_PRECO, s.secaoMm2)), `carregador.cabo.${chaveDe(CABO_PRECO, s.secaoMm2)}`),
    item("Proteção", `Quadro de distribuição IP65 (${tri ? "12 DIN" : "6 a 8 DIN"})`, "un", n, tri ? P("quadro.tri", QUADRO_PRECO.tri) : P("quadro.mono", QUADRO_PRECO.mono), tri ? "carregador.quadro.tri" : "carregador.quadro.mono"),
    item("Proteção", `Disjuntor termomagnético ${s.disjuntorA} A curva C (${s.polos}P)`, "un", n, precoDisj, `carregador.disjuntor.${chaveDe(DISJ_PRECO, s.disjuntorA)}`),
    item("Proteção", drDescricao, "un", n, precoDr, `carregador.dr.${chaveDe(DR_PRECO, s.disjuntorA)}`),
    item("Proteção", `Protetor de surto (DPS) Classe II 275 V / 40 kA`, "un", s.nDps * n, P("dps", PRECOS_BASE.dps), "carregador.dps"),
    item("Aterramento", 'Haste de aterramento cobreada 5/8" x 2,40 m', "un", n, P("haste", PRECOS_BASE.haste), "carregador.haste"),
    item("Aterramento", "Caixa de inspeção de solo", "un", n, P("caixaInspecao", PRECOS_BASE.caixaInspecao), "carregador.caixaInspecao"),
    item("Aterramento", "Conector tipo cunha / grampo", "un", n, P("conectorAterr", PRECOS_BASE.conectorAterr), "carregador.conectorAterr"),
    item("Acessórios", `Terminal tubular (ilhós) ${secFmt(s.secaoMm2)} mm²`, "un", s.nCondutores * 2 * n, P("terminal", PRECOS_BASE.terminal), "carregador.terminal"),
    item("Acessórios", "Fita isolante alta qualidade (rolo 20 m)", "un", n, P("fitaIsolante", PRECOS_BASE.fitaIsolante), "carregador.fitaIsolante"),
    item("Acessórios", "Fita de autofusão (emendas externas)", "un", n, P("fitaAutofusao", PRECOS_BASE.fitaAutofusao), "carregador.fitaAutofusao"),
  ];
  const custoMateriais = itens.reduce((sum, it) => sum + it.precoTotal, 0);
  return { itens, custoMateriais };
}

// ----------------------------------------------------- Precificação

export interface PrecoEVParams {
  maoObraPorPonto: number;
  /** Fator K: markup aplicado sobre o custo geral (planilha revisada: 1,65). */
  fatorK: number;
  /** Alíquota de impostos sobre o faturamento (planilha revisada: 0,0701). */
  aliqImpostos: number;
}
export interface PrecoEVResult {
  custoMateriais: number;
  maoObra: number;
  custoGeral: number;
  fatorK: number;
  preco: number; // faturamento (custo × Fator K, arredondado)
  impostos: number;
  lucro: number; // faturamento − impostos − custo
  margem: number; // margem líquida = lucro / faturamento
}

export function precoEV(custoMateriais: number, qtd: number, p: PrecoEVParams): PrecoEVResult {
  const maoObra = p.maoObraPorPonto * Math.max(1, qtd);
  const custoGeral = custoMateriais + maoObra;
  const k = Math.min(4, Math.max(1, p.fatorK));
  const preco = Math.round((custoGeral * k) / 10) * 10;
  const aliq = Math.min(0.5, Math.max(0, p.aliqImpostos));
  const impostos = preco * aliq;
  const lucro = preco - impostos - custoGeral;
  const margem = preco > 0 ? lucro / preco : 0;
  return { custoMateriais, maoObra, custoGeral, fatorK: k, preco, impostos, lucro, margem };
}
