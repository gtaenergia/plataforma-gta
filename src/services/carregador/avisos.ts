import { POTENCIA_MAX_CA_KW, type SizingEV } from "./engine";
import type { AvisoTecnico } from "../solar/avisos";

/**
 * Travas técnicas do carregador veicular.
 *
 * O motor aceitava qualquer entrada e devolvia uma especificação sempre — 150
 * kW saíam com disjuntor de 160 A para uma corrente de 228 A, porque as
 * tabelas de disjuntor e de ampacidade acabam ali e o código pegava o último
 * item sem avisar. Especificação subdimensionada é risco de incêndio, não
 * inconveniente comercial.
 *
 * Reaproveita o tipo AvisoTecnico do Solar para a tela renderizar igual.
 */
export type { AvisoTecnico } from "../solar/avisos";

/** Acima disto a instalação deixa de ser residencial comum. */
const POTENCIA_ATENCAO_KW = 22;

export interface AvaliacaoEVInput {
  potenciaKw: number;
  qtdPontos: number;
  sizing: SizingEV;
}

const nf = (v: number, d = 1) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function avaliarEV(i: AvaliacaoEVInput): AvisoTecnico[] {
  const avisos: AvisoTecnico[] = [];
  const s = i.sizing;

  // 1. Fora do alcance do catálogo: a especificação sai subdimensionada.
  if (s.acimaDoCatalogo) {
    avisos.push({
      nivel: "critico",
      titulo: "Potência acima do que este dimensionamento cobre",
      detalhe:
        `A corrente de projeto (${nf(s.correnteProjeto)} A) passa do maior disjuntor e/ou da maior ` +
        `bitola das tabelas usadas aqui. O disjuntor de ${s.disjuntorA} A e o cabo de ${nf(s.secaoMm2)} mm² ` +
        `que aparecem abaixo estão SUBDIMENSIONADOS e não podem ir para a proposta. ` +
        `Este porte pede projeto executivo dedicado.`,
    });
  }

  // 2. Acima do teto prático da recarga CA — outro tipo de equipamento.
  if (i.potenciaKw > POTENCIA_MAX_CA_KW) {
    avisos.push({
      nivel: "critico",
      titulo: "Acima da faixa de recarga em corrente alternada",
      detalhe:
        `${nf(i.potenciaKw)} kW passa do teto prático do modo 3 em CA (IEC 61851: 63 A por fase, ` +
        `cerca de ${POTENCIA_MAX_CA_KW} kW em 380 V). Nessa potência o equipamento é carregador CC, ` +
        `com retificador próprio, requisitos de conexão distintos e dimensionamento que este ` +
        `configurador não faz.`,
    });
  }

  // 3. Queda acima do limite mesmo na maior bitola.
  if (s.quedaAcimaDoLimite) {
    avisos.push({
      nivel: "atencao",
      titulo: "Queda de tensão acima de 4%",
      detalhe:
        `A queda calculada é de ${nf(s.quedaPct * 100, 2)}%. Reduza a distância, aumente a bitola ` +
        `ou reposicione o quadro — acima de 4% o carregador pode reduzir a corrente de recarga.`,
    });
  }

  // 4. Vários pontos: falta o alimentador e o estudo de demanda.
  if (i.qtdPontos > 1) {
    const somaKw = i.potenciaKw * i.qtdPontos;
    avisos.push({
      nivel: "atencao",
      titulo: "Instalação com mais de um ponto de recarga",
      detalhe:
        `${i.qtdPontos} pontos de ${nf(i.potenciaKw)} kW somam ${nf(somaKw)} kW instalados. ` +
        `Este orçamento dimensiona os circuitos terminais, mas NÃO dimensiona o alimentador do ` +
        `quadro nem aplica fator de demanda ou gestão de carga (NBR 17019). Confirme se o padrão ` +
        `de entrada do cliente comporta o acréscimo antes de fechar.`,
    });
  } else if (i.potenciaKw >= POTENCIA_ATENCAO_KW) {
    avisos.push({
      nivel: "atencao",
      titulo: "Verifique o padrão de entrada",
      detalhe:
        `${nf(i.potenciaKw)} kW é um acréscimo relevante de carga. Confirme a capacidade do ramal e ` +
        `do disjuntor geral do cliente — a troca do padrão de entrada, se necessária, não está ` +
        `neste orçamento.`,
    });
  }

  return avisos;
}
