/**
 * Freio de tentativas de login.
 *
 * ## Por que isto existe
 *
 * Os e-mails da equipe seguem `nome@gtaenergia.com` e os nomes estão no site
 * da empresa. Quem quiser atacar não precisa descobrir o usuário — só a senha.
 * Sem freio, é questão de tempo de máquina.
 *
 * ## Por que 429 e não espera artificial
 *
 * Segurar a resposta por N segundos ocupa uma função sem servidor pelo mesmo
 * tempo, e o atacante abre outra conexão de graça: quem paga a espera é a
 * infraestrutura, não ele. Devolver 429 na hora com `Retry-After` custa
 * quase nada e nega a tentativa do mesmo jeito.
 *
 * ## Por que contar por e-mail E por IP
 *
 * Só por IP, um ataque distribuído passa. Só por e-mail, qualquer um tranca a
 * conta de um colega de fora (negação de serviço). Contando os dois e tomando
 * a penalidade maior, nenhum dos dois buracos fica aberto — e o teto de 15
 * minutos garante que o bloqueio sempre se desfaz sozinho.
 */

/** Tentativas erradas toleradas antes de qualquer penalidade. */
export const FALHAS_LIVRES = 4;

/** Primeira penalidade, em segundos. Dobra a cada falha seguinte. */
export const PENALIDADE_BASE = 30;

/**
 * Teto da penalidade. Existe para o bloqueio SEMPRE se desfazer sozinho: sem
 * teto, alguém que erra a senha várias vezes num dia ruim ficaria trancado
 * por horas, e trancar quem trabalha é um estrago tão real quanto o ataque.
 */
export const PENALIDADE_TETO = 15 * 60;

/** Quanto tempo sem falhar zera a contagem. */
export const JANELA_ESQUECIMENTO = 60 * 60;

/** Segundos de bloqueio depois de `falhas` tentativas erradas seguidas. */
export function penalidadeSegundos(falhas: number): number {
  if (!Number.isFinite(falhas) || falhas <= FALHAS_LIVRES) return 0;
  const dobras = falhas - FALHAS_LIVRES - 1;
  // `2 ** dobras` estoura rápido; o teto entra antes de virar Infinity.
  if (dobras > 30) return PENALIDADE_TETO;
  return Math.min(PENALIDADE_BASE * 2 ** dobras, PENALIDADE_TETO);
}

/** Instante (ms) até o qual a chave fica bloqueada. */
export function bloqueadoAte(falhas: number, agoraMs: number): number {
  return agoraMs + penalidadeSegundos(falhas) * 1000;
}

/** Segundos que faltam para liberar — 0 quando já passou. */
export function segundosRestantes(bloqueadoAteMs: number, agoraMs: number): number {
  return Math.max(0, Math.ceil((bloqueadoAteMs - agoraMs) / 1000));
}

/**
 * Contagem de falhas depois de considerar o esquecimento.
 *
 * Sem isto, uma pessoa que errou a senha três vezes em janeiro começaria
 * fevereiro com três strikes acumulados.
 */
export function falhasVigentes(falhas: number, ultimaFalhaMs: number, agoraMs: number): number {
  if (agoraMs - ultimaFalhaMs > JANELA_ESQUECIMENTO * 1000) return 0;
  return Math.max(0, falhas);
}

/** Chaves de contagem. Prefixo evita que um e-mail chamado como um IP colida. */
export const chaveEmail = (email: string) => `email:${email.trim().toLowerCase()}`;
export const chaveIp = (ip: string) => `ip:${ip.trim()}`;

/**
 * IP do cliente atrás do proxy da Vercel.
 *
 * `x-forwarded-for` é uma lista; o primeiro item é o cliente e os demais são
 * os saltos. Um cliente pode ENVIAR esse cabeçalho forjado, mas a Vercel
 * reescreve o primeiro valor com o IP real da conexão, então confiar no
 * primeiro item é seguro aqui — e não seria numa origem exposta direto.
 */
export function ipDaRequisicao(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const primeiro = xff.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return headers.get("x-real-ip")?.trim() || "desconhecido";
}
