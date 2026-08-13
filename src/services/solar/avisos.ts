/**
 * Validação técnica do sistema dimensionado.
 *
 * O configurador dimensiona a partir do consumo e não conhecia limite nenhum:
 * aceitava monofásico com inversor de 25 kW e sistemas de 588 kWp saindo com
 * proposta escrita "microgeração". Aqui ficam as travas que o projeto real tem.
 *
 * Nada aqui BLOQUEIA o orçamento — o projetista às vezes sabe de algo que a
 * conta não sabe. Os avisos aparecem na tela para a decisão ser consciente.
 */

// O tipo vive em @/lib/avisos (é compartilhado com carregador e capacidade);
// reexportado aqui para não quebrar quem já importava deste caminho.
export type { NivelAviso, AvisoTecnico } from "@/lib/avisos";
import type { AvisoTecnico } from "@/lib/avisos";

/**
 * Limite entre microgeração e minigeração (Lei 14.300/2022): até 75 kW é
 * microgeração. Acima disso mudam o rito de conexão, os prazos e o texto da
 * proposta — que hoje é fixo em "MICROGERAÇÃO SOLAR ON-GRID".
 */
export const LIMITE_MICROGERACAO_KW = 75;

/**
 * Potência máxima TÍPICA de geração por tipo de ligação. Varia por
 * distribuidora — a Equatorial define na NT.002, e a GTA tem essa norma na
 * pasta Serviços. Os valores abaixo são referência conservadora para levantar
 * a mão cedo; confirme na norma vigente antes de fechar o projeto.
 */
export const LIMITE_POR_LIGACAO_KW: Record<"mono" | "bi" | "tri", number> = {
  mono: 10,
  bi: 20,
  tri: 75,
};

/** Overload (kWp CC ÷ kW CA − 1) que os inversores comportam sem cortar geração. */
const OVERLOAD_MAX_SAUDAVEL = 0.5;

/** Maior inversor string do catálogo comercial (ver commercial.ts). */
const MAIOR_INVERSOR_CATALOGO_KW = 75;

export interface AvaliacaoInput {
  consumoMedio: number;
  disponibilidade: number;
  tipoConexao: "mono" | "bi" | "tri";
  /** Potência CC dos módulos (kWp). */
  kwpTotal: number;
  /**
   * Potência CA TOTAL do conjunto (kW) — é o que a distribuidora enxerga.
   *
   * Total, não a de uma unidade: com dois inversores de 75 kW este número é
   * 150. Quem chama monta com `potenciaCaTotal` (sizing.ts); enquanto chegava
   * aqui a potência unitária, as travas abaixo julgavam metade do sistema.
   */
  potenciaInversor: number;
  /** Quantos inversores — decide se ainda faz sentido falar em "um só". */
  qtdInversores?: number;
  overload: number;
}

