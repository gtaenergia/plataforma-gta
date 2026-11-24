import { z } from "zod";

/**
 * Modelo do Financeiro — o mesmo do artefato "GTA Controle Financeiro", que
 * os sócios usaram no chat antes de o módulo existir aqui. Manter os nomes
 * curtos dos campos (`k`, `nat`, `cat`…) é deliberado: os dados do artefato
 * entram por importação sem tradução, e o motor de projeção foi portado linha
 * a linha.
 *
 * - Lançamento (`lanc`): uma conta a pagar ou a receber, num dia.
 *   Com `rec` + `mes` substitui a ocorrência daquele mês de um recorrente;
 *   com `skip` pula aquele mês. Com `negociacaoId` está ligado a uma
 *   negociação ganha no CRM (é parte do que ela vai pagar).
 * - Recorrente (`rec`): uma regra que gera um lançamento por mês.
 * - Saldo conferido: o saldo real do banco no fim de um dia. Âncora de toda a
 *   projeção.
 */

export type Tipo = "d" | "r"; // d = a pagar (despesa), r = a receber (receita)
export type Natureza = "fixo" | "variavel";

export interface Lancamento {
  id: string;
  k: Tipo;
  desc: string;
  valor: number;
  /** Vencimento (AAAA-MM-DD). */
  data: string;
  nat: Natureza;
  cat: string;
  quem: string;
  proj: string;
  pago: boolean;
  /** Dia em que saiu/entrou no banco, quando pago. */
  pagoEm?: string;
  /** Recorrente que esta ocorrência substitui (com `mes`). */
  rec?: string;
  mes?: string;
  /** Pula a ocorrência `mes` do recorrente `rec`. */
  skip?: boolean;
  /** Negociação ganha no CRM de que este lançamento faz parte. */
  negociacaoId?: string;
  /** Linha do DRE escolhida à mão; vazio = a da categoria. */
  dre?: ContaDre;
  by?: string;
  byNome?: string;
  ts?: number;
}

export interface Recorrente {
  id: string;
  k: Tipo;
  desc: string;
  valor: number;
  /** Dia do mês do vencimento (1–31; meses curtos usam o último dia). */
  dia: number;
  /** Primeiro mês (AAAA-MM). */
  ini: string;
  /** Último mês (AAAA-MM) ou null = sem fim. */
  fim: string | null;
  nat: Natureza;
  cat: string;
  quem: string;
  proj: string;
  dre?: ContaDre;
  by?: string;
  byNome?: string;
  ts?: number;
}

export interface SaldoConferido {
  data: string;
  valor: number;
  by?: string;
  byNome?: string;
  ts?: number;
}

export interface HistoricoBanco {
  fonte: string;
  meses: { m: string; ent: number; sai: number; fim: number }[];
}

/** Negociação ganha no CRM, como o Financeiro a enxerga. */
export interface ReceitaCrm {
  negociacaoId: string;
  nome: string;
  cliente: string;
  /** Valor pontual (o que entra no DRE e no caixa). */
  valor: number;
  /** Parte recorrente (por mês), que precisa virar um recorrente aqui. */
  mensal: number;
  /** Dia do fechamento no horário de Brasília (AAAA-MM-DD). */
  fechadoEm: string;
  responsavelNome: string;
}

// ------------------------------------------------------------------ DRE

/**
 * Linhas do DRE, na sequência da aba "DRE-BP-DFC" da planilha "Gestão
 * Financeira - GTA Energia". As despesas variáveis têm os mesmos subitens da
 * planilha; as fixas se abrem por descrição, como lá (uma linha por conta).
 *
 * `retirada`, `investimento` e `emprestimo` não entram no resultado: são
 * dinheiro que sai do caixa sem ser despesa da operação. Aparecem abaixo do
 * Lucro Líquido, para o caixa e o DRE fecharem a mesma conversa.
 */
