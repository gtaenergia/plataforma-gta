import type { Evento } from "./motor";
import { contaDre, type ConfigFinanceiro, type ContaDre, type ReceitaCrm } from "./tipos";

/**
 * DRE mês a mês, na sequência da aba "DRE-BP-DFC" da planilha "Gestão
 * Financeira - GTA Energia" — os mesmos nomes e a mesma memória de cálculo.
 *
 * Regime de competência, que é o que o DRE pede:
 * - Negociação ganha no CRM entra como faturamento no MÊS EM QUE FOI GANHA,
 *   pelo valor inteiro — mesmo que o dinheiro venha em parcelas depois. Os
 *   recebimentos ligados a ela (no caixa) não contam de novo.
 * - Os demais lançamentos contam no mês do vencimento, pagos ou não.
 *
 * Uma correção em relação à planilha: lá, LAIR = EBITDA − RF − DA, com
 * RF = receitas − despesas financeiras. Isso SUBTRAI os juros recebidos. Aqui
 * o resultado financeiro entra com o próprio sinal: LAIR = EBITDA + RF − DA.
 */

export type TipoLinha = "titulo" | "conta" | "sub" | "resultado" | "pct" | "fora";

export interface LinhaDre {
  key: string;
  rotulo: string;
  /** "Memória de cálculo" da planilha (sigla e fórmula). */
  memoria?: string;
  tipo: TipoLinha;
  /** 12 meses (jan…dez). Percentuais em fração (0,25 = 25%). */
  valores: number[];
  total: number;
}

export interface Dre {
  ano: number;
  linhas: LinhaDre[];
}

