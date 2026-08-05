import type { ConfigCapacidade, TipoDemanda } from "@/lib/capacidade/types";
import { acharTipo } from "@/lib/capacidade/motor";
import type { LinhaEquipe } from "@/lib/mao-de-obra/types";

/**
 * Do catálogo de demandas para as linhas de custo do orçamento.
 *
 * O catálogo, em Planejamento e capacidade, já guarda quantas horas cada tipo
 * de trabalho consome — foi cadastrado para calcular PRAZO. É a mesma
 * informação que o custo precisa, e o áudio do dono descreve exatamente este
 * caminho: "a estimativa a gente vai definir. Ah, um orçamento a gente gasta
 * aí 10 horas pra executar um orçamento".
 *
 * Puro: sem I/O e sem `Date`. Recebe a configuração pronta.
 *
 * ## Sugestão, nunca imposição
 *
 * O catálogo dá a média; o trabalho de hoje pode ser o dobro. As linhas saem
 * daqui prontas para serem editadas na tela, e quem monta o orçamento decide.
 */

export type OrigemHoras = "catalogo" | "sem_duracao" | "sem_tipo";

export interface SugestaoCusto {
  /** Linhas prontas para a tela. Vazias de horas quando não há duração. */
  linhas: LinhaEquipe[];
  horas: number;
  origem: OrigemHoras;
  /** O tipo escolhido, quando encontrado. */
  tipo?: TipoDemanda;
}

/**
 * Sugere as horas de um tipo de demanda, atribuídas a uma pessoa.
 *
 * `responsavel` é quem receberá as horas na primeira linha. A tela permite
 * trocar e acrescentar — o exemplo do próprio dono tem duas pessoas, Gabriel e
 * Matheus, com dedicações diferentes.
 */
export function sugerirCustoInterno(e: {
  config: ConfigCapacidade;
  /** Id do tipo escolhido no seletor. */
  tipoId?: string;
  /** Alternativa ao id: categoria + nome, como a tarefa guarda. */
  categoria?: string;
  tipoNome?: string;
  responsavel: string;
}): SugestaoCusto {
  const tipo = acharPorIdOuNome(e.config, e.tipoId, e.categoria, e.tipoNome);

  if (!tipo) {
    // Sem tipo escolhido não há o que sugerir. Devolver a estimativa padrão
    // aqui seria inventar um número que ninguém pediu.
    return { linhas: [], horas: 0, origem: "sem_tipo" };
  }

  if (!(tipo.minutos > 0)) {
    /*
     * Tipo cadastrado SEM duração — hoje, os 20 tipos em produção.
     *
     * A linha vem mesmo assim, com a pessoa preenchida e as horas em zero, e a
     * origem diz por quê. Devolver linha nenhuma esconderia o problema; devolver
     * horas zero sem marcar produziria custo zero, que é plausível o bastante
     * para passar despercebido e sair num preço.
     */
    return { linhas: [{ email: e.responsavel, horas: 0 }], horas: 0, origem: "sem_duracao", tipo };
  }

  const horas = tipo.minutos / 60;
  return { linhas: [{ email: e.responsavel, horas }], horas, origem: "catalogo", tipo };
}

/** Aceita o id (do seletor) ou categoria + nome (como a tarefa guarda). */
function acharPorIdOuNome(
  config: ConfigCapacidade,
  tipoId?: string,
  categoria?: string,
  nome?: string,
): TipoDemanda | undefined {
  if (tipoId) {
    const porId = config.tipos.find((t) => t.id === tipoId);
    if (porId) return porId;
  }
  // `acharTipo` já normaliza acento e caixa — não reimplementar.
  if (categoria && nome) return acharTipo(config, categoria, nome);
  return undefined;
}

/**
 * Lê "44 x 4,8" como 211,2.
 *
 * A folha do dono raciocina em dias úteis × horas por dia; o campo guarda o
 * total, porque é o que o catálogo fornece e o que o custo usa. Aceitar a
 * multiplicação escrita evita obrigar quem pensa em dias a fazer a conta de
 * cabeça — e evita o erro de digitação que essa conta convida.
 */
export function lerHoras(texto: string): number {
  const t = String(texto ?? "").trim().replace(/,/g, ".");
  if (!t) return 0;

  const mult = t.split(/[x*×]/i);
  if (mult.length > 1) {
    let produto = 1;
    for (const parte of mult) {
      const n = Number(parte.trim());
      if (!Number.isFinite(n) || n < 0) return 0;
      produto *= n;
    }
    return arredondar(produto);
  }

  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? arredondar(n) : 0;
}

/** Uma casa decimal basta para horas, e evita 211,20000000000002. */
function arredondar(v: number): number {
  return Math.round(v * 10) / 10;
}
