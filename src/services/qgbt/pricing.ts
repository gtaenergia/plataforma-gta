/**
 * Precificação de QGBT (Quadro Geral de Baixa Tensão) — modelo real da GTA
 * (planilha GEOLAB): é um produto manufaturado (quadro + barramentos + disjuntores
 * + montagem), precificado por custo × Fator K.
 *   custoTotal   = custo unitário × nº de quadros   (materiais + montagem)
 *   faturamento  = custoTotal × Fator K             (Fator K ~1,55)
 *   impostos/NF  = faturamento × alíquota           (~15%)
 *   margem líq.  = (faturamento − custo − impostos) / faturamento ≈ 20%
 */

export interface QgbtInput {
  custoUnitario: number;
  qtdQuadros: number;
  /**
   * Horas da equipe da GTA neste trabalho, em R$.
   *
   * Entra na base de custo, antes do Fator K: o custo unitário é materiais e
   * montagem do quadro, e o tempo de engenharia não estava contado ali. Ausente
   * ou zero = ninguém apontado, e o preço sai como sempre saiu.
   */
  custoEquipe?: number;
}

export interface QgbtParams {
  fatorK: number;
  aliqImpostos: number;
}

export interface QgbtResult {
  custoUnitario: number;
  qtdQuadros: number;
  /** Materiais e montagem — o custo que já existia. */
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

export function precoQgbt(i: QgbtInput, p: QgbtParams): QgbtResult {
  const custoUnitario = Math.max(0, i.custoUnitario || 0);
  const qtd = Math.max(1, Math.floor(i.qtdQuadros || 1));
  const custoSemEquipe = custoUnitario * qtd;
  const custoEquipe = Math.max(0, i.custoEquipe || 0);
  const custo = custoSemEquipe + custoEquipe;

  const k = Math.min(4, Math.max(1, p.fatorK));
  // Os dois faturamentos passam pelo MESMO arredondamento: se só um fosse
  // arredondado, a diferença exibida carregaria um resto inexplicável.
  const faturamento = Math.round((custo * k) / 10) * 10;
  const faturamentoSemEquipe = Math.round((custoSemEquipe * k) / 10) * 10;
  const aliq = Math.min(0.5, Math.max(0, p.aliqImpostos));
  const impostos = faturamento * aliq;
  const lucro = faturamento - custo - impostos;
  const margem = faturamento > 0 ? lucro / faturamento : 0;

  return {
    custoUnitario, qtdQuadros: qtd, custoSemEquipe, custoEquipe, custo,
    fatorK: k, faturamento, faturamentoSemEquipe, impostos, lucro, margem,
  };
}
