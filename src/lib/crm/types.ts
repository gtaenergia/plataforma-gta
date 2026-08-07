import { z } from "zod";

/**
 * Modelo do CRM — as entidades no desenho do RD Station CRM (ver plano da
 * pesquisa), com as convenções desta plataforma: ids gerados na aplicação,
 * datas em ISO string, denormalização por nome em vez de FK (o cadastro que
 * some não quebra a listagem — o nome gravado continua contando a história).
 *
 * A negociação carrega produtos e anotações como jsonb embutido, no mesmo
 * padrão de orcamentos.comentarios/historico: são detalhes dela, não entidades
 * com vida própria.
 */

// ------------------------------------------------------------------ Funil

export interface EtapaFunil {
  id: string;
  nome: string;
}

export interface Funil {
  id: string;
  nome: string;
  /** Ordem do array = ordem no quadro. Máximo de 12 (regra herdada do RD). */
  etapas: EtapaFunil[];
  criadoEm: string;
  atualizadoEm: string;
}

/** Limite herdado do RD Station: funil com mais que isso vira esteira ilegível. */
export const MAX_ETAPAS = 12;

export const etapaSchema = z.object({
  // Sem id = etapa nova; a rota preenche com novaEtapa() antes de gravar.
  id: z.string().trim().optional(),
  nome: z.string().trim().min(1, "Informe o nome da etapa").max(60),
});

export const criarFunilSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do funil").max(80),
  etapas: z.array(etapaSchema).min(1, "O funil precisa de ao menos uma etapa").max(MAX_ETAPAS, `Máximo de ${MAX_ETAPAS} etapas`),
});
export const atualizarFunilSchema = criarFunilSchema.partial();

/** Etapas do funil semeado na primeira visita (nomes do padrão RD). */
export const ETAPAS_PADRAO = ["Sem contato", "Contato feito", "Proposta enviada", "Negociação", "Fechamento"] as const;

// ------------------------------------------------------------- Negociação

/** Situação da negociação — as transições moram em machine.ts. */
export type SituacaoNegociacao = "aberta" | "pausada" | "ganha" | "perdida";

export const SITUACAO_LABEL: Record<SituacaoNegociacao, string> = {
  aberta: "Em aberto",
  pausada: "Pausada",
  ganha: "Ganha",
  perdida: "Perdida",
};

export const SITUACAO_TONE: Record<SituacaoNegociacao, "slate" | "green" | "amber" | "red" | "indigo"> = {
  aberta: "indigo",
  pausada: "amber",
  ganha: "green",
  perdida: "red",
};

export type TipoDesconto = "valor" | "percentual";
export type Recorrencia = "unico" | "mensal";

/** Item do catálogo dentro de uma negociação (nome e preço congelados na hora). */
export interface ProdutoNegociado {
  produtoId: string;
  nome: string;
  preco: number;
  quantidade: number;
  desconto: number;
  tipoDesconto: TipoDesconto;
  recorrencia: Recorrencia;
}

/**
 * Registro do histórico da negociação. Imutável de propósito, como no RD:
 * a API só acrescenta — anotação não se edita nem se apaga, para o histórico
 * valer como registro do que de fato aconteceu.
 */
export interface Anotacao {
  id: string;
  /** "nota" = escrita por alguém; "sistema" = gerada por mudança (etapa, situação). */
  tipo: "nota" | "sistema";
  texto: string;
  autor: string;
  autorNome: string;
  criadoEm: string;
}

