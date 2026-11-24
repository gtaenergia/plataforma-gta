/**
 * Tipos e textos da auditoria do Financeiro — sem dependência de Node, para a
 * tela poder importar. A gravação mora em auditoria.ts.
 */

export type AcaoAuditoria =
  | "cadeado.aberto"
  | "cadeado.falha"
  | "cadeado.bloqueio"
  | "cadeado.fechado"
  | "lanc.criar"
  | "lanc.editar"
  | "lanc.pagar"
  | "lanc.desfazer"
  | "lanc.excluir"
  | "rec.criar"
  | "rec.editar"
  | "rec.excluir"
  | "saldo.conferir"
  | "config.alterar"
  | "importar"
  | "acesso.concedido"
  | "acesso.revogado"
  | "acesso.negado"
  | "senha.redefinida";

export const ACAO_TEXTO: Record<AcaoAuditoria, string> = {
  "cadeado.aberto": "Abriu o Financeiro",
  "cadeado.falha": "Errou a senha do Financeiro",
  "cadeado.bloqueio": "Bloqueado por tentativas erradas",
  "cadeado.fechado": "Fechou o Financeiro",
  "lanc.criar": "Criou lançamento",
  "lanc.editar": "Editou lançamento",
  "lanc.pagar": "Marcou como pago/recebido",
  "lanc.desfazer": "Desfez pagamento",
  "lanc.excluir": "Excluiu lançamento",
  "rec.criar": "Criou recorrente",
  "rec.editar": "Editou recorrente",
  "rec.excluir": "Excluiu recorrente",
  "saldo.conferir": "Conferiu o saldo do banco",
  "config.alterar": "Alterou as configurações",
  importar: "Importou dados",
  "acesso.concedido": "Deu acesso ao Financeiro",
  "acesso.revogado": "Tirou acesso ao Financeiro",
  "acesso.negado": "Tentou mexer no acesso ao Financeiro (negado)",
  "senha.redefinida": "Redefiniu a senha de quem tem acesso",
};

export interface RegistroAuditoria {
  id: string;
  quando: string;
  email: string;
  nome: string;
  acao: AcaoAuditoria;
  /** Id do documento (ou e-mail do usuário, nas ações de acesso). */
  alvo: string;
  /** Uma linha legível: "Pró-labore do Tito · R$ 6.000,00". */
  resumo: string;
  antes: unknown;
  depois: unknown;
  ip: string;
  agente: string;
}
