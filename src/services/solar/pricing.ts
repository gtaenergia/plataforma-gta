/**
 * Precificação — codifica a aba "Orçamento" da planilha.
 *   Total   = (Kit + Execução Civil) × fator
 *   Serviços(faturamento GTA) = Total − Kit − Execução Civil
 * O detalhamento de custo (instalação, material CA, deslocamento, ART, imposto,
 * comissão) serve para calcular LUCRO e MARGEM exibidos ao vendedor — não vai no .docx.
 */

export interface PricingParams {
  fator: number; // ex.: 1.575
  execucaoCivil: number; // ex.: 0
  instalacaoPorPainel: number; // 120
  materialCaPorWp: number; // 0.20
  deslocamentoUnit: number; // 188
  viagens: number; // 2
  art: number; // 103
  cartorio: number; // 0
  impostoPct: number; // 0.0701
  comissaoPct: number; // 0.05
}

/** Defaults extraídos da planilha da GTA. Fator 1,575 = mediana dos deals reais
 * (Pedro Igor 1,5 · Darciley/Ivan 1,575 · Guilherme/Pedro Henrique 1,8); revisão 07/2026. */
export const PRICING_DEFAULTS: PricingParams = {
  fator: 1.575,
  execucaoCivil: 0,
  instalacaoPorPainel: 120,
  materialCaPorWp: 0.2,
  deslocamentoUnit: 188,
  viagens: 2,
  art: 103,
  cartorio: 0,
  impostoPct: 0.0701,
  comissaoPct: 0.05,
};

export interface PricingInput extends PricingParams {
  kit: number; // valor do kit (cotação do distribuidor)
  nPaineis: number;
  kwpTotal: number; // kWp
}

export interface PricingResult {
  kit: number;
  valorTotal: number;
  servicos: number; // faturamento GTA
  custos: {
    art: number;
    cartorio: number;
    deslocamento: number;
    instalacao: number;
    materialCa: number;
    /** Informativo. É REPASSE (sai em `servicos` junto com o kit) — não entra em `total`. */
    execucaoCivil: number;
    imposto: number;
    comissao: number;
    total: number; // soma sem comissão (base do lucro)
  };
  lucro: number; // faturamento − custos (sem comissão)
  margem: number; // lucro / faturamento
  lucroLiquido: number; // lucro − comissão
  margemLiquida: number; // lucroLiquido / faturamento
}

export function precificar(i: PricingInput): PricingResult {
  const valorTotal = (i.kit + i.execucaoCivil) * i.fator;
  const servicos = valorTotal - i.kit - i.execucaoCivil;

  const deslocamento = i.deslocamentoUnit * i.viagens;
  const instalacao = i.instalacaoPorPainel * i.nPaineis;
  const materialCa = i.materialCaPorWp * (i.kwpTotal * 1000);
  const imposto = servicos * i.impostoPct;
  const comissao = servicos * i.comissaoPct;

  /*
   * DIVERGÊNCIA DELIBERADA da planilha-fonte (como a célula E31 do Payback).
   *
   * Na planilha, B11 (Lucro) subtrai a execução civil DE NOVO — mas B10
   * (Faturamento GTA = Total − Kit − Civil) já a tinha descontado. Sob
   * qualquer leitura do fluxo de dinheiro isso cobra a civil duas vezes e
   * derruba o lucro exibido pelo valor cheio dela.
   *
   * O defeito nunca disparou de verdade: nos três deals do share que usam
   * este modelo (Igor, Pedro Igor, Luciano) a civil é 0. O preço ao cliente
   * nunca passou por essa célula — só o lucro/margem que o vendedor vê.
   */
  const custoBase = i.art + i.cartorio + deslocamento + instalacao + materialCa + imposto;
  const lucro = servicos - custoBase;
  const lucroLiquido = lucro - comissao;

  return {
    kit: i.kit,
    valorTotal,
    servicos,
    custos: { art: i.art, cartorio: i.cartorio, deslocamento, instalacao, materialCa, execucaoCivil: i.execucaoCivil, imposto, comissao, total: custoBase },
    lucro,
    margem: servicos > 0 ? lucro / servicos : 0,
    lucroLiquido,
    margemLiquida: servicos > 0 ? lucroLiquido / servicos : 0,
  };
}

/** Classificação simples da margem para o indicador verde/amarelo/vermelho. */
export function nivelMargem(margemLiquida: number): "boa" | "atencao" | "baixa" {
  if (margemLiquida >= 0.3) return "boa";
  if (margemLiquida >= 0.15) return "atencao";
  return "baixa";
}