const DV_SUBS: { key: ContaDre; rotulo: string }[] = [
  { key: "dv:comissoes", rotulo: "Comissões de venda" },
  { key: "dv:combustivel", rotulo: "Combustível" },
  { key: "dv:alimentacao", rotulo: "Alimentação" },
  { key: "dv:art", rotulo: "ART" },
  { key: "dv:marketing", rotulo: "Marketing – tráfego pago" },
  { key: "dv:pedagio", rotulo: "Pedágio" },
  { key: "dv:outras", rotulo: "Outras despesas variáveis" },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const zeros = () => Array.from({ length: 12 }, () => 0);
const soma = (a: number[]) => r2(a.reduce((s, v) => s + v, 0));
const combina = (f: (...v: number[]) => number, ...arrs: number[][]) => zeros().map((_, i) => r2(f(...arrs.map((a) => a[i]))));
const pct = (num: number[], den: number[]) => zeros().map((_, i) => (den[i] ? num[i] / den[i] : 0));

/** Depreciação mensal de cada bem, no ano pedido. */
export function depreciacaoDoAno(cfg: ConfigFinanceiro, ano: number): { nome: string; valores: number[] }[] {
  return cfg.bens.map((b) => {
    const valores = zeros();
    const [y0, m0] = b.inicio.split("-").map(Number);
    const parcela = b.valor / b.vidaMeses;
    for (let i = 0; i < 12; i++) {
      const decorridos = (ano - y0) * 12 + (i + 1 - m0); // 0 = o mês de início
      if (decorridos >= 0 && decorridos < b.vidaMeses) valores[i] = r2(parcela);
    }
    return { nome: b.nome, valores };
  });
}

export function calcularDre(evs: Evento[], crm: ReceitaCrm[], cfg: ConfigFinanceiro, ano: number): Dre {
  const prefixo = String(ano);
  const ganhas = new Set(crm.map((n) => n.negociacaoId));
  const porConta = new Map<ContaDre, number[]>();
  const fixasPorDesc = new Map<string, number[]>();
  const add = (conta: ContaDre, mes: number, v: number) => {
    let a = porConta.get(conta);
    if (!a) porConta.set(conta, (a = zeros()));
    a[mes] += v;
  };

  const doCrm = zeros();
  for (const n of crm) {
    if (!n.fechadoEm.startsWith(prefixo) || !(n.valor > 0)) continue;
    doCrm[+n.fechadoEm.slice(5, 7) - 1] += n.valor;
  }

  for (const e of evs) {
    if (e.crm) continue; // o "falta receber" do CRM é caixa, não competência
    if (!e.data.startsWith(prefixo)) continue;
    // Recebimento de negociação ganha: o faturamento já entrou no mês do fechamento.
    if (e.k === "r" && e.negociacaoId && ganhas.has(e.negociacaoId)) continue;
    const mes = +e.data.slice(5, 7) - 1;
    const conta = contaDre(e.k, e.cat, e.dre, cfg);
    // Empréstimo é o único que vai e volta: o que entrou soma, o que saiu subtrai.
    add(conta, mes, conta === "emprestimo" && e.k === "d" ? -e.valor : e.valor);
    if (conta === "df") {
      const chave = e.desc.trim() || "Sem descrição";
      let a = fixasPorDesc.get(chave);
      if (!a) fixasPorDesc.set(chave, (a = zeros()));
      a[mes] += e.valor;
    }
  }

  const c = (k: ContaDre) => (porConta.get(k) ?? zeros()).map(r2);
  const lancados = c("receita");
  const FB = combina((a, b) => a + b, doCrm, lancados);
  const I = c("impostos");
  const C = c("deducoes");
  const FL = combina((fb, i, cc) => fb - i - cc, FB, I, C);
  const CSV = c("csv");
  const LB = combina((fl, csv) => fl - csv, FL, CSV);
  const dvSubs = DV_SUBS.map((s) => ({ ...s, valores: c(s.key) }));
  const DV = combina((...v) => v.reduce((s, x) => s + x, 0), ...dvSubs.map((s) => s.valores));
  const MC = combina((lb, dv) => lb - dv, LB, DV);
  const DF = c("df");
  const OPEX = combina((dv, df) => dv + df, DV, DF);
  const EBITDA = combina((mc, df) => mc - df, MC, DF);
  const RECF = c("rec_fin");
  const DESPF = c("desp_fin");
  const RF = combina((a, b) => a - b, RECF, DESPF);
  const bens = depreciacaoDoAno(cfg, ano);
  const DEP = combina((...v) => v.reduce((s, x) => s + x, 0), ...(bens.length ? bens.map((b) => b.valores) : [zeros()]));
  const AMORT = zeros();
  const DA = combina((a, b) => a + b, DEP, AMORT);
  const LAIR = combina((eb, rf, da) => eb + rf - da, EBITDA, RF, DA);
  const IL = c("ir");
  const LL = combina((l, il) => l - il, LAIR, IL);

  const L = (key: string, rotulo: string, tipo: TipoLinha, valores: number[], memoria?: string): LinhaDre => ({
    key,
    rotulo,
    memoria,
    tipo,
    valores,
    total: soma(valores),
  });
  const P = (key: string, rotulo: string, num: number[], den: number[], memoria?: string): LinhaDre => ({
    key,
    rotulo,
    memoria,
    tipo: "pct",
    valores: pct(num, den),
    total: soma(den) ? soma(num) / soma(den) : 0,
  });

  const fixas = [...fixasPorDesc]
    .map(([desc, v]) => ({ desc, valores: v.map(r2) }))
    .sort((a, b) => soma(b.valores) - soma(a.valores));

  const linhas: LinhaDre[] = [
    L("fb", "(+) Faturamento bruto de serviços", "conta", FB, "FB"),
    L("fb:crm", "Negociações ganhas no CRM (mês do fechamento)", "sub", doCrm.map(r2)),
    L("fb:lanc", "Recebimentos lançados no Financeiro", "sub", lancados),
    L("i", "(−) Impostos sobre faturamento", "conta", I, "I"),
    L("c", "(−) Deduções e cancelamentos", "conta", C, "C"),
    L("fl", "(=) Faturamento líquido", "resultado", FL, "FL = FB − I − C"),
    L("csv", "(−) Custo dos serviços (CSV)", "conta", CSV, "CSV"),
    L("lb", "(=) Lucro bruto", "resultado", LB, "LB = FL − CSV"),
    P("mb", "Margem bruta %", LB, FL, "MB = LB / FL"),
    L("opex", "(−) Despesas totais", "conta", OPEX, "OPEX = DV + DF"),
    L("dv", "(−) Despesas variáveis", "conta", DV, "DV"),
    ...dvSubs.map((s) => L(s.key, s.rotulo, "sub", s.valores)),
    L("mc", "(=) Margem de contribuição", "resultado", MC, "MC = LB − DV"),
    P("mcp", "Margem de contribuição %", MC, FL, "MC% = MC / FL"),
    L("df", "(−) Despesas fixas", "conta", DF, "DF"),
    ...fixas.map((f, i) => L(`df:${i}`, f.desc, "sub", f.valores)),
    L("ebitda", "(=) EBITDA (resultado operacional)", "resultado", EBITDA, "EBITDA = MC − DF  ou  LB − OPEX"),
    P("ebitdap", "Margem EBITDA %", EBITDA, FL, "EBITDA% = EBITDA / FL"),
    L("rf", "(=) Resultado financeiro", "conta", RF, "RF = receitas − despesas financeiras"),
    L("rf:rec", "Receitas financeiras", "sub", RECF, "Juros de investimentos"),
    L("rf:desp", "Despesas financeiras", "sub", DESPF, "Juros de empréstimos, tarifas"),
    L("da", "(−) Depreciação e amortização", "conta", DA, "DA"),
    ...bens.map((b, i) => L(`da:${i}`, `Depreciação · ${b.nome}`, "sub", b.valores)),
    L("da:amort", "Amortização", "sub", AMORT),
    L("lair", "(=) LAIR (lucro antes do IR)", "resultado", LAIR, "LAIR = EBITDA + RF − DA"),
    L("il", "(−) Imposto sobre o lucro", "conta", IL, "IL"),
    L("ll", "(=) LUCRO LÍQUIDO", "resultado", LL, "LL = LAIR − IL"),
    P("mlp", "Margem líquida %", LL, FL, "LL% = LL / FL"),
    L("fora:retirada", "Retiradas e despesas pessoais dos sócios", "fora", c("retirada")),
    L("fora:invest", "Compra de bens (imobilizado)", "fora", c("investimento")),
    L("fora:emprest", "Empréstimos e aportes, líquido (entrou − saiu)", "fora", c("emprestimo")),
  ];
  return { ano, linhas };
}
