import { z } from "zod";
import type { Ymd } from "./datas";

/**
 * Configuração de capacidade da equipe.
 *
 * O "pote de horas": quanto cada pessoa consegue trabalhar por dia, em que dias
 * da semana, e quanto tempo costuma levar cada tipo de demanda. É o que permite
 * a plataforma SUGERIR quem executa uma tarefa nova em vez de o comercial
 * escolher no chute e descobrir a sobrecarga depois.
 *
 * A unidade do domínio é o MINUTO. Duas razões:
 *
 * - `numeric` do Postgres volta como *string* pelo driver, e já custou bugs no
 *   módulo de orçamentos; `integer` volta número.
 * - o Tracker já pensa em minutos (`duracaoMin`), então a conta que compara
 *   planejado com realizado não precisa converter nada.
 *
 * A conversão para horas acontece só no formulário. E o schema NÃO transforma
 * unidade: a forma salva e a forma em memória são idênticas, senão o merge
 * `{ ...PADRAO, ...salvo }` passaria a misturar horas com minutos.
 */

export const CAPACIDADE_KEY = "equipe:capacidade";

const MIN_POR_DIA_MAX = 24 * 60;

const diasUteisSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  // Duplicata em `diasUteis` contaria o dia duas vezes na capacidade da janela.
  .transform((v) => [...new Set(v)].sort((a, b) => a - b));

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** Jornada de uma pessoa. Campos ausentes herdam o padrão da equipe. */
export const capacidadePessoaSchema = z.object({
  /** Minutos de trabalho disponíveis por dia útil. 0 = não executa tarefas. */
  minutosPorDia: z.coerce.number().int().min(0).max(MIN_POR_DIA_MAX).optional(),
  diasUteis: diasUteisSchema.optional(),
  /**
   * Quanto tempo, em média, entre a tarefa ser criada e a pessoa ver que ela
   * existe. Não é ociosidade: corre em PARALELO com a fila (ver motor.ts).
   */
  atrasoInicioMin: z.coerce.number().int().min(0).max(30 * 24 * 60).optional(),
});

export const configCapacidadeSchema = z.object({
  /** Jornada valendo para quem não tem ajuste próprio. */
  padrao: z.object({
    minutosPorDia: z.coerce.number().int().min(0).max(MIN_POR_DIA_MAX),
    diasUteis: diasUteisSchema,
    atrasoInicioMin: z.coerce.number().int().min(0).max(30 * 24 * 60),
  }),
  /** E-mail → ajuste individual. Chave ausente = usa o padrão. */
  pessoas: z.record(z.string(), capacidadePessoaSchema),
  /**
   * Categoria da tarefa (normalizada por `chaveCategoria`) → minutos típicos.
   * Começa VAZIO de propósito: um número inventado aqui viraria prazo prometido
   * a cliente. Quem conhece o serviço preenche em /admin/capacidade.
   */
  estimativas: z.record(z.string(), z.coerce.number().int().min(0).max(400 * 60)),
  /** Usada quando a tarefa não tem estimativa nem categoria conhecida. */
  estimativaPadraoMin: z.coerce.number().int().min(0).max(400 * 60),
  /** Feriados e pontos facultativos da equipe (yyyy-mm-dd). */
  feriados: z.array(ymdSchema).max(400),
});

export type ConfigCapacidade = z.infer<typeof configCapacidadeSchema>;

/**
 * Padrão: 8 h/dia, segunda a sexta, com 4 h até a pessoa olhar a plataforma.
 *
 * As 4 h saem da forma como a equipe trabalha hoje — a demanda chega por
 * WhatsApp ou na reunião de segunda, e ninguém fica com a tela de tarefas
 * aberta. Prometer que a tarefa começa no instante em que foi criada geraria
 * prazo que não se cumpre já na primeira semana de uso.
 */
export const CONFIG_CAPACIDADE_PADRAO: ConfigCapacidade = {
  padrao: { minutosPorDia: 480, diasUteis: [1, 2, 3, 4, 5], atrasoInicioMin: 240 },
  pessoas: {},
  estimativas: {},
  estimativaPadraoMin: 120,
  feriados: [],
};

/** Jornada efetiva de uma pessoa, já resolvida contra o padrão. */
export interface CapacidadePessoa {
  email: string;
  minutosPorDia: number;
  diasUteis: number[];
  atrasoInicioMin: number;
  /** "pessoa" = tem ajuste próprio; "padrao" = herdou. A tela mostra isso. */
  origem: "pessoa" | "padrao";
}

/** O que impede uma pessoa de receber a tarefa, quando impede. */
export type Impedimento = "sem_capacidade" | "sem_estimativa" | "horizonte";

export interface PrazoProposto {
  /** Último dia de trabalho previsto. `null` quando há impedimento. */
  data: Ymd | null;
  /** Dias úteis consumidos, contando o primeiro. */
  diasUteis: number;
  /** Espera até a pessoa olhar a plataforma. */
  esperaOlharMin: number;
  /** Trabalho já comprometido que roda antes desta tarefa. */
  esperaFilaMin: number;
  /** Trabalho desta tarefa. */
  trabalhoMin: number;
  impedimento?: Impedimento;
}

export interface Folga {
  capacidadeMin: number;
  comprometidoMin: number;
  /** Pode ser negativa — é justamente o caso que interessa mostrar. */
  folgaMin: number;
  /**
   * `null` quando a capacidade da janela é zero (pessoa sem jornada, ou janela
   * sem nenhum dia útil). Nunca `NaN`, nunca `Infinity`: os dois atravessam a
   * ordenação e o `toFixed` sem erro e aparecem como lixo na tela.
   */
  ocupacaoPct: number | null;
}

export interface Candidato {
  email: string;
  nome: string;
  capacidade: CapacidadePessoa;
  prazo: PrazoProposto;
  semana: Folga;
  mes: Folga;
  /** Ocupação da semana JÁ CONTANDO a tarefa nova. */
  ocupacaoComTarefaPct: number | null;
  /** Tarefas contínuas atribuídas — consomem dia real, mas ficam fora da fila. */
  continuas: number;
}