const nf = (v: number, d = 1) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function avaliarSistema(i: AvaliacaoInput): AvisoTecnico[] {
  const avisos: AvisoTecnico[] = [];

  // 1. Consumo que não paga nem o custo de disponibilidade: gerar não adianta,
  //    porque a fatura mínima continua sendo cobrada de qualquer forma.
  if (i.consumoMedio > 0 && i.consumoMedio <= i.disponibilidade) {
    avisos.push({
      nivel: "critico",
      titulo: "Consumo abaixo do custo de disponibilidade",
      detalhe:
        `O consumo médio (${nf(i.consumoMedio, 0)} kWh/mês) não supera o mínimo faturado da ligação ` +
        `${i.tipoConexao === "mono" ? "monofásica" : i.tipoConexao === "bi" ? "bifásica" : "trifásica"} ` +
        `(${i.disponibilidade} kWh). A fatura mínima continua sendo cobrada mesmo gerando tudo, ` +
        `então o sistema não se paga. Confira os 12 meses de consumo.`,
    });
  }

  // 2. Acima de 75 kW deixa de ser microgeração — e a proposta continuaria
  //    afirmando que é, num documento assinado.
  //
  //    Olha CC e CA. Só a potência CA não basta: o catálogo de inversores para
  //    em 75 kW, então um arranjo de 291 kWp recebia sugestão de 75 kW e passava
  //    pela trava justamente no caso mais gritante.
  const potenciaDeclarada = Math.max(i.potenciaInversor, 0);
  const excedeCa = potenciaDeclarada > LIMITE_MICROGERACAO_KW;
  const excedeCc = i.kwpTotal > LIMITE_MICROGERACAO_KW;
  if (excedeCa || excedeCc) {
    const medida = excedeCa
      ? `A potência CA de ${nf(potenciaDeclarada)} kW`
      : `O arranjo de ${nf(i.kwpTotal)} kWp`;
    avisos.push({
      nivel: "critico",
      titulo: "Passou de microgeração — isto é minigeração",
      detalhe:
        `${medida} ultrapassa o limite de ${LIMITE_MICROGERACAO_KW} kW da microgeração (Lei 14.300/2022). ` +
        `Muda o rito de conexão, os prazos e o custo. O texto padrão da proposta diz "microgeração" — ` +
        `ajuste o objeto e o subtítulo antes de gerar o .docx. ` +
        `Qual potência conta para o enquadramento (CC ou CA) deve ser confirmado com a distribuidora.`,
    });
  }

  // 3. Arranjo maior que o maior inversor do catálogo: a sugestão satura em
  //    75 kW e vira um overload absurdo, em vez de indicar vários inversores.
  //
  //    Só vale enquanto houver UM inversor declarado. O aviso pede "defina a
  //    quantidade à mão" e continuava aparecendo depois de o projetista fazer
  //    exatamente isso — porque olhava só a potência CC do arranjo.
  const umInversorSo = (i.qtdInversores ?? 1) <= 1;
  if (umInversorSo && i.kwpTotal > MAIOR_INVERSOR_CATALOGO_KW * (1 + OVERLOAD_MAX_SAUDAVEL)) {
    const estimativa = Math.ceil(i.kwpTotal / (1 + 0.15) / MAIOR_INVERSOR_CATALOGO_KW);
    avisos.push({
      nivel: "atencao",
      titulo: "Arranjo maior que um único inversor",
      detalhe:
        `${nf(i.kwpTotal)} kWp não cabe em um inversor só — o catálogo vai até ${MAIOR_INVERSOR_CATALOGO_KW} kW, ` +
        `e a sugestão automática satura nesse valor. Seriam da ordem de ${estimativa} inversores. ` +
        `Defina a potência e a quantidade à mão.`,
    });
  }

  // 3. Potência incompatível com o tipo de ligação: a distribuidora reprova na
  //    solicitação de acesso, depois da proposta já aceita.
  const limiteLigacao = LIMITE_POR_LIGACAO_KW[i.tipoConexao];
  if (potenciaDeclarada > limiteLigacao) {
    avisos.push({
      nivel: "atencao",
      titulo: "Potência alta para o tipo de ligação",
      detalhe:
        `${nf(potenciaDeclarada)} kW numa ligação ${i.tipoConexao === "mono" ? "monofásica" : i.tipoConexao === "bi" ? "bifásica" : "trifásica"} ` +
        `passa da referência usual (${limiteLigacao} kW). Costuma exigir troca do padrão de entrada. ` +
        `Confirme o limite na norma da distribuidora (Equatorial: NT.002) — ele varia.`,
    });
  }

  // 4. Overload alto corta geração no horário de pico (clipping).
  if (i.overload > OVERLOAD_MAX_SAUDAVEL) {
    avisos.push({
      nivel: "atencao",
      titulo: "Overload elevado",
      detalhe:
        `${nf(i.overload * 100, 0)}% de sobrecarga CC/CA. Acima de ${OVERLOAD_MAX_SAUDAVEL * 100}% o inversor ` +
        `passa a cortar geração nas horas de maior sol, e a produção real fica abaixo da simulada. ` +
        `Confira a faixa admitida pelo fabricante.`,
    });
  }

  // 5. Inversor maior que o arranjo: dinheiro parado em equipamento ocioso.
  if (i.overload < 0 && i.potenciaInversor > 0) {
    avisos.push({
      nivel: "atencao",
      titulo: "Inversor superdimensionado",
      detalhe:
        `A potência CA (${nf(i.potenciaInversor)} kW) é maior que a dos módulos (${nf(i.kwpTotal)} kWp). ` +
        `O inversor nunca chega perto do nominal — normalmente dá para descer uma faixa e baixar o custo.`,
    });
  }

  return avisos;
}
