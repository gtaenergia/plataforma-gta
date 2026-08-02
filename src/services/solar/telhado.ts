/**
 * Quantos painéis cabem numa água do telhado.
 *
 * O dimensionamento do configurador sai só do consumo e nunca soube se o
 * resultado cabe em algum lugar — tanto que a observação padrão da proposta
 * transfere o risco ao cliente ("é necessário que o telhado possua área útil
 * compatível"). Este módulo responde a pergunta.
 *
 * Escopo de propósito simples: UMA água retangular. Telhado recortado se
 * resolve somando águas, uma de cada vez. Sem dependências — o desenho em
 * canvas roda no cliente.
 *
 * NÃO inclui espaçamento antissombreamento entre fileiras (o painel inclinado
 * projeta sombra na fileira de trás). Isso vale só para laje e solo, depende da
 * latitude e do horário de projeto, e ainda não está aqui: em telhado com
 * caimento o módulo acompanha a água e o problema não existe.
 */

/** Medidas do módulo, em milímetros (como vem na ficha técnica). */
export interface PainelDim {
  /** Lado maior. */
  comprimentoMm: number;
  /** Lado menor. */
  larguraMm: number;
}

/** Módulos comuns no mercado — atalho, o campo aceita qualquer medida. */
export const PAINEIS_DIMENSOES: { rotulo: string; potenciaW: number; dim: PainelDim }[] = [
  { rotulo: "450 W", potenciaW: 450, dim: { comprimentoMm: 1903, larguraMm: 1134 } },
  { rotulo: "550 W", potenciaW: 550, dim: { comprimentoMm: 2279, larguraMm: 1134 } },
  { rotulo: "570 W", potenciaW: 570, dim: { comprimentoMm: 2279, larguraMm: 1134 } },
  { rotulo: "585 W", potenciaW: 585, dim: { comprimentoMm: 2279, larguraMm: 1134 } },
  { rotulo: "610 W", potenciaW: 610, dim: { comprimentoMm: 2382, larguraMm: 1134 } },
  { rotulo: "660 W", potenciaW: 660, dim: { comprimentoMm: 2384, larguraMm: 1303 } },
  { rotulo: "700 W", potenciaW: 700, dim: { comprimentoMm: 2384, larguraMm: 1303 } },
];

/** Medidas do módulo da potência escolhida (a mais próxima, se não houver exata). */
export function dimensaoDoPainel(potenciaW: number): PainelDim {
  const achado = PAINEIS_DIMENSOES.reduce((melhor, p) =>
    Math.abs(p.potenciaW - potenciaW) < Math.abs(melhor.potenciaW - potenciaW) ? p : melhor,
  );
  return achado.dim;
}

export interface TelhadoInput {
  /** Medidas da água, em metros. */
  larguraM: number;
  comprimentoM: number;
  painel: PainelDim;
  /** Folga entre módulos na mesma fileira (mm) — grampos intermediários. */
  espacoEntrePaineisMm: number;
  /** Folga entre fileiras (mm). */
  espacoEntreFileirasMm: number;
  /** Recuo livre em todas as bordas (mm) — manutenção, acesso, SPDA. */
  recuoBordaMm: number;
}

export type Orientacao = "retrato" | "paisagem";

export interface Arranjo {
  orientacao: Orientacao;
  colunas: number;
  fileiras: number;
  total: number;
  /** Espaço realmente ocupado pelo conjunto (m). */
  ocupaLarguraM: number;
  ocupaComprimentoM: number;
  /** Medidas de UM módulo nesta orientação (m) — o desenho usa. */
  painelLarguraM: number;
  painelComprimentoM: number;
}

export interface TelhadoResultado {
  areaTelhadoM2: number;
  utilLarguraM: number;
  utilComprimentoM: number;
  areaUtilM2: number;
  /** As duas orientações, a de maior contagem primeiro. */
  arranjos: Arranjo[];
  /** Melhor arranjo, ou null quando não cabe nenhum módulo. */
  melhor: Arranjo | null;
}

/**
 * Quantos elementos de `tamanho` cabem em `disponivel` com `folga` entre eles.
 * n peças ocupam n×tamanho + (n−1)×folga, então some a folga dos dois lados
 * antes de dividir — sem isso a última peça é descartada por causa de uma
 * folga que não existe depois dela.
 */
function quantosCabem(disponivel: number, tamanho: number, folga: number): number {
  if (tamanho <= 0 || disponivel < tamanho) return 0;
  return Math.max(0, Math.floor((disponivel + folga) / (tamanho + folga)));
}

export function simularTelhado(i: TelhadoInput): TelhadoResultado {
  const larguraM = Math.max(0, i.larguraM);
  const comprimentoM = Math.max(0, i.comprimentoM);
  const recuoM = Math.max(0, i.recuoBordaMm) / 1000;

  // O recuo é descontado dos DOIS lados de cada eixo.
  const utilLarguraM = Math.max(0, larguraM - 2 * recuoM);
  const utilComprimentoM = Math.max(0, comprimentoM - 2 * recuoM);

  const pC = Math.max(0, i.painel.comprimentoMm) / 1000;
  const pL = Math.max(0, i.painel.larguraMm) / 1000;
  const folgaX = Math.max(0, i.espacoEntrePaineisMm) / 1000;
  const folgaY = Math.max(0, i.espacoEntreFileirasMm) / 1000;

  const montar = (orientacao: Orientacao): Arranjo => {
    // Retrato: lado maior na vertical. Paisagem: deitado.
    const larguraPainel = orientacao === "retrato" ? pL : pC;
    const alturaPainel = orientacao === "retrato" ? pC : pL;

    const colunas = quantosCabem(utilLarguraM, larguraPainel, folgaX);
    const fileiras = quantosCabem(utilComprimentoM, alturaPainel, folgaY);

    return {
      orientacao,
      colunas,
      fileiras,
      total: colunas * fileiras,
      ocupaLarguraM: colunas > 0 ? colunas * larguraPainel + (colunas - 1) * folgaX : 0,
      ocupaComprimentoM: fileiras > 0 ? fileiras * alturaPainel + (fileiras - 1) * folgaY : 0,
      painelLarguraM: larguraPainel,
      painelComprimentoM: alturaPainel,
    };
  };

  // Empate vai para retrato: é como a maioria dos telhados é montada.
  const arranjos = [montar("retrato"), montar("paisagem")].sort((a, b) => b.total - a.total);
  const melhor = arranjos[0].total > 0 ? arranjos[0] : null;

  return {
    areaTelhadoM2: larguraM * comprimentoM,
    utilLarguraM,
    utilComprimentoM,
    areaUtilM2: utilLarguraM * utilComprimentoM,
    arranjos,
    melhor,
  };
}
