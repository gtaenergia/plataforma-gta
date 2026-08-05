import { z } from "zod";

/**
 * Mão de obra TERCEIRIZADA — a que a GTA contrata de fora para executar.
 *
 * Não confundir com o custo administrativo interno (as horas do Gabriel, do
 * Matheus, da Marcela). O dono separa os dois explicitamente: "mão de obra é
 * terceirizada, não é nosso administrativo interno". São cadastros distintos
 * e entram no preço por caminhos distintos.
 */

/** Chave em `settings`, no mesmo padrão de `CAPACIDADE_KEY`. */
export const MAO_DE_OBRA_KEY = "equipe:mao-de-obra";

/** Teto de R$/h. Existe para barrar dedo errado, não para limitar o negócio. */
const CUSTO_HORA_MAX = 10_000;

export const funcaoSchema = z.object({
  /** Estável — sobrevive a renomear a função. A linha do orçamento guarda o id. */
  id: z.string().min(1),
  nome: z.string().trim().min(1).max(80),
  /** R$ por hora. 0 = ainda não cadastrado, nunca "sai de graça". */
  custoHora: z.coerce.number().min(0).max(CUSTO_HORA_MAX),
});

export type Funcao = z.infer<typeof funcaoSchema>;

/**
 * Percentual sobre o PREÇO, não sobre o custo — é assim que a conta do dono
 * fecha. O teto de 0,99 é estrutural: imposto + margem ≥ 1 zera ou inverte o
 * divisor, e o preço viraria infinito ou negativo.
 */
const percentualSchema = z.coerce.number().min(0).max(0.99);

export const configMaoDeObraSchema = z.object({
  funcoes: z.array(funcaoSchema).max(100),
  impostoPadrao: percentualSchema,
  margemPadrao: percentualSchema,
});

export type ConfigMaoDeObra = z.infer<typeof configMaoDeObraSchema>;

/**
 * Funções iniciais, com custo ZERO de propósito.
 *
 * Mesma regra do catálogo de tipos de demanda: um número inventado aqui
 * viraria preço enviado a cliente sem ninguém ter conferido. A tela marca cada
 * função sem custo e cobra o preenchimento.
 *
 * A lista é ponto de partida, não trava — dá para acrescentar e remover.
 */
export const FUNCOES_PADRAO: readonly Omit<Funcao, "id">[] = [
  { nome: "Encarregado", custoHora: 0 },
  { nome: "Eletricista", custoHora: 0 },
  { nome: "Ajudante", custoHora: 0 },
  { nome: "Técnico", custoHora: 0 },
];

/**
 * Os padrões de imposto e margem NÃO nascem em zero, ao contrário dos custos.
 *
 * Zero aqui não seria "falta cadastrar": seria vender pelo custo, sem imposto
 * e sem lucro — um número plausível o bastante para passar despercebido. Os
 * valores abaixo são os que o dono citou em áudio: 7,02% ("o que a gente tem
 * utilizado") e 30% de margem.
 */
export const CONFIG_MAO_DE_OBRA_PADRAO: ConfigMaoDeObra = {
  funcoes: FUNCOES_PADRAO.map((f, i) => ({ ...f, id: `funcao-${i + 1}` })),
  impostoPadrao: 0.0702,
  margemPadrao: 0.3,
};

/** Uma linha do orçamento: tantas pessoas de tal função, por tantas horas. */
export interface LinhaMaoDeObra {
  funcaoId: string;
  pessoas: number;
  horas: number;
}

export const linhaMaoDeObraSchema = z.object({
  funcaoId: z.string().trim().min(1),
  pessoas: z.coerce.number().min(0).max(500),
  horas: z.coerce.number().min(0).max(10_000),
});

/** Por que a composição não pôde ser calculada. */
export type ImpedimentoComposicao = "divisor_invalido";

export interface LinhaCalculada {
  linha: LinhaMaoDeObra;
  /** Ausente quando a função foi removida do catálogo depois de usada. */
  funcao?: Funcao;
  horasTotais: number;
  custoCent: number;
  /** Função inexistente ou com custo zero — o total mente por baixo. */
  incompleta: boolean;
}

export interface Composicao {
  linhas: LinhaCalculada[];
  custoCent: number;
  impostoCent: number;
  lucroCent: number;
  precoCent: number;
  /** preço ÷ custo. 0 quando não há custo — nunca Infinity. */
  markup: number;
  /** Alguma linha sem custo cadastrado: o preço sai por baixo do real. */
  incompleta: boolean;
  /** Presente = não há preço. A tela mostra o motivo em vez de um número. */
  impedimento?: ImpedimentoComposicao;
}
