import type { AvisoTecnico } from "@/lib/avisos";
import {
  DIAS_JANELA_CURTA,
  HORIZONTE_DIAS,
  diasUteisEntre,
  fmtDiaMes,
  proximoDiaUtil,
  somarDias,
  type CalendarioTrabalho,
  type Ymd,
} from "./datas";
import {
  CONFIG_CAPACIDADE_PADRAO,
  type Candidato,
  type CapacidadePessoa,
  type ConfigCapacidade,
  type Folga,
  type PrazoProposto,
} from "./types";

/**
 * Escalonador de capacidade — o cérebro da sugestão de responsável.
 *
 * Módulo PURO: nenhuma função aqui lê o relógio, o banco ou a sessão. `hoje`
 * entra sempre por parâmetro. É o que permite testar a data proposta com
 * asserção exata em vez de "algum dia depois de amanhã", e é o que deixa o
 * arquivo rodar no browser sem arrastar o driver do Postgres junto.
 *
 * Por isso este arquivo NÃO pode importar `./config` (que puxa o store de
 * settings e, por tabela, `node:fs`). Quem precisa da configuração a recebe
 * pronta.
 *
 * A carga da semana e o prazo proposto saem da MESMA simulação. Se o painel
 * dissesse "130% da semana" enquanto o formulário promete entrega para amanhã,
 * ninguém confiaria na ferramenta depois do primeiro dia.
 */

// ------------------------------------------------------------------ entrada

/**
 * O recorte de `Task` que o motor consome. Estrutural de propósito: `Task` o
 * satisfaz sem precisar declarar nada, e o teste monta um objeto de 5 campos em
 * vez de uma tarefa inteira.
 */
export interface TarefaCapacidade {
  id: string;
  responsavel: string;
  status: string;
  categoria: string;
  estimativaMin: number;
  prazoOperacional?: string;
  prazo?: string;
}

export interface PessoaDaEquipe {
  email: string;
  nome: string;
}

/** Status que ocupam a fila. Ver `STATUS_TAREFA` em lib/tasks/types.ts. */
export const STATUS_NA_FILA = ["afazer", "andamento", "atraso"] as const;

/**
 * `continuo` fica de fora: uma tarefa sem fim com estimativa travaria a fila
 * para sempre e empurraria toda entrega para o infinito. Ela consome dia real,
 * então a tela mostra a contagem ao lado da ocupação — lacuna visível é melhor
 * que número errado invisível.
 */
export function entraNaFila(status: string): boolean {
  return (STATUS_NA_FILA as readonly string[]).includes(status);
}

// -------------------------------------------------------------- normalização

/**
 * Categoria é texto livre digitado por gente diferente: "Orçamentos",
 * "orcamentos" e "Orçamentos " são a mesma coisa e precisam achar a mesma
 * estimativa.
 */
const MARCAS_DE_ACENTO = new RegExp("[\\u0300-\\u036f]", "g");

