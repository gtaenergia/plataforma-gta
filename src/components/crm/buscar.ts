/**
 * Busca JSON que NÃO transforma falha em lista vazia.
 *
 * O padrão anterior era `fetch(url).then(r => r.json()).then(d => setX(d.itens ?? []))`.
 * Ele mente em dois casos que acontecem de verdade:
 *
 * - **Sessão revogada** (senha trocada, usuário desativado): o middleware roda
 *   no Edge e não consulta o banco, então deixa passar; a rota responde 401 em
 *   JSON; `d.itens` é `undefined`; a tela mostra "Nenhuma negociação ainda —
 *   crie a primeira". A pessoa acha que perdeu a base.
 * - **Sessão expirada**: o desvio para `/login` devolve HTML, e `r.json()`
 *   rejeita. Sem `catch`, a promessa morre em silêncio e o clique não faz nada.
 *
 * Aqui os dois viram erro com mensagem, que a tela mostra.
 */
export async function buscarJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique a rede e tente de novo.");
  }

  // Desvio para o login devolve HTML com status 200 — olhar só o status diria
  // que deu certo.
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  const corpo = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
    throw new Error(corpo.error ?? `Falha ao carregar (${res.status}).`);
  }
  return corpo;
}

/**
 * Mesma ideia para escrita: devolve o corpo já validado, com a mensagem do
 * servidor quando houver — inclusive o detalhe por campo do zod.
 */
export async function enviarJson<T>(url: string, metodo: "POST" | "PATCH" | "PUT" | "DELETE", corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      ...(corpo === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique a rede e tente de novo.");
  }

  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) {
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  }

  const dados = (await res.json()) as T & { error?: string; issues?: { fieldErrors?: Record<string, string[]> } };
  if (!res.ok) throw new Error(mensagemDeErro(dados));
  return dados;
}

/**
 * "Dados inválidos." não diz o que corrigir.
 *
 * Todas as rotas devolvem `issues` do zod, e nenhuma tela lia — o usuário via a
 * frase genérica e não tinha como saber qual campo recusou. Aqui o primeiro
 * erro de campo vira a mensagem.
 */
export function mensagemDeErro(dados: { error?: string; issues?: { fieldErrors?: Record<string, string[]> } }): string {
  const campos = dados.issues?.fieldErrors;
  if (campos) {
    for (const [campo, msgs] of Object.entries(campos)) {
      if (msgs?.length) return `${rotulo(campo)}: ${emPortugues(msgs[0])}`;
    }
  }
  return dados.error ?? "Não foi possível concluir. Tente de novo.";
}

/**
 * O zod só tem mensagem própria onde alguém escreveu uma.
 *
 * Nas demais regras ele devolve o texto padrão, em inglês — e ele chega inteiro
 * à tela: "String must contain at most 200 character(s)". Traduzir aqui, na
 * camada que exibe, resolve para todas as rotas de uma vez; escrever a mensagem
 * em cada `.max()` dos esquemas seria a mesma frase repetida dezenas de vezes.
 * O que não casar continua aparecendo como veio — nunca some.
 */
function emPortugues(msg: string): string {
  const limite = /String must contain at (most|least) (\d+) character\(s\)/.exec(msg);
  if (limite) {
    const [, lado, n] = limite;
    return lado === "most" ? `no máximo ${n} caracteres.` : `no mínimo ${n} caracteres.`;
  }
  const numero = /Number must be (less|greater) than or equal to (-?[\d.]+)/.exec(msg);
  if (numero) {
    const [, lado, n] = numero;
    return lado === "less" ? `no máximo ${n}.` : `no mínimo ${n}.`;
  }
  if (msg === "Required") return "obrigatório.";
  if (msg === "Invalid email") return "e-mail inválido.";
  if (msg.startsWith("Expected number")) return "informe um número.";
  if (msg.startsWith("Invalid enum value")) return "opção inválida.";
  return msg;
}

/** Nome do campo como a pessoa o vê na tela, não como ele se chama no código. */
const ROTULOS: Record<string, string> = {
  nome: "Nome",
  funilId: "Funil",
  etapaId: "Etapa",
  valor: "Valor",
  responsavel: "Responsável",
  serviceKey: "Serviço",
  assunto: "Assunto",
  data: "Data",
  hora: "Hora",
  negociacaoId: "Negociação",
  motivoPerdaId: "Motivo da perda",
  precoBase: "Preço base",
  descricao: "Descrição",
  etapas: "Etapas",
  email: "E-mail",
  texto: "Texto",
};
function rotulo(campo: string): string {
  return ROTULOS[campo] ?? campo;
}
