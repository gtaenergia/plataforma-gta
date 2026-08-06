import { custoDaEquipe } from "@/lib/mao-de-obra/motor";
import type { LinhaEquipe, LinhaEquipeCalculada } from "@/lib/mao-de-obra/types";

/**
 * Como as horas da equipe entram no preço de uma proposta.
 *
 * A plataforma precifica de dois jeitos, e eles reagem de forma OPOSTA a
 * acrescentar o custo da equipe. Tratar os dois igual foi a armadilha que este
 * módulo existe para evitar.
 *
 * ## Fator K — o custo forma o preço
 *
 * `preço = (materiais + mão de obra) × K`. Aquela "mão de obra" é INSTALAÇÃO
 * (no carregador, R$ 800 por ponto de recarga), não hora de engenheiro: as
 * horas de projeto simplesmente não estão na base. Somá-las é acrescentar um
 * custo que existia e não era contado, e o preço sobe `K ×` o custo delas.
 *
 * ## Métrica — a tabela já remunera o projeto
 *
 * `preço = R$/m² × área`, `R$/bloco × blocos`. Não há base de custo: as taxas
 * saíram de planilhas reais da GTA e já embutem o trabalho de projetar. Somar
 * as horas por cima cobraria duas vezes pelo mesmo serviço — então aqui o preço
 * NÃO muda. O custo aparece no detalhamento e na margem, que é onde ele
 * responde à pergunta do dono: vale a pena?
 *
 * O módulo é puro: nenhuma leitura de banco, nenhum fetch. Quem chama traz o
 * mapa de R$/h já resolvido.
 */

/** De onde o preço vem — e, por consequência, se o custo da equipe o altera. */
export type OrigemDoPreco =
  /** `preço = custo × K`. As horas entram na base, antes do markup. */
  | { paradigma: "fator_k"; custoConfiguradorCent: number; fatorK: number }
  /** `preço = métrica × taxa`. As horas não mexem no preço. */
  | { paradigma: "metrica"; precoCent: number };

export interface EntradaComposicao {
  /** Quem executa e por quantas horas. Vazio = ninguém apontado ainda. */
  linhas: readonly LinhaEquipe[];
  /** R$/h por e-mail. Ausente ou zero = pessoa sem custo cadastrado. */
  custos: Readonly<Record<string, number>>;
  preco: OrigemDoPreco;
  /** Alíquota sobre o faturamento, 0..1. */
  imposto: number;
}

export interface ComposicaoProposta {
  linhas: LinhaEquipeCalculada[];
  /** Horas da própria equipe, em centavos. */
  custoEquipeCent: number;
  /** O que o configurador já contava como custo. Zero nos serviços por métrica. */
  custoConfiguradorCent: number;
  custoTotalCent: number;

  /** O preço ANTES de considerar a equipe — para mostrar o quanto mudou. */
  precoOriginalCent: number;
  precoCent: number;
  /** `precoCent − precoOriginalCent`. Zero nos serviços por métrica. */
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

  const custoConfiguradorCent = e.preco.paradigma === "fator_k" ? e.preco.custoConfiguradorCent : 0;
  const custoTotalCent = custoConfiguradorCent + equipe.custoCent;

  /*
   * O preço "original" é sempre calculado SEM a equipe, mesmo no Fator K, para
   * a tela poder dizer quanto a escolha do responsável mudou o valor. Sem esse
   * par, o acréscimo seria invisível — e ele é o efeito que o usuário precisa
   * enxergar antes de mandar a proposta.
   */
  const precoOriginalCent =
    e.preco.paradigma === "fator_k"
      ? Math.round(e.preco.custoConfiguradorCent * e.preco.fatorK)
      : e.preco.precoCent;

  const precoCent =
    e.preco.paradigma === "fator_k" ? Math.round(custoTotalCent * e.preco.fatorK) : precoOriginalCent;

  const impostoCent = Math.round(precoCent * e.imposto);
  const lucroCent = precoCent - custoTotalCent - impostoCent;

  return {
    linhas: equipe.linhas,
    custoEquipeCent: equipe.custoCent,
    custoConfiguradorCent,
    custoTotalCent,
    precoOriginalCent,
    precoCent,
    acrescimoCent: precoCent - precoOriginalCent,
    impostoCent,
    lucroCent,
    margem: precoCent > 0 ? lucroCent / precoCent : 0,
    incompleta: equipe.incompleta,
    prejuizo: lucroCent < 0,
  };
}
