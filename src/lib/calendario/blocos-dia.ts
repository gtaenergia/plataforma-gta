/**
 * Posiciona os lançamentos de UM dia numa grade de horas (o calendário de
 * apontamentos). Irmão de `faixas.ts`, que faz o mesmo para barras de dias
 * inteiros ao longo de uma semana.
 *
 * ## O piso de altura muda quem sobrepõe quem
 *
 * Um bloco tem altura mínima para continuar legível e clicável. Nesta escala,
 * esse piso vale cerca de 25 minutos — ou seja, um lançamento de 10 minutos
 * OCUPA na tela mais do que durou no relógio.
 *
 * Decidir a sobreposição pelo horário real e desenhar com o piso é o que
 * quebrava: quatro ligações de 10 minutos em sequência não se cruzam em tempo
 * nenhum, então iam todas para a mesma faixa em largura cheia — e se cobriam
 * na tela, escondendo o que estava embaixo.
 *
 * Aqui a colisão é calculada no MESMO espaço em que o bloco é desenhado. Dois
 * lançamentos curtos e encostados passam a ser tratados como concorrentes e
 * ficam lado a lado, como num calendário de agenda. A altura e a duração
 * exibidas continuam vindo do horário real: o layout se ajusta ao desenho, o
 * dado não.
 */

/** Um lançamento do dia, já convertido para minutos desde a meia-noite local. */
export interface ItemDia {
  /** Minutos desde a meia-noite. */
  inicioMin: number;
  /**
   * Fim em minutos desde a meia-noite, podendo passar de 1440 quando o
   * lançamento vira o dia — é o que preserva a duração real de quem trabalha
   * pela madrugada.
   */
  fimMin: number;
}

export interface BlocoPosicionado<T> {
  item: T;
  /** Distância do topo da grade, em px. */
  top: number;
  /** Altura em px, já com o piso aplicado. */
  altura: number;
  /** Índice da coluna dentro do grupo de concorrentes. */
  faixa: number;
  /** Quantas colunas o grupo tem — o bloco ocupa `1/faixas` da largura. */
  faixas: number;
}

export interface OpcoesDia {
  /** Altura de uma hora na grade, em px. */
  pxPorHora: number;
  /** Altura mínima de um bloco, em px. */
  alturaMinPx: number;
  /** Primeira hora exibida na grade — define o zero do `top`. */
  horaIni: number;
}

/**
 * Duração, em minutos, que o piso de altura ocupa na tela.
 *
 * Sai das MESMAS duas constantes que desenham o bloco, de propósito: se
 * alguém mudar a altura da hora ou o piso, a conta de colisão acompanha
 * sozinha. Foi a divergência entre esses dois números que causou o defeito.
 */
export function duracaoOcupada(opcoes: OpcoesDia): number {
  return (opcoes.alturaMinPx / opcoes.pxPorHora) * 60;
}

export function posicionarDia<T extends ItemDia>(
  itens: readonly T[],
  opcoes: OpcoesDia,
  desempate: (a: T, b: T) => number = () => 0,
): BlocoPosicionado<T>[] {
  const minimo = duracaoOcupada(opcoes);

  // `fimVisual` é onde o bloco de fato TERMINA na tela. É por ele que a
  // colisão é decidida; `fimMin` continua mandando na altura e na duração.
  const comExtensao = itens
    .map((item) => ({
      item,
      inicio: item.inicioMin,
      fim: item.fimMin,
      fimVisual: Math.max(item.fimMin, item.inicioMin + minimo),
    }))
    .sort(
      (a, b) =>
        a.inicio - b.inicio || b.fimVisual - a.fimVisual || desempate(a.item, b.item),
    );

  const saida: BlocoPosicionado<T>[] = [];
  let grupo: typeof comExtensao = [];
  let fimDoGrupo = -Infinity;

  /** Distribui um grupo já fechado nas faixas e empurra para a saída. */
  const fecharGrupo = () => {
    if (grupo.length === 0) return;
    // `colunas[i]` guarda o fim VISUAL do último bloco daquela faixa.
    const colunas: number[] = [];
    const faixaDe: number[] = [];
    grupo.forEach((b, i) => {
      let f = colunas.findIndex((fimAnterior) => b.inicio >= fimAnterior);
      if (f === -1) {
        f = colunas.length;
        colunas.push(0);
      }
      colunas[f] = b.fimVisual;
      faixaDe[i] = f;
    });
    grupo.forEach((b, i) => {
      const duracao = Math.max(1, b.fim - b.inicio);
      saida.push({
        item: b.item,
        top: ((b.inicio - opcoes.horaIni * 60) / 60) * opcoes.pxPorHora,
        altura: Math.max(opcoes.alturaMinPx, (duracao / 60) * opcoes.pxPorHora),
        faixa: faixaDe[i],
        faixas: colunas.length,
      });
    });
    grupo = [];
    fimDoGrupo = -Infinity;
  };

  for (const b of comExtensao) {
    // Começou depois do fim visual de TODOS os anteriores: o grupo se encerrou.
    if (b.inicio >= fimDoGrupo) fecharGrupo();
    grupo.push(b);
    fimDoGrupo = Math.max(fimDoGrupo, b.fimVisual);
  }
  fecharGrupo();

  return saida;
}
