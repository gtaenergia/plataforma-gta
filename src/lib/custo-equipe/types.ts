import { z } from "zod";

/**
 * Quanto custa para a GTA a hora de cada pessoa da EQUIPE INTERNA.
 *
 * Não confundir com `mao-de-obra`, que é quem a GTA contrata de fora. O áudio
 * separa os dois: "mão de obra é terceirizada, não é nosso administrativo
 * interno".
 *
 * ## Por que uma chave própria, e não junto da jornada
 *
 * A jornada de cada pessoa mora em `equipe:planejamento`, e `/api/planejamento`
 * é aberta a QUALQUER autenticado de propósito — é ela que alimenta a
 * indicação de responsável no formulário de tarefa.
 *
 * Custo-hora, dividido pelas horas, é salário. Se entrasse naquela chave, toda
 * a equipe saberia quanto cada colega ganha, sem ninguém ter decidido isso. Por
 * isso: outra chave, outra rota, atrás de `financeiro.ver`.
 */

export const CUSTO_EQUIPE_KEY = "equipe:custos";

/** Teto de R$/h. Existe para barrar dedo errado, não para limitar o negócio. */
const CUSTO_HORA_MAX = 10_000;

export const custoPessoaSchema = z.object({
  /** R$ por hora. 0 = ainda não cadastrado, nunca "trabalha de graça". */
  custoHora: z.coerce.number().min(0).max(CUSTO_HORA_MAX),
  /**
   * Quando o valor foi mexido pela última vez (ISO).
   *
   * Salário muda, e um R$/h velho não dá erro nenhum: só produz preço errado,
   * plausível, por meses. A tela usa isto para marcar o que envelheceu.
   */
  atualizadoEm: z.string().trim().max(40).optional(),
});

export type CustoPessoa = z.infer<typeof custoPessoaSchema>;

export const configCustoEquipeSchema = z.object({
  /** E-mail (minúsculo) → custo. Ausente = não cadastrado. */
  pessoas: z.record(z.string(), custoPessoaSchema),
});

export type ConfigCustoEquipe = z.infer<typeof configCustoEquipeSchema>;

/**
 * Vazio de propósito. Um valor inventado aqui viraria preço enviado a cliente,
 * e — pior que no catálogo de funções — um salário inventado para uma pessoa
 * real.
 */
export const CONFIG_CUSTO_EQUIPE_PADRAO: ConfigCustoEquipe = { pessoas: {} };

/** Quantos dias até a tela cobrar uma conferência do valor. */
export const DIAS_PARA_REVISAO = 180;

/**
 * O mapa simples que o motor consome: e-mail minúsculo → R$/h.
 *
 * O motor não pode importar este módulo (que lê o banco), então recebe o mapa
 * pronto. A normalização da chave acontece aqui, num lugar só.
 */
export function mapaDeCustos(config: ConfigCustoEquipe): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const [email, dados] of Object.entries(config.pessoas ?? {})) {
    mapa[email.trim().toLowerCase()] = dados.custoHora;
  }
  return mapa;
}

/** true quando o valor está velho o bastante para merecer uma olhada. */
export function precisaRevisao(p: CustoPessoa, agoraMs: number): boolean {
  if (p.custoHora <= 0) return false; // "sem custo" já é sinalizado à parte
  if (!p.atualizadoEm) return true;
  const t = new Date(p.atualizadoEm).getTime();
  if (!Number.isFinite(t)) return true;
  return agoraMs - t > DIAS_PARA_REVISAO * 24 * 60 * 60 * 1000;
}
