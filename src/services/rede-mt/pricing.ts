/**
 * Precificação de Rede de Distribuição MT/BT — modelo real da GTA (planilhas
 * Rio Doce). O serviço tem DOIS componentes independentes, cada um com sua
 * fórmula (um job pode ter só projeto, só execução, ou os dois):
 *
 *   PROJETO  = (custo × Fator K) / (1 − NF)   (Fator K 1,889, NF 15% "por dentro") → margem 40%
 *   EXECUÇÃO = custo × Fator K                (Fator K 1,7, NF 6% sobre o faturamento) → margem ~35%
 *
 * Materiais e equipamentos principais da execução são faturados à parte.
 */

export interface RedeMtInput {
  custoProjeto: number;
  custoExecucao: number;
  /**
   * Horas da equipe da GTA, em R$. Entram no custo do PROJETO, não no da
   * execução: é tempo de engenharia, e a execução é obra de terceiro.
   */
  custoEquipe?: number;
}

export interface RedeMtParams {
  fatorKProjeto: number;
  nfProjeto: number;
  fatorKExecucao: number;
  nfExecucao: number;
}

export interface RedeMtResult {
  /** Custo do projeto JÁ com a equipe. */
  custoProjeto: number;
  /** O custo de projeto que já existia, sem as horas da GTA. */
  custoProjetoSemEquipe: number;
  custoEquipe: number;
  faturamentoProjeto: number;
  /** O que o projeto faturaria sem ninguém apontado. */
  faturamentoProjetoSemEquipe: number;
  impostosProjeto: number;
  lucroProjeto: number;
  margemProjeto: number;
  fatorKProjeto: number;
  custoExecucao: number;
  faturamentoExecucao: number;
  impostosExecucao: number;
  lucroExecucao: number;
  margemExecucao: number;
  fatorKExecucao: number;
  faturamentoTotal: number;
}

const round10 = (v: number) => Math.round(v / 10) * 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function precoRedeMt(i: RedeMtInput, p: RedeMtParams): RedeMtResult {
  // Projeto — NF "por dentro" (grossed up)
  const cpSemEquipe = Math.max(0, i.custoProjeto || 0);
  const custoEquipe = Math.max(0, i.custoEquipe || 0);
  const cp = cpSemEquipe + custoEquipe;
  const kp = clamp(p.fatorKProjeto, 1, 5);
  const nfp = clamp(p.nfProjeto, 0, 0.5);
  /* O guard olha o custo TOTAL: um projeto sem custo orçado mas com horas da
     GTA apontadas tem preço, e a versão anterior devolveria zero. */
  const fatP = cp > 0 ? round10((cp * kp) / (1 - nfp)) : 0;
  const fatPSemEquipe = cpSemEquipe > 0 ? round10((cpSemEquipe * kp) / (1 - nfp)) : 0;
  const impP = fatP * nfp;
  const lucroP = fatP - cp - impP;
  const margemP = fatP > 0 ? lucroP / fatP : 0;

  // Execução — NF sobre o faturamento
  const ce = Math.max(0, i.custoExecucao || 0);
  const ke = clamp(p.fatorKExecucao, 1, 4);
  const nfe = clamp(p.nfExecucao, 0, 0.5);
  const fatE = ce > 0 ? round10(ce * ke) : 0;
  const impE = fatE * nfe;
  const lucroE = fatE - ce - impE;
  const margemE = fatE > 0 ? lucroE / fatE : 0;

  return {
    custoProjeto: cp, custoProjetoSemEquipe: cpSemEquipe, custoEquipe,
    faturamentoProjeto: fatP, faturamentoProjetoSemEquipe: fatPSemEquipe, impostosProjeto: impP, lucroProjeto: lucroP, margemProjeto: margemP, fatorKProjeto: kp,
    custoExecucao: ce, faturamentoExecucao: fatE, impostosExecucao: impE, lucroExecucao: lucroE, margemExecucao: margemE, fatorKExecucao: ke,
    faturamentoTotal: fatP + fatE,
  };
}