export interface Negociacao {
  id: string;
  nome: string;
  funilId: string;
  etapaId: string;
  /** Valor negociado quando não há produtos vinculados; com produtos, a soma vence. */
  valor: number;
  empresaId: string;
  empresaNome: string;
  contatoIds: string[];
  responsavel: string; // e-mail
  responsavelNome: string;
  fonteId: string;
  fonteNome: string;
  situacao: SituacaoNegociacao;
  motivoPerdaId: string;
  motivoPerdaNome: string;
  /** Previsão de fechamento (YYYY-MM-DD) ou "". */
  previsao: string;
  /** Avaliação 0–5 (0 = sem avaliação). */
  qualificacao: number;
  produtos: ProdutoNegociado[];
  anotacoes: Anotacao[];
  fechadoEm: string;
  fechadoPor: string;
  criadoPor: string;
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Valor efetivo: soma dos produtos (com desconto) quando existem; senão o valor livre. */
export function valorDaNegociacao(n: Pick<Negociacao, "valor" | "produtos">): number {
  if (!n.produtos.length) return n.valor;
  return n.produtos.reduce((soma, p) => {
    const bruto = p.preco * p.quantidade;
    const desconto = p.tipoDesconto === "percentual" ? bruto * (p.desconto / 100) : p.desconto;
    return soma + Math.max(0, bruto - desconto);
  }, 0);
}

const texto = (max: number) => z.string().trim().max(max).default("");

export const produtoNegociadoSchema = z.object({
  produtoId: z.string().trim().min(1),
  nome: z.string().trim().min(1).max(255),
  preco: z.number().min(0),
  quantidade: z.number().int().min(1).default(1),
  desconto: z.number().min(0).default(0),
  tipoDesconto: z.enum(["valor", "percentual"]).default("valor"),
  recorrencia: z.enum(["unico", "mensal"]).default("unico"),
});

export const criarNegociacaoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da negociação").max(200),
  funilId: z.string().trim().min(1, "Escolha o funil"),
  etapaId: z.string().trim().min(1, "Escolha a etapa"),
  valor: z.number().min(0).default(0),
  empresaId: texto(64),
  empresaNome: texto(200),
  contatoIds: z.array(z.string()).default([]),
  responsavel: texto(200),
  responsavelNome: texto(200),
  fonteId: texto(64),
  fonteNome: texto(120),
  previsao: texto(10),
  qualificacao: z.number().int().min(0).max(5).default(0),
  produtos: z.array(produtoNegociadoSchema).default([]),
});

/**
 * Situação, motivo e fechamento ficam FORA do patch: mudam apenas pela rota de
 * transição, que valida a máquina e registra o histórico.
 */
export const atualizarNegociacaoSchema = criarNegociacaoSchema.partial();

// ---------------------------------------------------------------- Contato

export interface Contato {
  id: string;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  /** Empresa (cadastro de clientes) — uma por contato, como no RD. */
  empresaId: string;
  empresaNome: string;
  observacoes: string;
  criadoPor: string;
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const criarContatoSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  cargo: texto(120),
  email: texto(200).refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "E-mail inválido"),
  telefone: texto(40),
  empresaId: texto(64),
  empresaNome: texto(200),
  observacoes: texto(2000),
});
export const atualizarContatoSchema = criarContatoSchema.partial();

// ------------------------------------------- Catálogos (fonte, motivo de perda)

/** Item de catálogo simples: fontes de negociação e motivos de perda. */
export interface ItemCatalogo {
  id: string;
  nome: string;
  descricao: string;
  criadoEm: string;
  atualizadoEm: string;
}

export const criarItemCatalogoSchema = z.object({
  // 2–40 no motivo de perda é regra do RD; vale bem para fontes também.
  nome: z.string().trim().min(2, "Mínimo de 2 caracteres").max(40),
  descricao: texto(200),
});
export const atualizarItemCatalogoSchema = criarItemCatalogoSchema.partial();

export const FONTES_PADRAO = ["Indicação", "Site", "Redes sociais", "Prospecção ativa", "Outro"] as const;
export const MOTIVOS_PERDA_PADRAO = ["Preço", "Sem orçamento", "Escolheu concorrente", "Sem resposta", "Projeto adiado"] as const;

// ---------------------------------------------------------------- Produto

/**
 * Item do catálogo de produtos e serviços. Não se exclui — só se oculta
 * (regra do RD: excluir apagaria o passado dos relatórios).
 */
export interface ProdutoCrm {
  id: string;
  nome: string;
  descricao: string;
  precoBase: number;
  oculto: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export const criarProdutoCrmSchema = z.object({
  nome: z.string().trim().min(2, "Mínimo de 2 caracteres").max(255),
  descricao: texto(500),
  precoBase: z.number().min(0).default(0),
});
export const atualizarProdutoCrmSchema = criarProdutoCrmSchema.partial().extend({
  oculto: z.boolean().optional(),
});
