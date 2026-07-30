/**
 * Dimensionamento com MICROINVERSORES.
 *
 * O paradigma é diferente do inversor string e por isso vive num módulo à
 * parte: no string existe UM inversor central; no micro há N unidades de uma
 * mesma potência, e quantos módulos cada uma atende sai do cálculo
 * (nº de painéis ÷ nº de unidades).
 *
 * Tudo aqui é SUGESTÃO, nunca trava: a potência aceita qualquer valor (o
 * catálogo é só atalho para as que a GTA costuma cotar) e a quantidade pode
 * ser fixada à mão. O projeto real foge da conta com frequência — expansão
 * prevista, arranjo do telhado, o que já existe em estoque.
 *
 * Catálogo genérico de propósito (sem marca), igual à lista de materiais.
 *
 * Módulo leve e sem dependências: é importado também no cliente (configurador).
 */

/** Potências comerciais de microinversores (kW). */
export const MICROINVERSORES_COMERCIAIS = [3, 4, 5, 6, 6.6, 7.5, 8, 10, 15, 20, 25];

/**
 * Potência máxima por ramal (circuito) CA. Os microinversores são ligados a um
 * tronco CA protegido por um disjuntor, e a soma do ramal não pode estourá-lo.
 *
 * Base: ramal de 20 A em 220 V, aplicando os 80% que a NBR 5410 exige para
 * carga contínua (geração roda horas seguidas) → 20 × 0,8 × 220 ≈ 3520 W.
 * É uma premissa CONSERVADORA: troncos maiores comportam mais por ramal. Como
 * todo o resto da lista de materiais, serve de estimativa e o projeto
 * executivo ajusta.
 */
export const POTENCIA_MAX_POR_RAMAL_KW = 3.5;

/** Rótulo de exibição: "6,6 kW". */
export function microLabel(potenciaKw: number): string {
  return `${potenciaKw.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kW`;
}

/**
 * Sugere a potência de microinversor que melhor cobre o sistema com UMA
 * unidade próxima do overload desejado. Sistemas maiores que a maior unidade
 * do catálogo caem na maior potência — a quantidade é que cresce.
 */
export function sugerirMicroinversor(kwpTotal: number, overloadDesejado: number): number {
  const alvo = kwpTotal / (1 + overloadDesejado);
  return MICROINVERSORES_COMERCIAIS.reduce((melhor, p) =>
    Math.abs(p - alvo) < Math.abs(melhor - alvo) ? p : melhor,
  );
}

export interface MicroSizingInput {
  nPaineis: number;
  potenciaPainelW: number;
  /** Potência de CADA microinversor (kW). Livre — não precisa ser do catálogo. */
  potenciaKw: number;
  overloadDesejado: number;
  /**
   * Quantidade definida à mão. 0/ausente = derivada do overload alvo.
   * Existe porque o projetista às vezes precisa fugir da conta (expansão
   * prevista, arranjo do telhado, o que já tem em estoque).
   */
  qtdForcada?: number;
}

export interface MicroSizingResult {
  /** Potência de cada unidade (kW). */
  potenciaKw: number;
  /** Quantidade de microinversores (derivada, ou a que o usuário fixou). */
  qtdMicros: number;
  /** Quantidade que a conta sugeriria — para comparar com a escolhida à mão. */
  qtdSugerida: number;
  /** true quando a quantidade veio do usuário, não do cálculo. */
  qtdManual: boolean;
  /** Potência CA instalada total (kW) = qtd × potência da unidade. */
  potenciaCaTotalKw: number;
  /** Overload real do conjunto: kWp / potência CA total − 1. */
  overload: number;
  /** Módulos por unidade (piso) — quando não divide exato, alguns levam +1. */
  modulosPorMicro: number;
  /** Quantas unidades ficam com um módulo a mais (0 = divisão exata). */
  microsComModuloExtra: number;
  /** true quando os painéis não se dividem igualmente entre as unidades. */
  divisaoDesigual: boolean;
  /** Circuitos CA necessários pelo limite de corrente do ramal. */
  ramais: number;
  /** Unidades por circuito (nestas potências, tipicamente 1). */
  microsPorRamal: number;
}

/** Dimensiona o conjunto de microinversores para um nº de painéis. */
export function dimensionarMicro(i: MicroSizingInput): MicroSizingResult {
  const nPaineis = Math.max(1, Math.floor(i.nPaineis));
  const potenciaKw = i.potenciaKw > 0 ? i.potenciaKw : MICROINVERSORES_COMERCIAIS[0];
  const kwpTotal = (nPaineis * i.potenciaPainelW) / 1000;

  // Quantidade que deixa o conjunto mais perto do overload desejado — mesma
  // lógica do inversor string, só que aqui o resultado é a QUANTIDADE.
  // O usuário pode sobrepor: a sugestão vira só referência.
  const alvoCa = kwpTotal / (1 + i.overloadDesejado);
  const qtdSugerida = Math.max(1, Math.round(alvoCa / potenciaKw));
  const qtdManual = Boolean(i.qtdForcada && i.qtdForcada > 0);
  const qtdMicros = qtdManual ? Math.max(1, Math.floor(i.qtdForcada!)) : qtdSugerida;

  const potenciaCaTotalKw = qtdMicros * potenciaKw;
  const overload = potenciaCaTotalKw > 0 ? kwpTotal / potenciaCaTotalKw - 1 : 0;

  // Distribuição dos painéis entre as unidades.
  const modulosPorMicro = Math.floor(nPaineis / qtdMicros);
  const microsComModuloExtra = nPaineis % qtdMicros;

  // Quantas unidades cabem num circuito sem estourar o disjuntor do ramal.
  // Nestas potências (≥ 3 kW) dá 1: cada unidade sai em circuito próprio.
  const microsPorRamal = Math.max(1, Math.floor(POTENCIA_MAX_POR_RAMAL_KW / potenciaKw));
  const ramais = Math.ceil(qtdMicros / microsPorRamal);

  return {
    potenciaKw,
    qtdMicros,
    qtdSugerida,
    qtdManual,
    potenciaCaTotalKw,
    overload,
    modulosPorMicro,
    microsComModuloExtra,
    divisaoDesigual: microsComModuloExtra > 0,
    ramais,
    microsPorRamal,
  };
}
