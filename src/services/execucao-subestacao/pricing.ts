/**
 * Precificação de EXECUÇÃO de Subestação — modelo real da GTA (planilhas de custo
 * Rio Doce / Francefarma): serviço de execução é custo × Fator K, como o carregador.
 *   custo        = materiais + mão de obra + projeto/ART/outros (BOM do levantamento)
 *   faturamento  = custo × Fator K          (Fator K padrão de execução: 1,7)
 *   impostos/NF  = faturamento × alíquota    (padrão 6%)
 *   margem líq.  = (faturamento − custo − impostos) / faturamento ≈ 35%
 * O(s) equipamento(s) principal(is) — trafo, cubículo — são faturados à parte.
 */

export interface ExecSEInput {
  custoMateriais: number;
  custoMaoObra: number;
  /** Projeto, ART, deslocamento, EPI, andaime e demais custos do levantamento. */
  custoProjetoOutros: number;
  /**
   * Horas da equipe da GTA neste trabalho, em R$.
   *
   * Separado de `custoProjetoOutros` de propósito: aquele campo é o que foi
   * ORÇADO no levantamento (ART, andaime, EPI), e este é o tempo das pessoas.
   * Somar num só esconderia justamente o que o dono quer ver destrinchado.
   */
  custoEquipe?: number;
}

export interface ExecSEParams {
  /** Fator K: markup sobre o custo (1,7 = padrão de execução da GTA). */
  fatorK: number;
  /** Alíquota de impostos/NF sobre o faturamento (0,06 = 6%). */
  aliqImpostos: number;
}

export interface ExecSEResult {
  custoMateriais: number;
  custoMaoObra: number;
  custoProjetoOutros: number;
  /** Materiais + mão de obra + projeto/outros — o custo que já existia. */
  custoSemEquipe: number;
  custoEquipe: number;
  custo: number;
  fatorK: number;
  faturamento: number;
  /** O que sairia sem ninguém apontado — para a tela mostrar a diferença. */
  faturamentoSemEquipe: number;
  impostos: number;
  lucro: number;
  margem: number;
}

export function precoExecSE(i: ExecSEInput, p: ExecSEParams): ExecSEResult {
  const materiais = Math.max(0, i.custoMateriais || 0);
  const maoObra = Math.max(0, i.custoMaoObra || 0);
  const outros = Math.max(0, i.custoProjetoOutros || 0);
  const custoSemEquipe = materiais + maoObra + outros;
  const custoEquipe = Math.max(0, i.custoEquipe || 0);
  const custo = custoSemEquipe + custoEquipe;

  const k = Math.min(4, Math.max(1, p.fatorK));
  // Os dois passam pelo MESMO arredondamento: arredondar só um faria a
  // diferença exibida carregar um resto que ninguém saberia explicar.
  const faturamento = Math.round((custo * k) / 10) * 10;
  const faturamentoSemEquipe = Math.round((custoSemEquipe * k) / 10) * 10;
  const aliq = Math.min(0.5, Math.max(0, p.aliqImpostos));
  const impostos = faturamento * aliq;
  const lucro = faturamento - custo - impostos;
  const margem = faturamento > 0 ? lucro / faturamento : 0;

  return {
    custoMateriais: materiais, custoMaoObra: maoObra, custoProjetoOutros: outros,
    custoSemEquipe, custoEquipe, custo, fatorK: k, faturamento, faturamentoSemEquipe,
    impostos, lucro, margem,
  };
}
