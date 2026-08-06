import { custoDaEquipe } from "@/lib/mao-de-obra/motor";
import type { LinhaEquipe, LinhaEquipeCalculada } from "@/lib/mao-de-obra/types";

/**
 * O detalhamento de preço que a tela de geração mostra, já com as horas da
 * própria equipe.
 *
 * ## Este módulo NÃO calcula preço
 *
 * Quem calcula é o engine de cada serviço, e não por acaso: o carregador
 * arredonda o faturamento para múltiplo de R$ 10, o SPDA aplica piso mínimo,
 * o solar tem regra própria. Uma segunda fórmula aqui produziria um número
 * parecido e diferente — e "parecido e diferente" em preço é o pior resultado
 * possível, porque ninguém percebe.
 *
 * Então o configurador entrega os dois preços já prontos e este módulo só
 * compõe a conta. A diferença entre os dois paradigmas de preço vira DADO
 * (`precoSemEquipeCent` igual ou diferente de `precoCent`) em vez de um `if`
 * aqui dentro — ver `equipeFormaPreco`.
 */

export interface EntradaComposicao {
  /** Quem executa e por quantas horas. Vazio = ninguém apontado ainda. */
  linhas: readonly LinhaEquipe[];
  /** R$/h por e-mail. Ausente ou zero = pessoa sem custo cadastrado. */
  custos: Readonly<Record<string, number>>;
  /** Preço final do configurador — já com a equipe, quando o serviço é Fator K. */
  precoCent: number;
  /** O que sairia sem ninguém apontado. Igual a `precoCent` nos por métrica. */
  precoSemEquipeCent: number;
  /** Custo que o configurador já contava (materiais, instalação). 0 na métrica. */
  custoConfiguradorCent: number;
  /** Alíquota sobre o faturamento, 0..1. */
  imposto: number;
}

export interface ComposicaoProposta {
  linhas: LinhaEquipeCalculada[];
  custoEquipeCent: number;
  custoConfiguradorCent: number;
  custoTotalCent: number;

  precoSemEquipeCent: number;
  precoCent: number;
  /** Quanto a escolha do responsável mudou o preço. Zero nos por métrica. */
  acrescimoCent: number;

  impostoCent: number;
  lucroCent: number;
  /** Fração do faturamento, podendo ser NEGATIVA — é o aviso que interessa. */
  margem: number;

  /** Alguém apontado está sem R$/h cadastrado: o custo mente por baixo. */
  incompleta: boolean;
  /** O preço não cobre custo mais imposto. Não impede gerar; avisa. */
  prejuizo: boolean;
}

export function comporProposta(e: EntradaComposicao): ComposicaoProposta {
  const equipe = custoDaEquipe(e.linhas, e.custos);
  const custoTotalCent = e.custoConfiguradorCent + equipe.custoCent;

  const impostoCent = Math.round(e.precoCent * e.imposto);
  const lucroCent = e.precoCent - custoTotalCent - impostoCent;

  return {
    linhas: equipe.linhas,
    custoEquipeCent: equipe.custoCent,
    custoConfiguradorCent: e.custoConfiguradorCent,
    custoTotalCent,
    precoSemEquipeCent: e.precoSemEquipeCent,
    precoCent: e.precoCent,
    acrescimoCent: e.precoCent - e.precoSemEquipeCent,
    impostoCent,
    lucroCent,
    margem: e.precoCent > 0 ? lucroCent / e.precoCent : 0,
    incompleta: equipe.incompleta,
    prejuizo: lucroCent < 0,
  };
}

/**
 * O custo da equipe entra no preço deste serviço?
 *
 * **Fator K** (`preço = custo × K`): entra. A "mão de obra" que já estava na
 * base é INSTALAÇÃO — no carregador, R$ 800 por ponto de recarga — e não hora
 * de engenheiro. As horas de projeto não estavam contadas em lugar nenhum, e
 * acrescentá-las faz o preço subir `K ×` o custo delas.
 *
 * **Métrica** (`preço = R$/m² × área`): não entra. Não existe base de custo; as
 * taxas saíram de planilhas reais da GTA e já remuneram o trabalho de projetar.
 * Somar por cima cobraria duas vezes pelo mesmo serviço. Ali o custo aparece no
 * detalhamento e na margem — que é onde ele responde "vale a pena?".
 *
 * A lista é explícita, e não derivada de "o engine tem fatorK?": um serviço novo
 * precisa de uma decisão de precificação tomada por gente, não de uma dedução.
 */
const FORMAM_PRECO: readonly string[] = ["carregador", "qgbt", "rede-mt", "execucao-subestacao"];

export function equipeFormaPreco(chaveServico: string): boolean {
  return FORMAM_PRECO.includes(chaveServico);
}

export function servicosQueFormamPreco(): readonly string[] {
  return FORMAM_PRECO;
}
