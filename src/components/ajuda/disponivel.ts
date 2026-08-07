/**
 * Serviços que já têm página de ajuda "Como precificar" (`/ajuda/[servico]`).
 * O cabeçalho do configurador só mostra o botão de ajuda para estes; a página
 * de ajuda retorna 404 para os demais. Adicione a chave aqui ao criar o conteúdo.
 */
export const SERVICOS_COM_AJUDA = new Set<string>([
  "solar",
  "carregador",
  "spda",
  "projeto-bt",
  "projeto-subestacao",
  "execucao-subestacao",
  "rede-mt",
  "qgbt",
  "conexao",
  "analisador",
  "laudo-inspecao",
  "limpeza",
  "mao-de-obra",
]);
