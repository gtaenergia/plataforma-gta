/**
 * Notificações push (Web Push) — o aviso chega com a plataforma fechada.
 *
 * Não é recurso de celular: o mesmo mecanismo vale no computador, no tablet e
 * no telefone. O que muda de um para outro é só onde a notificação aparece.
 */

/**
 * Uma inscrição é um APARELHO, não uma pessoa. A mesma pessoa no celular e no
 * computador tem duas, e cada uma é revogada por conta própria.
 */
export interface InscricaoPush {
  /** URL que o serviço de push do navegador entregou. Identifica o aparelho. */
  endpoint: string;
  /** Chave pública do aparelho, para cifrar a mensagem. */
  p256dh: string;
  /** Segredo de autenticação do aparelho. */
  auth: string;
  /** Dono da inscrição. */
  email: string;
  /** Só para a pessoa reconhecer o aparelho na lista ("Chrome no Android"). */
  aparelho: string;
  criadoEm: string;
}

export type NovaInscricao = Omit<InscricaoPush, "criadoEm">;

/** O que o service worker recebe e transforma em notificação do sistema. */
export interface PayloadPush {
  titulo: string;
  mensagem: string;
  /** Rota interna que o clique abre. "" = abre a raiz. */
  link: string;
  /**
   * Notificações com a mesma `tag` se substituem no lugar de empilhar. Sem
   * isso, três mudanças no mesmo orçamento viram três avisos idênticos.
   */
  tag: string;
}
