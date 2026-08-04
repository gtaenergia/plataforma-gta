/**
 * Cor de identificação de cada pessoa nas telas que mostram várias ao mesmo
 * tempo (hoje, o calendário de apontamentos).
 *
 * ## Por que não é hash do e-mail
 *
 * Hash parece a solução óbvia — dá cor estável para sempre, sem depender de
 * lista. Mas com 7 cores e 6 pessoas a chance de DUAS caírem na mesma passa de
 * 90% (paradoxo do aniversário), e duas pessoas da mesma cor é exatamente o
 * que o recurso existe para evitar. Distinção vale mais que estabilidade
 * eterna, então a cor vem da POSIÇÃO na equipe ordenada por e-mail.
 *
 * O preço: se entrar alguém cujo e-mail venha antes na ordem alfabética, as
 * cores de quem vem depois deslocam uma casa. Acontece na contratação, não no
 * dia a dia, e todas as telas mudam juntas.
 *
 * ## Por que estas cores
 *
 * O bloco é preenchido e leva TEXTO BRANCO por cima, então cada cor precisa de
 * 4,5:1 contra o branco (WCAG AA, texto normal) — o mesmo cuidado que já
 * levou ao `gta.orangeTexto` no tailwind.config. Todas ficam entre 4,99 e
 * 6,32:1; `cor-de-pessoa.test.ts` trava isso para que ninguém troque por uma
 * cor bonita e ilegível depois.
 *
 * Os matizes ficam a 22° de distância no mínimo. Contra o cartão escuro a
 * separação fica em torno de 2,4:1 — abaixo dos 3:1 de componente da WCAG —
 * e é a borda clara do bloco que resolve o limite; não remova essa borda.
 */

/** Sete cores de equipe, em ordem de atribuição. A primeira é a da marca. */
export const PALETA_PESSOAS = [
  "#5B4FCF", // índigo (marca)
  "#B45309", // âmbar
  "#0E7490", // ciano
  "#BE185D", // rosa
  "#047857", // esmeralda
  "#A21CAF", // fúcsia
  "#4D7C0F", // lima
] as const;

/**
 * Cor de quem não está na equipe ativa — tipicamente alguém desativado que
 * ainda tem apontamentos no histórico. Neutra de propósito: não disputa
 * atenção com quem está em atividade, e não se confunde com nenhuma da paleta.
 */
export const COR_FORA_DA_EQUIPE = "#475569"; // ardósia

/**
 * Monta o mapa e-mail → cor para a equipe inteira.
 *
 * Recebe TODA a equipe, não só quem aparece na tela: se dependesse de quem
 * lançou horas na semana, a cor de cada um mudaria conforme os colegas
 * trabalhassem ou não, e ninguém conseguiria associar cor a pessoa.
 */
export function coresDaEquipe(emails: readonly string[]): Map<string, string> {
  const ordenados = [...new Set(emails)].sort((a, b) => a.localeCompare(b));
  return new Map(
    ordenados.map((email, i) => [email, PALETA_PESSOAS[i % PALETA_PESSOAS.length]]),
  );
}

/** Cor de uma pessoa, com a neutra para quem saiu da equipe. */
export function corDePessoa(email: string, cores: Map<string, string>): string {
  return cores.get(email) ?? COR_FORA_DA_EQUIPE;
}
