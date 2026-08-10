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
 * Dois serviços consomem esta lista, de formas diferentes:
 *
 * - **Carregador**: o motor monta a lista de materiais sozinho e busca cada
 *   preço por id.
 * - **Mão de obra**: a pessoa ESCOLHE o material no campo Descrição, e o preço
 *   unitário vem daqui.
 *
 * ## Os ids não têm dono
 *
 * Eles nasceram como `carregador.cabo.10`, porque o carregador era o único
 * serviço a consumir a lista. Isso virou mentira assim que a proposta de mão de
 * obra passou a escolher daqui: um cabo de 10 mm² não é material "de
 * carregador" — é material elétrico, e vai para qualquer obra. O prefixo dizia
 * a quem o item pertencia, e a resposta certa é "a ninguém".
 *
 * Hoje o id é só o material (`cabo.10`), e `idCanonico` traduz o formato antigo
 * — sem ela, toda revisão de preço já feita voltaria calada ao padrão de
 * fábrica no primeiro carregamento.
 */

export interface MaterialPreco {
  /** Chave estável: sobrevive a mudanças de descrição. */
  id: string;
  categoria: string;
  descricao: string;
  unidade: string;
  preco: number;
  /**
   * ISO — quando ESTE preço foi revisado. Por item, não da tabela: a maior
   * parte do catálogo não entra numa proposta qualquer, e avisar sobre
   * material que não será usado treina o usuário a ignorar o aviso.
   */
  atualizadoEm: string;
}

/**
 * Três meses. O prazo é o MESMO para todo material.
 *
 * O que é individual é o relógio, não o prazo: cada item conta a partir da
 * própria revisão, então atualizar ou acrescentar um material reinicia só o
 * dele. É o que mantém o preço justo sem obrigar a revisar a lista inteira
 * de uma vez.
 */
export const DIAS_PARA_REVISAO = 90;

/**
 * O id como ele é hoje.
 *
 * Os ids de fábrica já foram `carregador.<material>`. Quem revisou um preço
 * antes da mudança tem o formato antigo gravado no banco, e `mesclarCatalogo`
 * casa POR ID: sem esta tradução, todas essas revisões deixariam de casar e a
 * lista voltaria ao padrão de fábrica sem uma linha de aviso.
 */
export function idCanonico(id: string): string {
  return String(id ?? "").trim().replace(/^carregador\./, "");
}

/**
 * Id de um material criado pela equipe, derivado da descrição.
 *
 * Derivado, e não sorteado, para a planilha ser idempotente: reimportar a mesma
 * linha atualiza o item em vez de criar um segundo igual. `existentes` evita
 * que uma descrição nova roube o id de um material que já existe.
 */
