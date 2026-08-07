/**
 * Quais tipos do catálogo de demandas representam o trabalho de cada serviço.
 *
 * São DOIS trabalhos diferentes, e o catálogo já os separa em categorias:
 *
 * - **Projetos** — o que a proposta vende. As horas de executar o projeto.
 * - **Orçamentos** — o tempo gasto para MONTAR a proposta. Existe mesmo quando
 *   o cliente não fecha, e é o custo que passava despercebido: cada orçamento
 *   consome horas de gente que ninguém contabilizava.
 *
 * Servem para SUGERIR as horas quando alguém escolhe o responsável na geração
 * da proposta. É sugestão: os campos continuam editáveis e o catálogo inteiro
 * fica à disposição nos dois casos.
 *
 * ## Por que tantos `undefined`
 *
 * O catálogo foi escrito pensando na fila de trabalho da equipe, não no
 * cardápio de serviços — as duas listas se encostam mas não coincidem. Onde não
 * há correspondência honesta, o mapa devolve nada e a tela pede que a pessoa
 * escolha.
 *
 * Isso é deliberado. Um palpite errado aqui não daria erro: produziria um
 * número de horas plausível, um custo plausível e, nos serviços de Fator K, um
 * PREÇO plausível — e ninguém descobriria.
 */

export interface TipoSugerido {
  categoria: string;
  nome: string;
}

/** O que a tela pergunta: "quem executa" e "quem montou a proposta". */
export type Escopo = "projeto" | "orcamento";

interface TiposDoServico {
  /** Categoria Projetos — o trabalho vendido. */
  projeto: TipoSugerido | null;
  /** Categoria Orçamentos — o tempo de montar a proposta. */
  orcamento: TipoSugerido | null;
}

const proj = (nome: string): TipoSugerido => ({ categoria: "Projetos", nome });
const orc = (nome: string): TipoSugerido => ({ categoria: "Orçamentos", nome });

const MAPA: Readonly<Record<string, TiposDoServico>> = {
  spda: { projeto: proj("Projeto de SPDA"), orcamento: orc("SPDA") },
  "rede-mt": { projeto: proj("Projeto de rede de média tensão"), orcamento: orc("Rede de média tensão") },
  "projeto-subestacao": { projeto: proj("Projeto de subestação"), orcamento: orc("Subestação") },

  // O QGBT é um quadro de baixa tensão: o trabalho de engenharia é o do
  // projeto elétrico de BT, e o catálogo não distingue os dois.
  qgbt: { projeto: proj("Projeto elétrico de baixa tensão"), orcamento: null },
  "projeto-bt": { projeto: proj("Projeto elétrico de baixa tensão"), orcamento: null },

  // Carregador tem tipo de ORÇAMENTO no catálogo, mas não de projeto.
  carregador: { projeto: null, orcamento: orc("Carregador veicular") },

  /*
   * Executar não é projetar: as horas da GTA numa execução de subestação são
   * de acompanhamento de obra. Apontar para "Projeto de subestação" cobraria
   * as 40 h de projeto de quem contratou só a execução. O orçamento dela, por
   * outro lado, é o mesmo trabalho de orçar uma subestação.
   */
  "execucao-subestacao": { projeto: null, orcamento: orc("Subestação") },

  /*
   * Solar: o catálogo separa residencial (3 h) de comercial/rural (10 h), e a
   * diferença é o porte da usina, que este mapa não tem como saber. Chutar um
   * dos dois erraria por três vezes em metade dos casos.
   */
  solar: { projeto: null, orcamento: null },

  // Sem correspondência em nenhuma das duas categorias.
  conexao: { projeto: null, orcamento: null },
  "laudo-inspecao": { projeto: null, orcamento: null },
  analisador: { projeto: null, orcamento: null },
  limpeza: { projeto: null, orcamento: null },

  /*
   * Fornecimento de mão de obra: o trabalho vendido é de equipe TERCEIRIZADA
   * (o catálogo de demandas mede a equipe interna), e o tempo de montar a
   * proposta varia com a obra — não há tipo honesto em nenhum escopo.
   */
  "mao-de-obra": { projeto: null, orcamento: null },
};

/** O tipo sugerido para um serviço num escopo, ou `undefined` se não há honesto. */
export function tipoSugeridoDoServico(chave: string, escopo: Escopo): TipoSugerido | undefined {
  return MAPA[chave]?.[escopo] ?? undefined;
}

/** As chaves que o mapa conhece — o teste usa para cobrar serviço novo. */
export function chavesMapeadas(): string[] {
  return Object.keys(MAPA);
}
