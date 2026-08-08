import { atualizacaoDeValor, avisoDoRetorno, type MomentoDoRetorno } from "./elo";
import { getNegociacaoStore, novaAnotacao } from "./negociacoes-store";
import { notificar } from "../notificacoes/store";

/**
 * O caminho de volta: da proposta pronta para a negociação que a pediu.
 *
 * Chamado de dois lugares — quando o `.docx` é gerado e quando o orçamento é
 * aprovado na esteira. Os dois são momentos diferentes da mesma notícia, e o
 * comercial precisa dos dois: o primeiro diz que a proposta existe; o segundo,
 * que ela passou pela revisão interna e pode ir ao cliente.
 *
 * **Best-effort, como `notificar()`**: nunca lança. Uma falha aqui não pode
 * derrubar a geração do documento nem a aprovação do orçamento — o trabalho
 * principal já aconteceu, e perder o aviso é menos grave do que perder o
 * `.docx` que a pessoa esperou.
 */
export async function devolverAoComercial(dados: {
  negociacaoId: string;
  referencia: string;
  valor: number;
  momento: MomentoDoRetorno;
  autor: string;
  autorNome: string;
}): Promise<void> {
  try {
    if (!dados.negociacaoId) return;
    const store = getNegociacaoStore();
    const negociacao = await store.get(dados.negociacaoId);
    if (!negociacao) return;

    const at = atualizacaoDeValor(negociacao.valor, dados.valor, dados.referencia, dados.momento);

    // O valor só é reescrito quando muda de fato — e nunca quando a negociação
    // tem produtos, porque neles a soma é a verdade (ver `valorDaNegociacao`).
    if (at.mudou && negociacao.produtos.length === 0) {
      await store.update(dados.negociacaoId, { valor: at.valor });
    }

    await store.appendAnotacao(
      dados.negociacaoId,
      novaAnotacao({ tipo: "sistema", texto: at.texto, autor: dados.autor, autorNome: dados.autorNome }),
    );

    // Quem abriu a negociação é quem espera a notícia. Se foi ele mesmo que
    // gerou a proposta, o aviso seria um eco do próprio clique.
    const dono = negociacao.responsavel || negociacao.criadoPor;
    if (dono && dono.toLowerCase() !== dados.autor.toLowerCase()) {
      const aviso = avisoDoRetorno(negociacao.nome, dados.referencia, at.valor, dados.momento);
      await notificar({
        paraEmail: dono,
        tipo: dados.momento === "aprovada" ? "crm_proposta_aprovada" : "crm_proposta_gerada",
        titulo: aviso.titulo,
        mensagem: aviso.mensagem,
        link: `/crm/negociacoes/${dados.negociacaoId}`,
      });
    }
  } catch (e) {
    console.error("CRM: falha ao devolver o resultado da proposta à negociação —", e);
  }
}

/**
 * Descobre a negociação de origem a partir da proposta.
 *
 * O id foi gravado em `dados.negociacaoId` na hora em que o técnico abriu o
 * configurador pelo pedido. Em `dados` e não em coluna própria porque é o mesmo
 * caminho que o cadastro manual já usa — e uma coluna a mais é uma migração a
 * mais em produção.
 */
export function negociacaoDaProposta(dados: Record<string, unknown> | undefined): string {
  const v = dados?.negociacaoId;
  return typeof v === "string" ? v : "";
}