export function gerarIdMaterial(descricao: string, existentes: Iterable<string> = []): string {
  const base =
    String(descricao ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "material";
  const usados = new Set(existentes);
  if (!usados.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const tentativa = `${base}-${n}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  return `${base}-${Date.now()}`;
}

export interface TabelaPrecos {
  itens: MaterialPreco[];
  /** ISO — revisão mais recente de qualquer item. */
  atualizadoEm: string;
  atualizadoPor: string;
}

// --------------------------------------------------------------- padrões

/**
 * Última conferência dos preços padrão com o fornecedor.
 *
 * É o ponto de partida da contagem de validade: enquanto ninguém revisar pela
 * plataforma, é esta a data que vale. Ao refazer a conferência das cotações,
 * atualize aqui junto com os valores — senão a lista envelhece no relógio sem
 * ter envelhecido de fato.
 */
export const DATA_CALIBRACAO_PADRAO = "2026-07-03T00:00:00.000Z";

/**
 * Padrão de fábrica, espelhando as tabelas do motor do carregador (cotações
 * reais Megaluz/KG/Schneider). Alterar aqui muda só o ponto de partida — o que
 * o usuário salvar tem precedência.
 */
const cabo = (mm2: number, preco: number): MaterialPreco => ({
  id: `cabo.${mm2}`, categoria: "Cabeamento",
  descricao: `Cabo flexível HEPR ${mm2.toLocaleString("pt-BR")} mm²`, unidade: "m", preco,
  atualizadoEm: DATA_CALIBRACAO_PADRAO,
});
const disjuntor = (a: number, preco: number): MaterialPreco => ({
  id: `disjuntor.${a}`, categoria: "Proteção",
  descricao: `Disjuntor termomagnético ${a} A curva C (bipolar)`, unidade: "un", preco,
  atualizadoEm: DATA_CALIBRACAO_PADRAO,
});
const dr = (a: number, preco: number): MaterialPreco => ({
  id: `dr.${a}`, categoria: "Proteção",
  descricao: `Interruptor DR Tipo A ${a} A / 30 mA (bipolar)`, unidade: "un", preco,
  atualizadoEm: DATA_CALIBRACAO_PADRAO,
});
const eletroduto = (bitola: string, chave: string, o: { barra: number; luva: number; curva: number }): MaterialPreco[] => [
  { id: `eletroduto.${chave}.barra`, categoria: "Infraestrutura",
    descricao: `Eletroduto galvanizado pesado ${bitola} (barra 3 m)`, unidade: "barra", preco: o.barra, atualizadoEm: DATA_CALIBRACAO_PADRAO },
  { id: `eletroduto.${chave}.luva`, categoria: "Infraestrutura",
    descricao: `Luva galvanizada ${bitola}`, unidade: "un", preco: o.luva, atualizadoEm: DATA_CALIBRACAO_PADRAO },
  { id: `eletroduto.${chave}.curva`, categoria: "Infraestrutura",
    descricao: `Curva galvanizada ${bitola} 90º`, unidade: "un", preco: o.curva, atualizadoEm: DATA_CALIBRACAO_PADRAO },
];
const avulso = (id: string, categoria: string, descricao: string, unidade: string, preco: number): MaterialPreco =>
  ({ id, categoria, descricao, unidade, preco, atualizadoEm: DATA_CALIBRACAO_PADRAO });

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

  dr(25, 300), dr(40, 350), dr(50, 380), dr(63, 420), dr(80, 520), dr(100, 620), dr(125, 750), dr(160, 900),

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

// --------------------------------------------------------------- helpers

/** Dias desde a última revisão. */
export function diasDesde(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * Quantos dias FALTAM até este preço vencer. Negativo = já venceu, e o quanto.
 *
 * É este número que a tela mostra: "revisado há 40 dias" obriga cada um a
 * fazer a subtração de cabeça para saber se ainda dá tempo.
 */
export function diasRestantes(atualizadoEm: string): number {
  const passados = diasDesde(atualizadoEm);
  if (!Number.isFinite(passados)) return -DIAS_PARA_REVISAO;
  return DIAS_PARA_REVISAO - passados;
}

export function precisaRevisao(atualizadoEm: string): boolean {
  return diasDesde(atualizadoEm) >= DIAS_PARA_REVISAO;
}

/**
 * O que o banco guarda. Só o preço, para os itens que o código define; a
 * definição inteira, para os que a equipe acrescentou pela planilha.
 */
export interface PrecoSalvo {
  id: string;
  preco: number;
  atualizadoEm?: string;
  /** Presentes só nos itens que a equipe acrescentou — é o que os distingue. */
  categoria?: string;
  descricao?: string;
  unidade?: string;
}

/**
 * Mescla o que está salvo sobre o padrão, POR ID.
 *
 * Duas origens convivem na lista final, e a diferença entre elas é de onde a
 * DEFINIÇÃO vem — não de quanto valem na tela, onde todo material é igual:
 *
 * - **Do código**: a estrutura (descrição, unidade, categoria) vem do
 *   `CATALOGO_PADRAO` e o salvo manda no preço. Item novo no código aparece
 *   para todo mundo sem apagar revisões já feitas.
 * - **Da equipe**: id que não existe no código e traz descrição própria. Vem
 *   inteiro do banco.
 *
 * `removidos` é a LÁPIDE do que foi excluído. Ela é necessária só para os
 * itens do código: apagar o registro não bastaria, porque a definição continua
 * no `CATALOGO_PADRAO` e ele voltaria na leitura seguinte.
 *
 * Ids salvos passam por `idCanonico` — as revisões feitas quando o id ainda
 * carregava o prefixo do serviço continuam valendo.
 */
export function mesclarCatalogo(
  salvos: PrecoSalvo[] | null | undefined,
  /** Data de quem foi salvo antes de existir carimbo por item. */
  fallbackData = DATA_CALIBRACAO_PADRAO,
  removidos: string[] = [],
): MaterialPreco[] {
  const porId = new Map((salvos ?? []).map((s) => [idCanonico(s.id), s]));
  const deFabrica = new Set(CATALOGO_PADRAO.map((p) => p.id));
  const enterrados = new Set(removidos.map(idCanonico));

  const base = CATALOGO_PADRAO.filter((p) => !enterrados.has(p.id)).map((p) => {
    const s = porId.get(p.id);
    if (!s || !Number.isFinite(s.preco) || s.preco < 0) return p;
    return { ...p, preco: s.preco, atualizadoEm: s.atualizadoEm ?? fallbackData };
  });

  const daEquipe = (salvos ?? [])
    .filter((s) => {
      const id = idCanonico(s.id);
      // Sem descrição não há o que mostrar: seria uma linha vazia na lista, e
      // um id órfão de item que o código já removeu cai exatamente aqui.
      return id && !deFabrica.has(id) && !enterrados.has(id)
        && !!s.descricao?.trim() && Number.isFinite(s.preco) && s.preco >= 0;
    })
    .map((s) => ({
      id: idCanonico(s.id),
      categoria: s.categoria?.trim() || "Outros",
      descricao: s.descricao!.trim(),
      unidade: s.unidade?.trim() || "un",
      preco: s.preco,
      atualizadoEm: s.atualizadoEm ?? fallbackData,
    }));

  return [...base, ...daEquipe];
}

/** Os itens (de uma lista de ids) cujo preço passou do prazo de revisão. */
export function pendentesEntre(itens: MaterialPreco[], ids: string[]): MaterialPreco[] {
  const usados = new Set(ids);
  return itens.filter((i) => usados.has(i.id) && precisaRevisao(i.atualizadoEm));
}

/** Índice id → preço, que é o formato que os motores consomem. */
export function indicePorId(itens: MaterialPreco[]): Record<string, number> {
  return Object.fromEntries(itens.map((i) => [i.id, i.preco]));
}
