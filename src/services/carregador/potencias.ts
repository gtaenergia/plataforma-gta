/**
 * Catálogo de potências de recarga em corrente alternada.
 *
 * A regra que mais causa venda mal dimensionada: em CA quem limita a potência
 * é o CARREGADOR DE BORDO DO CARRO, não o wallbox. Um carro de 7 kW ligado a
 * um ponto de 22 kW continua puxando 7 kW — o cliente paga a infraestrutura
 * maior e não ganha nada. Por isso cada opção diz a quem ela serve.
 *
 * Autonomia por hora usa ~6 km/kWh, média de compactos elétricos. É ordem de
 * grandeza para conversa comercial, não especificação.
 *
 * Os modelos citados são exemplos do que circula no Brasil e mudam a cada
 * versão — confirme na ficha do veículo antes de fechar.
 */

export interface PotenciaCA {
  /** Potência (kW) — o que vai para o dimensionamento. */
  kw: number;
  fase: "mono" | "tri";
  /** Corrente por fase (A), que é como a norma e o eletricista raciocinam. */
  correnteA: number;
  rotulo: string;
  /** Autonomia recuperada por hora de recarga (km), aproximada. */
  kmPorHora: number;
  /** A quem esta potência serve. */
  atende: string;
}

const KM_POR_KWH = 6;
const km = (kw: number) => Math.round(kw * KM_POR_KWH);

export const POTENCIAS_CA: PotenciaCA[] = [
  {
    kw: 2.2, fase: "mono", correnteA: 10, rotulo: "2,2 kW · mono (10 A)", kmPorHora: km(2.2),
    atende:
      "Recarga lenta, em tomada reforçada. Serve para híbrido plug-in com bateria pequena ou " +
      "para onde não há folga no padrão de entrada. Um elétrico puro leva a noite inteira e pode " +
      "não completar.",
  },
  {
    kw: 3.7, fase: "mono", correnteA: 16, rotulo: "3,7 kW · mono (16 A)", kmPorHora: km(3.7),
    atende:
      "Híbridos plug-in e elétricos compactos com rodagem urbana leve. Recupera o uso de um dia " +
      "comum durante a noite.",
  },
  {
    kw: 4.6, fase: "mono", correnteA: 20, rotulo: "4,6 kW · mono (20 A)", kmPorHora: km(4.6),
    atende:
      "Meio-termo para quando o padrão de entrada não comporta 32 A. Atende bem elétricos de " +
      "bateria menor.",
  },
  {
    kw: 6.6, fase: "mono", correnteA: 30, rotulo: "6,6 kW · mono (30 A)", kmPorHora: km(6.6),
    atende:
      "É o teto do carregador de bordo de vários elétricos populares — subir de 6,6 para 7,4 kW " +
      "não muda nada nesses carros.",
  },
  {
    kw: 7.4, fase: "mono", correnteA: 32, rotulo: "7,4 kW · mono (32 A)", kmPorHora: km(7.4),
    atende:
      "O padrão de wallbox residencial no Brasil. A maioria dos elétricos vendidos aqui aceita " +
      "esse valor em monofásico (BYD Dolphin e Seal, Volvo EX30, Fiat 500e, Renault Kwid E-Tech). " +
      "Carrega uma bateria de 40 kWh em cerca de 6 horas.",
  },
  {
    kw: 11, fase: "tri", correnteA: 16, rotulo: "11 kW · trifásico (16 A)", kmPorHora: km(11),
    atende:
      "Exige carregador de bordo TRIFÁSICO no carro — presente em parte da linha premium (Volvo, " +
      "BMW, Audi, Tesla) e em alguns BYD. Num carro só monofásico entrega 7,4 kW, e o resto da " +
      "infraestrutura fica ocioso.",
  },
  {
    kw: 22, fase: "tri", correnteA: 32, rotulo: "22 kW · trifásico (32 A)", kmPorHora: km(22),
    atende:
      "Poucos carros aceitam 22 kW em CA. Faz sentido em condomínio, frota ou estabelecimento " +
      "onde vários veículos usam o mesmo ponto ao longo do dia — não para acelerar um carro só.",
  },
  {
    kw: 43, fase: "tri", correnteA: 63, rotulo: "43 kW · trifásico (63 A)", kmPorHora: km(43),
    atende:
      "Teto do modo 3 em corrente alternada. Praticamente fora de uso: nessa faixa o mercado foi " +
      "para o carregador CC, que é outro equipamento e outro projeto.",
  },
];

/** A opção do catálogo que corresponde à potência e fase informadas. */
export function acharPotencia(kw: number, fase: "mono" | "tri"): PotenciaCA | undefined {
  return POTENCIAS_CA.find((p) => Math.abs(p.kw - kw) < 0.05 && p.fase === fase);
}
