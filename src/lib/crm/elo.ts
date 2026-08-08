import { formatBRL } from "@/lib/format";

/**
 * A ponte entre o CRM e Operações — as regras, sem I/O.
 *
 * O caminho de uma venda na GTA atravessa as duas ferramentas, e quase nunca a
 * mesma pessoa: o comercial abre a negociação, mas quem monta a proposta é a
 * engenharia. Antes, esse pedido era recado de WhatsApp — e o retorno também.
 *
 * A corrente é:
 *
 * ```
 * Negociação ──pedido──> Tarefa (Operações) ──> Proposta ──> Orçamento aprovado
 *      ^                                                            │
 *      └──────────────── valor + aviso ao comercial ────────────────┘
 * ```
 *
 * Cada elo guarda o id do anterior: `Task.negociacaoId`,
 * `Proposta.dados.negociacaoId`, `Orcamento.propostaId` (este já existia). É o
 * que permite andar de volta sem consulta cruzada.
 */

/** Onde a proposta está quando a notícia chega ao comercial. */
export type MomentoDoRetorno = "gerada" | "aprovada";

/**
 * O que fazer com o valor da negociação quando a proposta traz um preço.
 *
 * Substitui, sempre: o preço calculado pelo configurador vale mais que a
 * estimativa digitada na abertura. Mas a estimativa NÃO se perde — vira texto
 * no histórico, porque a distância entre o que o comercial achou e o que a
 * conta deu é informação sobre o próprio processo.
 */
export interface AtualizacaoDeValor {
  /** Novo valor da negociação. */
  valor: number;
  /** Texto da anotação de sistema. */
  texto: string;
  /** Houve mudança que valha reescrever o valor? */
  mudou: boolean;
}

export function atualizacaoDeValor(
  valorAtual: number,
  valorDaProposta: number,
  referencia: string,
  momento: MomentoDoRetorno,
): AtualizacaoDeValor {
  const rotulo = momento === "aprovada" ? "aprovada" : "gerada";
  // Sem preço na proposta não há o que substituir: manter o que o comercial
  // estimou é melhor do que zerar o funil dele.
  if (!Number.isFinite(valorDaProposta) || valorDaProposta <= 0) {
    return {
      valor: valorAtual,
      mudou: false,
      texto: `Proposta ${referencia} ${rotulo}, sem valor informado.`,
    };
  }

  const houveEstimativa = valorAtual > 0;
  const diferente = Math.abs(valorAtual - valorDaProposta) >= 0.01;

  if (houveEstimativa && diferente) {
    return {
      valor: valorDaProposta,
      mudou: true,
      texto:
        `Proposta ${referencia} ${rotulo} — valor da negociação atualizado: ` +
        `estimado ${formatBRL(valorAtual)} → proposta ${formatBRL(valorDaProposta)}.`,
    };
  }

  return {
    valor: valorDaProposta,
    mudou: diferente,
    texto: `Proposta ${referencia} ${rotulo} — ${formatBRL(valorDaProposta)}.`,
  };
}

/** Mensagem do sino para quem abriu a negociação. */
export function avisoDoRetorno(
  negociacaoNome: string,
  referencia: string,
  valor: number,
  momento: MomentoDoRetorno,
): { titulo: string; mensagem: string } {
  if (momento === "aprovada") {
    return {
      titulo: "Proposta aprovada e liberada para envio",
      mensagem:
        `A proposta ${referencia} da negociação "${negociacaoNome}" passou pela revisão interna` +
        `${valor > 0 ? ` e está em ${formatBRL(valor)}` : ""}. Você já pode enviá-la ao cliente.`,
    };
  }
  return {
    titulo: "Proposta pronta na sua negociação",
    mensagem:
      `A proposta ${referencia} da negociação "${negociacaoNome}" foi gerada` +
      `${valor > 0 ? ` — ${formatBRL(valor)}` : ""}. Ela ainda vai passar pela revisão interna.`,
  };
}

/**
 * Título da tarefa que o comercial cria pedindo a proposta.
 *
 * Nomear bem importa mais do que parece: esta tarefa entra numa fila junto com
 * as demais, e "Proposta" sozinho não diz para quem nem do quê.
 */
export function tituloDoPedido(servicoLabel: string, empresa: string): string {
  const alvo = empresa.trim();
  const servico = servicoLabel.trim() || "Proposta";
  return alvo ? `${servico} — ${alvo}` : servico;
}

/**
 * Descrição pré-preenchida do pedido.
 *
 * Repete o que o comercial já sabe (valor estimado, previsão, contato) porque
 * quem recebe a tarefa NÃO abre o CRM: a informação tem que viajar junto.
 */
export function descricaoDoPedido(dados: {
  negociacaoNome: string;
  empresa: string;
  valorEstimado: number;
  previsao: string;
  solicitante: string;
  observacao?: string;
}): string {
  const linhas = [
    `Pedido de proposta a partir da negociação "${dados.negociacaoNome}".`,
    "",
    `Empresa: ${dados.empresa || "—"}`,
    `Valor estimado pelo comercial: ${dados.valorEstimado > 0 ? formatBRL(dados.valorEstimado) : "—"}`,
    `Previsão de fechamento: ${dados.previsao ? dataBR(dados.previsao) : "—"}`,
    `Solicitado por: ${dados.solicitante}`,
  ];
  if (dados.observacao?.trim()) linhas.push("", dados.observacao.trim());
  return linhas.join("\n");
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