export function chaveCategoria(c: string): string {
  return (c ?? "")
    .normalize("NFD")
    .replace(MARCAS_DE_ACENTO, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Jornada efetiva da pessoa: ajuste próprio por cima do padrão da equipe. */
export function capacidadeDe(config: ConfigCapacidade, email: string): CapacidadePessoa {
  const p = config.pessoas?.[email];
  const temAjuste =
    !!p && (p.minutosPorDia !== undefined || p.diasUteis !== undefined || p.atrasoInicioMin !== undefined);
  return {
    email,
    minutosPorDia: p?.minutosPorDia ?? config.padrao.minutosPorDia,
    diasUteis: p?.diasUteis ?? config.padrao.diasUteis,
    atrasoInicioMin: p?.atrasoInicioMin ?? config.padrao.atrasoInicioMin,
    origem: temAjuste ? "pessoa" : "padrao",
  };
}

export type OrigemEstimativa = "tarefa" | "categoria" | "padrao" | "ausente";

/**
 * Quanto tempo a tarefa consome. A estimativa digitada na tarefa vence; sem
 * ela, a média da categoria; sem categoria conhecida, o padrão.
 *
 * `estimativaMin: 0` significa "não informado", nunca "não dá trabalho" — uma
 * tarefa de zero minuto entraria na fila sem ocupar ninguém e o prazo proposto
 * seria hoje.
 */
export function estimativaDaTarefa(
  t: Pick<TarefaCapacidade, "categoria" | "estimativaMin">,
  config: ConfigCapacidade,
): { minutos: number; origem: OrigemEstimativa } {
  if (t.estimativaMin > 0) return { minutos: t.estimativaMin, origem: "tarefa" };
  const daCategoria = config.estimativas?.[chaveCategoria(t.categoria)];
  if (daCategoria && daCategoria > 0) return { minutos: daCategoria, origem: "categoria" };
  if (config.estimativaPadraoMin > 0) return { minutos: config.estimativaPadraoMin, origem: "padrao" };
  return { minutos: 0, origem: "ausente" };
}

function calendarioDe(cap: CapacidadePessoa, config: ConfigCapacidade): CalendarioTrabalho {
  return { diasUteis: cap.diasUteis, feriados: config.feriados };
}

// ------------------------------------------------------------------- a fila

export interface EntradaFila {
  tarefaId: string;
  minutos: number;
}

export interface ItemAgendado {
  tarefaId: string;
  /** Minutos ainda por fazer (já descontado o que foi apontado). */
  minutos: number;
  inicio: Ymd;
  fim: Ymd;
}

export interface Fila {
  itens: ItemAgendado[];
  /** Soma do que falta fazer. É o numerador da ocupação. */
  totalMin: number;
  /** Minutos alocados por dia — invariante: a soma bate com `totalMin`. */
  porDia: Record<Ymd, number>;
  /** Primeiro dia com capacidade sobrando depois de tudo. */
  livreEm: Ymd | null;
  /** A fila passou do horizonte de um ano e foi cortada. */
  truncada: boolean;
}

const FILA_VAZIA: Fila = { itens: [], totalMin: 0, porDia: {}, livreEm: null, truncada: false };

/**
 * Distribui a fila da pessoa nos dias úteis, a partir de `hoje`.
 *
 * `realizadoPorTarefa` (minutos já apontados) entra desde já, mesmo sem uso na
 * primeira versão: sem ele o modelo mente de forma crescente — uma tarefa em
 * andamento há uma semana continua pesando a estimativa cheia.
 */
export function simularFila(e: {
  hoje: Ymd;
  capacidade: CapacidadePessoa;
  config: ConfigCapacidade;
  entradas: EntradaFila[];
  realizadoPorTarefa?: Record<string, number>;
}): Fila {
  const { capacidade, config, entradas } = e;
  if (capacidade.minutosPorDia <= 0 || capacidade.diasUteis.length === 0) return FILA_VAZIA;

  const cal = calendarioDe(capacidade, config);
  const primeiro = proximoDiaUtil(e.hoje, cal);
  if (!primeiro) return FILA_VAZIA;
  let dia: Ymd = primeiro;

  const porDia: Record<Ymd, number> = {};
  const itens: ItemAgendado[] = [];
  let restanteNoDia = capacidade.minutosPorDia;
  let totalMin = 0;
  let truncada = false;
  let passos = 0;
  const maxPassos = HORIZONTE_DIAS + entradas.length + 1;

  /** Pula para o próximo dia útil quando o atual acabou. */
  const abrirEspaco = (): boolean => {
    if (restanteNoDia > 0) return true;
    const prox = proximoDiaUtil(somarDias(dia, 1), cal);
    if (!prox) return false;
    dia = prox;
    restanteNoDia = capacidade.minutosPorDia;
    return true;
  };

  for (const entrada of entradas) {
    const feito = e.realizadoPorTarefa?.[entrada.tarefaId] ?? 0;
    let restante = Math.max(0, entrada.minutos - feito);
    totalMin += restante;

    if (restante === 0) {
      itens.push({ tarefaId: entrada.tarefaId, minutos: 0, inicio: dia, fim: dia });
      continue;
    }
    if (!abrirEspaco()) {
      truncada = true;
      break;
    }
    const inicio = dia;
    while (restante > 0) {
      if (passos++ > maxPassos || !abrirEspaco()) {
        truncada = true;
        break;
      }
      const usa = Math.min(restante, restanteNoDia);
      porDia[dia] = (porDia[dia] ?? 0) + usa;
      restante -= usa;
      restanteNoDia -= usa;
    }
    itens.push({ tarefaId: entrada.tarefaId, minutos: entrada.minutos - feito, inicio, fim: dia });
    if (truncada) break;
  }

  const livreEm = restanteNoDia > 0 ? dia : proximoDiaUtil(somarDias(dia, 1), cal);
  return { itens, totalMin, porDia, livreEm, truncada };
}

/**
 * Indexa as tarefas por responsável em uma única passagem.
 *
 * Necessário para a escala: filtrar a lista completa dentro do laço de pessoas
 * é O(pessoas × tarefas). Com 50 usuários e 2.000 tarefas seriam 100 mil
 * comparações — a cada tecla digitada no campo de estimativa, já que a sugestão
 * recalcula enquanto se digita. Agrupando antes, o custo cai para uma passagem
 * na lista mais o trabalho de cada pessoa.
 */
export function agruparPorResponsavel(
  tarefas: TarefaCapacidade[],
  ignorarTarefaId?: string,
): Map<string, TarefaCapacidade[]> {
  const mapa = new Map<string, TarefaCapacidade[]>();
  for (const t of tarefas) {
    if (!t.responsavel || t.id === ignorarTarefaId) continue;
    const atual = mapa.get(t.responsavel);
    if (atual) atual.push(t);
    else mapa.set(t.responsavel, [t]);
  }
  return mapa;
}

/** Ordem de execução da fila: prazo mais próximo primeiro, sem prazo por último. */
export function ordenarFila(tarefas: TarefaCapacidade[]): TarefaCapacidade[] {
  const prazoDe = (t: TarefaCapacidade) => t.prazoOperacional || t.prazo || "";
  return [...tarefas].sort((a, b) => {
    const pa = prazoDe(a);
    const pb = prazoDe(b);
    if (pa !== pb) {
      if (!pa) return 1;
      if (!pb) return -1;
      return pa < pb ? -1 : 1;
    }
    // Desempate por id: a mesma entrada tem que produzir sempre a mesma fila.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ------------------------------------------------------------------- o prazo

/** Ymd do n-ésimo dia útil a partir de `inicio` (o 1º é o próprio `inicio`). */
function enesimoDiaUtil(inicio: Ymd, n: number, cal: CalendarioTrabalho): Ymd | null {
  if (n > HORIZONTE_DIAS) return null;
  let dia = proximoDiaUtil(inicio, cal);
  if (!dia) return null;
  for (let i = 1; i < n; i++) {
    const prox = proximoDiaUtil(somarDias(dia, 1), cal);
    if (!prox) return null;
    dia = prox;
  }
  return dia;
}

const SEM_PRAZO = (impedimento: PrazoProposto["impedimento"]): PrazoProposto => ({
  data: null,
  diasUteis: 0,
  esperaOlharMin: 0,
  esperaFilaMin: 0,
  trabalhoMin: 0,
  impedimento,
});

/**
 * Quando a tarefa fica pronta se for para esta pessoa.
 *
 * A espera até a pessoa olhar a plataforma corre em PARALELO com a fila, não
 * depois dela: quem já tem duas semanas de trabalho na frente não vai demorar
 * mais 4 h para começar — essas 4 h passam enquanto ela trabalha no que já
 * tinha. Por isso `max()`, e não soma.
 */
export function proporPrazo(e: {
  hoje: Ymd;
  capacidade: CapacidadePessoa;
  config: ConfigCapacidade;
  entradas: EntradaFila[];
  trabalhoMin: number;
  realizadoPorTarefa?: Record<string, number>;
}): PrazoProposto {
  const { capacidade, config } = e;
  if (capacidade.minutosPorDia <= 0 || capacidade.diasUteis.length === 0) {
    return SEM_PRAZO("sem_capacidade");
  }
  if (e.trabalhoMin <= 0) return SEM_PRAZO("sem_estimativa");

  const fila = simularFila(e);
  const esperaFilaMin = fila.totalMin;
  const esperaOlharMin = capacidade.atrasoInicioMin;
  const totalMin = Math.max(esperaOlharMin, esperaFilaMin) + e.trabalhoMin;
  const diasUteis = Math.max(1, Math.ceil(totalMin / capacidade.minutosPorDia));
  const data = enesimoDiaUtil(e.hoje, diasUteis, calendarioDe(capacidade, config));

  if (!data) return { ...SEM_PRAZO("horizonte"), esperaOlharMin, esperaFilaMin, trabalhoMin: e.trabalhoMin };
  return { data, diasUteis, esperaOlharMin, esperaFilaMin, trabalhoMin: e.trabalhoMin };
}

// ------------------------------------------------------------------- a folga

/**
 * Quanto do "pote" da janela já está comprometido.
 *
 * A conta é `trabalho pendente ÷ capacidade que ainda resta na janela`, e por
 * isso PODE passar de 100% — que é justamente o caso que interessa mostrar.
 * Medir pelo que a fila coloca dentro da janela daria no máximo 100% sempre,
 * porque a fila nunca aloca mais que a capacidade do dia: quem tivesse 60 h de
 * trabalho para uma semana de 40 h apareceria como "semana cheia", igual a quem
 * tem exatamente 40 h.
 */
export function folgaNaJanela(e: {
  capacidade: CapacidadePessoa;
  config: ConfigCapacidade;
  /** Início da janela — o chamador já passa `max(hoje, início da semana)`. */
  de: Ymd;
  ate: Ymd;
  pendenteMin: number;
}): Folga {
  const dias = diasUteisEntre(e.de, e.ate, calendarioDe(e.capacidade, e.config));
  const capacidadeMin = dias.length * e.capacidade.minutosPorDia;
  const comprometidoMin = Math.max(0, e.pendenteMin);
  return {
    capacidadeMin,
    comprometidoMin,
    folgaMin: capacidadeMin - comprometidoMin,
    // Janela sem dia útil (férias, feriadão) ou pessoa sem jornada: a divisão
    // daria Infinity ou NaN, que atravessam ordenação e toFixed sem erro e
    // chegam na tela como lixo.
    ocupacaoPct: capacidadeMin > 0 ? (comprometidoMin / capacidadeMin) * 100 : null,
  };
}

// -------------------------------------------------------------- a sugestão

/** Acima disso a semana é considerada estourada. */
export const OCUPACAO_LIMITE_PCT = 100;
/** A partir daqui a tela já sinaliza atenção. */
export const OCUPACAO_ATENCAO_PCT = 85;

/**
 * Ordem das sugestões: quem ENTREGA ANTES primeiro.
 *
 * Ordenar por folga em minutos parece natural e é uma armadilha: favorece
 * sistematicamente quem tem o pote maior. Alguém de 8 h/dia a 60% ocupado tem
 * mais minutos livres que alguém de 3 h/dia totalmente livre, e ganharia sempre
 * — inclusive quando entregaria depois. A folga continua aparecendo na tela,
 * porque é a linguagem de quem pediu a feature; ela só não decide a ordem.
 */
export function compararCandidatos(a: Candidato, b: Candidato): number {
  const impedidoA = !a.prazo.data;
  const impedidoB = !b.prazo.data;
  if (impedidoA !== impedidoB) return impedidoA ? 1 : -1;

  if (!impedidoA && a.prazo.data !== b.prazo.data) {
    return (a.prazo.data as string) < (b.prazo.data as string) ? -1 : 1;
  }
  const oa = a.ocupacaoComTarefaPct;
  const ob = b.ocupacaoComTarefaPct;
  if (oa !== ob) {
    if (oa === null) return 1;
    if (ob === null) return -1;
    return oa - ob;
  }
  // Sem desempate estável, a mesma tela sugeriria pessoas diferentes a cada
  // render só pela ordem em que o banco devolveu os usuários.
  return a.nome.localeCompare(b.nome, "pt-BR");
}

/**
 * Quem deveria pegar esta tarefa, do melhor para o pior.
 *
 * Devolve TODO MUNDO (inclusive quem está impedido, no fim da lista) — a tela
 * decide quantos mostrar. Esconder aqui tiraria da UI a chance de explicar por
 * que alguém não aparece, que é a pergunta que o usuário faz em seguida.
 */
export function sugerirResponsaveis(e: {
  hoje: Ymd;
  config: ConfigCapacidade;
  pessoas: PessoaDaEquipe[];
  /** Todas as tarefas da equipe; o motor filtra por responsável e status. */
  tarefas: TarefaCapacidade[];
  /** Estimativa da tarefa nova, em minutos. */
  trabalhoMin: number;
  /** Ao re-sugerir para uma tarefa que já existe, para ela não contar duas vezes. */
  ignorarTarefaId?: string;
  realizadoPorTarefa?: Record<string, number>;
  /** Janelas de ocupação. */
  fimSemana: Ymd;
  fimMes: Ymd;
}): Candidato[] {
  const { config, hoje } = e;
  const porResponsavel = agruparPorResponsavel(e.tarefas, e.ignorarTarefaId);

  return e.pessoas
    .map<Candidato>((p) => {
      const capacidade = capacidadeDe(config, p.email);
      const minhas = porResponsavel.get(p.email) ?? [];
      const entradas: EntradaFila[] = ordenarFila(minhas.filter((t) => entraNaFila(t.status))).map((t) => ({
        tarefaId: t.id,
        minutos: estimativaDaTarefa(t, config).minutos,
      }));
      const fila = simularFila({ hoje, capacidade, config, entradas, realizadoPorTarefa: e.realizadoPorTarefa });
      const prazo = proporPrazo({
        hoje,
        capacidade,
        config,
        entradas,
        trabalhoMin: e.trabalhoMin,
        realizadoPorTarefa: e.realizadoPorTarefa,
      });

      const semana = folgaNaJanela({ capacidade, config, de: hoje, ate: e.fimSemana, pendenteMin: fila.totalMin });
      const mes = folgaNaJanela({ capacidade, config, de: hoje, ate: e.fimMes, pendenteMin: fila.totalMin });
      const comTarefa = folgaNaJanela({
        capacidade,
        config,
        de: hoje,
        ate: e.fimSemana,
        pendenteMin: fila.totalMin + Math.max(0, e.trabalhoMin),
      });

      return {
        email: p.email,
        nome: p.nome || p.email,
        capacidade,
        prazo,
        semana,
        mes,
        ocupacaoComTarefaPct: comTarefa.ocupacaoPct,
        continuas: minhas.filter((t) => t.status === "continuo").length,
      };
    })
    .sort(compararCandidatos);
}

// -------------------------------------------------------------- os avisos

const h = (min: number) =>
  (min / 60).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/**
 * O que a tela deve levantar a mão antes de a tarefa ser salva. Nenhum destes
 * bloqueia — quem está criando às vezes sabe de algo que a conta não sabe.
 */
export function avisosDeCapacidade(e: {
  candidato: Candidato | null;
  origemEstimativa: OrigemEstimativa;
  trabalhoMin: number;
}): AvisoTecnico[] {
  const avisos: AvisoTecnico[] = [];
  const c = e.candidato;

  if (e.origemEstimativa === "ausente" || e.trabalhoMin <= 0) {
    avisos.push({
      nivel: "atencao",
      titulo: "Tarefa sem estimativa de duração",
      detalhe:
        "Sem estimativa não é possível calcular o prazo de entrega nem comparar a carga dos responsáveis. " +
        "Informe as horas ou cadastre a duração média da categoria em Capacidade da equipe.",
    });
    return avisos;
  }

  if (!c) return avisos;

  if (c.prazo.impedimento === "sem_capacidade") {
    avisos.push({
      nivel: "atencao",
      titulo: `${c.nome} está sem jornada cadastrada`,
      detalhe:
        "A carga horária está definida como zero, portanto não é possível calcular o prazo de entrega " +
        "para este responsável.",
    });
    return avisos;
  }

  const ocupacao = c.ocupacaoComTarefaPct;
  if (ocupacao !== null && ocupacao > OCUPACAO_LIMITE_PCT) {
    const excedente = Math.max(0, c.semana.comprometidoMin + e.trabalhoMin - c.semana.capacidadeMin);
    avisos.push({
      nivel: "atencao",
      titulo: `Esta tarefa passa da capacidade de ${c.nome}`,
      detalhe:
        `Com esta atribuição, a carga atinge ${ocupacao.toFixed(0)}% da capacidade dos próximos ` +
        `${DIAS_JANELA_CURTA} dias (excedente de ${h(excedente)} h). ` +
        `O prazo${c.prazo.data ? ` de ${fmtDiaMes(c.prazo.data)}` : ""} já considera esse acúmulo, ` +
        `porém sem margem para imprevistos. Avalie a redistribuição da demanda.`,
    });
  }

  if (c.continuas > 0) {
    const plural = c.continuas > 1;
    avisos.push({
      nivel: "atencao",
      titulo: "Tarefas contínuas não contabilizadas",
      detalhe:
        `${c.nome} possui ${c.continuas} tarefa${plural ? "s" : ""} contínua${plural ? "s" : ""}, ` +
        `que consome${plural ? "m" : ""} tempo de trabalho mas não ${plural ? "possuem" : "possui"} ` +
        "prazo definido para entrar no cálculo. A carga apresentada é, portanto, conservadora.",
    });
  }

  return avisos;
}

/** Config segura para quem ainda não tem nada salvo. */
export const CONFIG_PADRAO = CONFIG_CAPACIDADE_PADRAO;
