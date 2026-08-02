/**
 * Catálogo central de preços de materiais.
 *
 * Os preços viviam espalhados em tabelas dentro do motor de cada serviço, sem
 * data e sem quem revisasse. Material elétrico muda de preço o tempo todo, e
 * uma proposta feita com custo de um ano atrás sai com a margem errada sem que
 * ninguém perceba — o número parece certo porque a fórmula está certa.
 *
 * Aqui o catálogo é uma LISTA achatada, com id estável: o motor continua com
 * suas tabelas como padrão de fábrica, e o que estiver salvo no registro vence.
 *
 * Hoje só o carregador tem material com preço unitário — os demais serviços
 * recebem o custo já digitado pelo usuário. A estrutura tem `servico` desde o
 * começo para os outros entrarem sem reescrever nada.
 */

export type ServicoComPrecos = "carregador";

export interface MaterialPreco {
  /** Chave estável: sobrevive a mudanças de descrição. */
  id: string;
  servico: ServicoComPrecos;
  categoria: string;
  descricao: string;
  unidade: string;
  preco: number;
}

/** Quanto tempo até a lista pedir revisão. */
export const DIAS_PARA_REVISAO = 120;

export interface TabelaPrecos {
  itens: MaterialPreco[];
  /** ISO — quando os preços foram revisados pela última vez. */
  atualizadoEm: string;
  atualizadoPor: string;
}

// --------------------------------------------------------------- padrões

/**
 * Padrão de fábrica, espelhando as tabelas do motor do carregador (calibradas
 * por cotações reais Megaluz/KG/Schneider, 2025). Alterar aqui muda só o ponto
 * de partida — o que o usuário salvar tem precedência.
 */
const cabo = (mm2: number, preco: number): MaterialPreco => ({
  id: `carregador.cabo.${mm2}`, servico: "carregador", categoria: "Cabeamento",
  descricao: `Cabo flexível HEPR ${mm2.toLocaleString("pt-BR")} mm²`, unidade: "m", preco,
});
const disjuntor = (a: number, preco: number): MaterialPreco => ({
  id: `carregador.disjuntor.${a}`, servico: "carregador", categoria: "Proteção",
  descricao: `Disjuntor termomagnético ${a} A curva C (bipolar)`, unidade: "un", preco,
});
const dr = (a: number, preco: number): MaterialPreco => ({
  id: `carregador.dr.${a}`, servico: "carregador", categoria: "Proteção",
  descricao: `Interruptor DR Tipo A ${a} A / 30 mA (bipolar)`, unidade: "un", preco,
});
const eletroduto = (bitola: string, chave: string, o: { barra: number; luva: number; curva: number }): MaterialPreco[] => [
  { id: `carregador.eletroduto.${chave}.barra`, servico: "carregador", categoria: "Infraestrutura",
    descricao: `Eletroduto galvanizado pesado ${bitola} (barra 3 m)`, unidade: "barra", preco: o.barra },
  { id: `carregador.eletroduto.${chave}.luva`, servico: "carregador", categoria: "Infraestrutura",
    descricao: `Luva galvanizada ${bitola}`, unidade: "un", preco: o.luva },
  { id: `carregador.eletroduto.${chave}.curva`, servico: "carregador", categoria: "Infraestrutura",
    descricao: `Curva galvanizada ${bitola} 90º`, unidade: "un", preco: o.curva },
];
const avulso = (id: string, categoria: string, descricao: string, unidade: string, preco: number): MaterialPreco =>
  ({ id: `carregador.${id}`, servico: "carregador", categoria, descricao, unidade, preco });

export const CATALOGO_PADRAO: MaterialPreco[] = [
  ...eletroduto('1"', "1", { barra: 45, luva: 5, curva: 15 }),
  ...eletroduto('1.1/4"', "1_1_4", { barra: 62, luva: 8, curva: 22 }),
  ...eletroduto('1.1/2"', "1_1_2", { barra: 78, luva: 10, curva: 28 }),
  ...eletroduto('2"', "2", { barra: 105, luva: 14, curva: 38 }),
  ...eletroduto('2.1/2"', "2_1_2", { barra: 150, luva: 20, curva: 55 }),

  avulso("abracadeira", "Infraestrutura", "Abraçadeira tipo D / Unistrut", "un", 2.5),
  avulso("buchaArruela", "Infraestrutura", "Bucha e arruela de alumínio", "par", 3),

  cabo(2.5, 5), cabo(4, 6.5), cabo(6, 8), cabo(10, 12), cabo(16, 18),
  cabo(25, 28), cabo(35, 38), cabo(50, 55), cabo(70, 78),

  disjuntor(16, 45), disjuntor(20, 48), disjuntor(25, 52), disjuntor(32, 56), disjuntor(40, 60),
  disjuntor(50, 70), disjuntor(63, 90), disjuntor(80, 120), disjuntor(100, 150),
  disjuntor(125, 190), disjuntor(160, 240),

  dr(40, 350), dr(63, 420), dr(80, 520), dr(100, 620), dr(125, 750), dr(160, 900),

  avulso("quadro.mono", "Proteção", "Quadro de distribuição IP65 (6 a 8 DIN)", "un", 80),
  avulso("quadro.tri", "Proteção", "Quadro de distribuição IP65 (12 DIN)", "un", 140),
  avulso("dps", "Proteção", "Protetor de surto (DPS) Classe II 275 V / 40 kA", "un", 60),

  avulso("haste", "Aterramento", 'Haste de aterramento cobreada 5/8" × 2,40 m', "un", 66),
  avulso("caixaInspecao", "Aterramento", "Caixa de inspeção de solo", "un", 25),
  avulso("conectorAterr", "Aterramento", "Conector tipo cunha / grampo", "un", 12),

  avulso("terminal", "Acessórios", "Terminal tubular (ilhós)", "un", 1.8),
  avulso("fitaIsolante", "Acessórios", "Fita isolante alta qualidade (rolo 20 m)", "un", 15),
  avulso("fitaAutofusao", "Acessórios", "Fita de autofusão (emendas externas)", "un", 25),
];

/** Data do levantamento que originou os padrões acima. */
export const DATA_CALIBRACAO_PADRAO = "2025-06-01T00:00:00.000Z";

// --------------------------------------------------------------- helpers

/** Dias desde a última revisão. */
export function diasDesde(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export function precisaRevisao(atualizadoEm: string): boolean {
  return diasDesde(atualizadoEm) >= DIAS_PARA_REVISAO;
}

/**
 * Mescla o que está salvo sobre o padrão, POR ID.
 *
 * O padrão manda na estrutura (descrição, unidade, categoria) e o salvo manda
 * no preço. Assim um item novo no código aparece para todo mundo sem apagar as
 * revisões de preço já feitas, e um item removido do código some da lista em
 * vez de ficar de fantasma.
 */
export function mesclarCatalogo(salvos: Pick<MaterialPreco, "id" | "preco">[] | null | undefined): MaterialPreco[] {
  const porId = new Map((salvos ?? []).map((s) => [s.id, s.preco]));
  return CATALOGO_PADRAO.map((p) => {
    const preco = porId.get(p.id);
    return preco != null && Number.isFinite(preco) && preco >= 0 ? { ...p, preco } : p;
  });
}

/** Índice id → preço, que é o formato que os motores consomem. */
export function indicePorId(itens: MaterialPreco[]): Record<string, number> {
  return Object.fromEntries(itens.map((i) => [i.id, i.preco]));
}