export const CONTAS_DRE = {
  receita: "Faturamento bruto de serviços",
  impostos: "Impostos sobre faturamento",
  deducoes: "Deduções e cancelamentos",
  csv: "Custo dos serviços (CSV)",
  "dv:comissoes": "Despesa variável · Comissões de venda",
  "dv:combustivel": "Despesa variável · Combustível",
  "dv:alimentacao": "Despesa variável · Alimentação",
  "dv:art": "Despesa variável · ART",
  "dv:marketing": "Despesa variável · Marketing – tráfego pago",
  "dv:pedagio": "Despesa variável · Pedágio",
  "dv:outras": "Despesa variável · Outras",
  df: "Despesas fixas",
  rec_fin: "Receitas financeiras",
  desp_fin: "Despesas financeiras",
  ir: "Imposto sobre o lucro",
  retirada: "Fora do DRE · Retirada e despesa pessoal dos sócios",
  investimento: "Fora do DRE · Compra de bens (imobilizado)",
  emprestimo: "Fora do DRE · Empréstimos e aportes (principal)",
} as const;

export type ContaDre = keyof typeof CONTAS_DRE;
export const CONTA_DRE_KEYS = Object.keys(CONTAS_DRE) as ContaDre[];
export const isContaDre = (v: unknown): v is ContaDre => typeof v === "string" && v in CONTAS_DRE;

/** Contas que fazem sentido para cada tipo de lançamento. */
export const CONTAS_DE: Record<Tipo, ContaDre[]> = {
  r: ["receita", "rec_fin", "emprestimo"],
  d: CONTA_DRE_KEYS.filter((k) => k !== "receita" && k !== "rec_fin"),
};

/** Categorias sugeridas no formulário (as do artefato, mais as que o DRE pede). */
export const CATEGORIAS: Record<Tipo, string[]> = {
  d: [
    "Pró-labore e sócios",
    "Equipe",
    "Terceiros e parceiros",
    "Materiais e equipamentos",
    "Impostos sobre faturamento",
    "Contabilidade e impostos",
    "Software e IA",
    "Comercial e BNI",
    "Comissões de venda",
    "Marketing e tráfego pago",
    "ART",
    "Deslocamento e combustível",
    "Pedágio",
    "Alimentação",
    "Juros e tarifas bancárias",
    "Cartões de crédito",
    "Pessoal dos sócios",
    "Compra de equipamentos",
    "Empréstimos (principal)",
    "Outros",
  ],
  r: ["Consultoria recorrente", "Projetos", "Serviços e manutenção", "Laudos e medições", "Rendimentos e juros", "Aportes e empréstimos", "Outros"],
};

/**
 * Para onde cada categoria vai no DRE, se ninguém disser outra coisa. Editável
 * em Financeiro → Configurações, e cada lançamento pode escolher a sua.
 *
 * Cartões de crédito e "Pessoal dos sócios" saem do resultado como retirada:
 * foi como o artefato os separou (psicóloga, cartões pessoais), à espera de a
 * contabilidade confirmar.
 */
export const MAPA_PADRAO: Record<Tipo, Record<string, ContaDre>> = {
  d: {
    "Pró-labore e sócios": "df",
    Equipe: "df",
    "Terceiros e parceiros": "csv",
    "Materiais e equipamentos": "csv",
    "Impostos sobre faturamento": "impostos",
    "Contabilidade e impostos": "df",
    "Software e IA": "df",
    "Comercial e BNI": "dv:outras",
    "Comissões de venda": "dv:comissoes",
    "Marketing e tráfego pago": "dv:marketing",
    ART: "dv:art",
    "Deslocamento e combustível": "dv:combustivel",
    Pedágio: "dv:pedagio",
    Alimentação: "dv:alimentacao",
    "Juros e tarifas bancárias": "desp_fin",
    "Cartões de crédito": "retirada",
    "Pessoal dos sócios": "retirada",
    "Compra de equipamentos": "investimento",
    "Empréstimos (principal)": "emprestimo",
    Outros: "dv:outras",
  },
  r: {
    "Consultoria recorrente": "receita",
    Projetos: "receita",
    "Serviços e manutenção": "receita",
    "Laudos e medições": "receita",
    "Rendimentos e juros": "rec_fin",
    "Aportes e empréstimos": "emprestimo",
    Outros: "receita",
  },
};

/** Bem que deprecia mês a mês (linha "Depreciação" da planilha). */
export interface BemDepreciavel {
  id: string;
  nome: string;
  valor: number;
  /** Vida útil em meses (ex.: 5 anos = 60). */
  vidaMeses: number;
  /** Primeiro mês de depreciação (AAAA-MM). */
  inicio: string;
}

