/**
 * Qual tipo do catálogo de demandas representa o trabalho de cada serviço.
 *
 * Serve para SUGERIR as horas quando alguém escolhe o responsável na geração da
 * proposta. É sugestão: o campo continua editável, e o catálogo inteiro fica à
 * disposição.
 *
 * ## Por que vários serviços não têm tipo
 *
 * O catálogo foi escrito pensando na fila de trabalho da equipe, não no cardápio
 * de serviços — as duas listas se encostam mas não coincidem. Onde não há
 * correspondência honesta, o mapa devolve `undefined` e a tela pede que a pessoa
 * escolha.
 *
 * Isso é deliberado. Um palpite errado aqui não daria erro: produziria um número
 * de horas plausível, um custo plausível e, nos serviços de Fator K, um PREÇO
 * plausível — e ninguém descobriria. Melhor a tela perguntar.
 */

export interface TipoSugerido {
  categoria: string;
  nome: string;
}

const MAPA: Readonly<Record<string, TipoSugerido | null>> = {
  // Correspondência direta: o serviço é o tipo.
  spda: { categoria: "Projetos", nome: "Projeto de SPDA" },
  "rede-mt": { categoria: "Projetos", nome: "Projeto de rede de média tensão" },
  "projeto-bt": { categoria: "Projetos", nome: "Projeto elétrico de baixa tensão" },
  carregador: { categoria: "Orçamentos", nome: "Carregador veicular" },
  "projeto-subestacao": { categoria: "Projetos", nome: "Projeto de subestação" },
  conexao: { categoria: "Administrativo", nome: "Solicitação de orçamento de conexão" },

  // O QGBT é um quadro de baixa tensão: o trabalho de engenharia é o mesmo do
  // projeto elétrico de BT, e o catálogo não distingue os dois.
  qgbt: { categoria: "Projetos", nome: "Projeto elétrico de baixa tensão" },

  /*
   * Sem tipo natural — e cada um por um motivo diferente:
   *
   * - execucao-subestacao: executar não é projetar. As horas da GTA aqui são de
   *   acompanhamento de obra, e "Projeto de subestação" já é o tipo do serviço
   *   `projeto-subestacao` — apontar os dois para lá cobraria as 40 h de projeto
   *   também de quem só contratou a execução.
   * - solar: o catálogo separa residencial (3 h) de comercial/rural (10 h), e
   *   a diferença é o porte da usina, que este mapa não tem como saber. Chutar
   *   um dos dois erraria por três vezes em metade dos casos.
   * - laudo-inspecao e analisador-energia: envolvem campo e relatório em
   *   proporções que variam com o serviço; "Levantamento em campo" cobriria só
   *   um pedaço.
   * - limpeza: não existe nada parecido no catálogo.
   */
  "execucao-subestacao": null,
  solar: null,
  "laudo-inspecao": null,
  analisador: null,
  limpeza: null,
};

/** O tipo sugerido para um serviço, ou `undefined` quando não há um honesto. */
export function tipoSugeridoDoServico(chave: string): TipoSugerido | undefined {
  return MAPA[chave] ?? undefined;
}

/** As chaves que o mapa conhece — o teste usa para cobrar serviço novo. */
export function chavesMapeadas(): string[] {
  return Object.keys(MAPA);
}
