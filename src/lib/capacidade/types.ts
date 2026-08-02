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

/**
 * Chave no store de configurações.
 *
 * "planejamento" e não "capacidade" porque o objeto cresceu além da jornada:
 * hoje carrega também o catálogo de tipos de demanda e o calendário. O módulo
 * (`src/lib/capacidade`) mantém o nome antigo porque o motor de fato calcula
 * capacidade — quem mudou de escopo foi a configuração, não a matemática.
 */
export const CAPACIDADE_KEY = "equipe:planejamento";

const MIN_POR_DIA_MAX = 24 * 60;
/** Teto de duração: acima disso é projeto, não tarefa. */
const MIN_POR_DEMANDA_MAX = 400 * 60;

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

/**
 * Um tipo de demanda: "Orçamento solar residencial", "Projeto SPDA".
 *
 * Fica DENTRO de uma das categorias da tarefa (Administrativo, Orçamentos,
 * Projetos). A categoria sozinha é grossa demais para virar prazo: "Projetos"
 * abrange desde um memorial de duas horas até um projeto de subestação de duas
 * semanas, e uma única média para os dois erraria nos dois casos.
 */
export const tipoDemandaSchema = z.object({
  /** Estável — sobrevive a renomear o tipo. Só a UI usa; a tarefa guarda o nome. */
  id: z.string().min(1),
  categoria: z.string().trim().min(1).max(60),
  nome: z.string().trim().min(1).max(120),
  /** 0 = ainda não cadastrada (cai no padrão), nunca "não dá trabalho". */
  minutos: z.coerce.number().int().min(0).max(MIN_POR_DEMANDA_MAX),
});

export type TipoDemanda = z.infer<typeof tipoDemandaSchema>;

export const configCapacidadeSchema = z.object({
  /** Jornada valendo para quem não tem ajuste próprio. */
  padrao: z.object({
    minutosPorDia: z.coerce.number().int().min(0).max(MIN_POR_DIA_MAX),
    diasUteis: diasUteisSchema,
    atrasoInicioMin: z.coerce.number().int().min(0).max(30 * 24 * 60),
  }),
  /** E-mail → ajuste individual. Chave ausente = usa o padrão. */
  pessoas: z.record(z.string(), capacidadePessoaSchema),
  /** Catálogo de tipos de demanda. Ver `TIPOS_PADRAO`. */
  tipos: z.array(tipoDemandaSchema).max(300),
  /** Usada quando a tarefa não tem estimativa própria nem tipo cadastrado. */
  estimativaPadraoMin: z.coerce.number().int().min(0).max(MIN_POR_DEMANDA_MAX),
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
/**
 * Catálogo inicial de tipos de demanda.
 *
 * Os NOMES saem dos serviços que a plataforma já configura e das tarefas que a
 * equipe registra; as DURAÇÕES nascem em zero de propósito. Um número inventado
 * aqui viraria prazo prometido a cliente sem ninguém ter conferido — a tela
 * marca cada tipo sem duração e cobra o preenchimento.
 *
 * A lista é ponto de partida, não trava: a tela permite acrescentar tipos
 * dentro de cada categoria e remover os que não se aplicam.
 */
export const TIPOS_PADRAO: readonly Omit<TipoDemanda, "id">[] = [
  { categoria: "Administrativo", nome: "Reunião com cliente", minutos: 0 },
  { categoria: "Administrativo", nome: "Análise de faturas de energia", minutos: 0 },
  { categoria: "Administrativo", nome: "Relatório de economia", minutos: 0 },
  { categoria: "Administrativo", nome: "Solicitação de orçamento de conexão", minutos: 0 },
  { categoria: "Administrativo", nome: "Protocolo e acompanhamento na distribuidora", minutos: 0 },
  { categoria: "Administrativo", nome: "Emissão de ART", minutos: 0 },

  { categoria: "Orçamentos", nome: "Usina solar residencial", minutos: 0 },
  { categoria: "Orçamentos", nome: "Usina solar comercial ou rural", minutos: 0 },
  { categoria: "Orçamentos", nome: "Carregador veicular", minutos: 0 },
  { categoria: "Orçamentos", nome: "Subestação", minutos: 0 },
  { categoria: "Orçamentos", nome: "SPDA", minutos: 0 },
  { categoria: "Orçamentos", nome: "Rede de média tensão", minutos: 0 },
  { categoria: "Orçamentos", nome: "Revisão de orçamento existente", minutos: 0 },

  { categoria: "Projetos", nome: "Projeto elétrico de baixa tensão", minutos: 0 },
  { categoria: "Projetos", nome: "Projeto de subestação", minutos: 0 },
  { categoria: "Projetos", nome: "Projeto de SPDA", minutos: 0 },
  { categoria: "Projetos", nome: "Projeto de rede de média tensão", minutos: 0 },
  { categoria: "Projetos", nome: "Memorial descritivo", minutos: 0 },
  { categoria: "Projetos", nome: "Levantamento em campo", minutos: 0 },
  { categoria: "Projetos", nome: "Comissionamento", minutos: 0 },
];

/** Id determinístico do catálogo de fábrica — a semente não muda entre cargas. */
function idPadrao(t: Omit<TipoDemanda, "id">): string {
  return `${t.categoria}|${t.nome}`.toLowerCase().replace(/\s+/g, "-");
}

export const CONFIG_CAPACIDADE_PADRAO: ConfigCapacidade = {
  padrao: { minutosPorDia: 480, diasUteis: [1, 2, 3, 4, 5], atrasoInicioMin: 240 },
  pessoas: {},
  tipos: TIPOS_PADRAO.map((t) => ({ ...t, id: idPadrao(t) })),
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