export interface ConfigFinanceiro {
  /** Categoria → linha do DRE, por tipo. Só o que difere do padrão. */
  mapa: Record<Tipo, Record<string, ContaDre>>;
  bens: BemDepreciavel[];
  /** Dias entre ganhar a negociação e o recebimento previsto no caixa. */
  prazoCrmDias: number;
}

/**
 * Bens da planilha (Analisador 11.000/60, Notebook 5.000/36, Multímetro
 * 700/36). O mês de início não estava na planilha: janeiro de 2026, o
 * exercício que ela cobre.
 */
export const CONFIG_PADRAO: ConfigFinanceiro = {
  mapa: { d: {}, r: {} },
  bens: [
    { id: "analisador", nome: "Analisador", valor: 11000, vidaMeses: 60, inicio: "2026-01" },
    { id: "notebook", nome: "Notebook", valor: 5000, vidaMeses: 36, inicio: "2026-01" },
    { id: "multimetro", nome: "Multímetro", valor: 700, vidaMeses: 36, inicio: "2026-01" },
  ],
  prazoCrmDias: 30,
};

/** A linha do DRE de um lançamento: a escolhida, senão a da categoria. */
export function contaDre(k: Tipo, cat: string, escolhida: ContaDre | undefined, cfg: ConfigFinanceiro): ContaDre {
  if (escolhida && CONTAS_DE[k].includes(escolhida)) return escolhida;
  const m = cfg.mapa[k]?.[cat] ?? MAPA_PADRAO[k][cat];
  if (m && CONTAS_DE[k].includes(m)) return m;
  return k === "r" ? "receita" : "dv:outras";
}

// ------------------------------------------------------------ validação

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const mes = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido");
const texto = (max: number) => z.string().trim().max(max).default("");
const valor = z.number().positive("O valor precisa ser maior que zero").max(1e9);
const conta = z.enum(CONTA_DRE_KEYS as [ContaDre, ...ContaDre[]]).optional();

export const lancamentoSchema = z.object({
  k: z.enum(["d", "r"]),
  desc: z.string().trim().min(1, "Informe a descrição").max(120),
  valor,
  data: iso,
  nat: z.enum(["fixo", "variavel"]).default("variavel"),
  cat: z.string().trim().max(60).default("Outros"),
  quem: texto(60),
  proj: texto(60),
  pago: z.boolean().default(false),
  pagoEm: iso.optional(),
  rec: z.string().trim().max(64).optional(),
  mes: mes.optional(),
  skip: z.boolean().optional(),
  negociacaoId: z.string().trim().max(64).optional(),
  dre: conta,
});
export type LancamentoInput = z.infer<typeof lancamentoSchema>;

export const recorrenteSchema = z
  .object({
    k: z.enum(["d", "r"]),
    desc: z.string().trim().min(1, "Informe a descrição").max(120),
    valor,
    dia: z.number().int().min(1).max(31),
    ini: mes,
    fim: mes.nullable().default(null),
    cat: z.string().trim().max(60).default("Outros"),
    quem: texto(60),
    proj: texto(60),
    dre: conta,
  })
  .refine((r) => !r.fim || r.fim >= r.ini, { message: "O último mês não pode ser antes do primeiro.", path: ["fim"] });
export type RecorrenteInput = z.infer<typeof recorrenteSchema>;

export const saldoSchema = z.object({
  data: iso,
  valor: z.number().finite().min(-1e9).max(1e9),
  /** Lançamentos (ou ocorrências de recorrente, "rec|AAAA-MM") que já passaram pelo banco. */
  pagos: z.array(z.string().max(80)).max(2000).default([]),
});

export const configSchema = z.object({
  mapa: z
    .object({
      d: z.record(z.string().max(60), conta.unwrap()).default({}),
      r: z.record(z.string().max(60), conta.unwrap()).default({}),
    })
    .default({ d: {}, r: {} }),
  bens: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        nome: z.string().trim().min(1, "Informe o nome do bem").max(80),
        valor,
        vidaMeses: z.number().int().min(1).max(600),
        inicio: mes,
      }),
    )
    .max(200)
    .default([]),
  prazoCrmDias: z.number().int().min(0).max(365).default(30),
});
