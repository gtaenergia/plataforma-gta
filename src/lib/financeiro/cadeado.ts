import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cadeado do Financeiro: uma segunda porta, com senha, depois do login.
 *
 * ## Por que existe
 *
 * A sessão da plataforma pode durar 30 dias ("continuar conectado"). Um
 * celular desbloqueado na mesa, um notebook aberto na obra, um navegador
 * compartilhado no escritório — qualquer um desses abre a plataforma inteira.
 * Para Operações e CRM isso é aceitável; para pró-labore, cartões e caixa
 * dos sócios, não. O cadeado pede a senha de novo para abrir o Financeiro e
 * se fecha sozinho:
 *
 * - depois de {@link INATIVIDADE_SEGUNDOS} sem ninguém mexer na tela;
 * - depois de {@link TETO_SEGUNDOS} de qualquer forma, mesmo com uso;
 * - quando a senha da conta muda (a impressão da senha entra no token);
 * - no "Sair" e no botão "Bloquear".
 *
 * ## Como
 *
 * Um cookie httpOnly, SameSite=Strict, assinado com HMAC. A chave é derivada
 * do AUTH_SECRET com um rótulo próprio, então um token de sessão nunca serve
 * como token do cadeado (nem o contrário). Nada de estado no servidor: cada
 * função sem servidor valida sozinha.
 */

export const CADEADO_COOKIE = "gta_fin";
/** 30 minutos sem mexer na tela fecham o cadeado. */
export const INATIVIDADE_SEGUNDOS = 30 * 60;
/** Mesmo com uso contínuo, a senha é pedida de novo a cada 12 horas. */
export const TETO_SEGUNDOS = 12 * 60 * 60;
/** Não reemite o cookie a cada clique: só quando passou mais que isto. */
const RENOVAR_APOS_SEGUNDOS = 60;

export interface TokenCadeado {
  /** E-mail da conta que abriu. */
  e: string;
  /** Impressão da senha no momento da abertura. */
  pv: string;
  /** Abertura (segundos). Conta para o teto. */
  ini: number;
  /** Última atividade (segundos). Conta para a inatividade. */
  ult: number;
}

function chave(): Buffer {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET não configurado.");
  }
  // Rótulo próprio: a mesma chave mestra, outra chave de assinatura.
  return createHash("sha256")
    .update("gta-financeiro-cadeado:v1:")
    .update(segredo || "dev-secret-troque-em-producao")
    .digest();
}

const b64 = (b: Buffer) => b.toString("base64url");
const assinar = (corpo: string) => b64(createHmac("sha256", chave()).update(corpo).digest());

export function emitirCadeado(t: TokenCadeado): string {
  const corpo = b64(Buffer.from(JSON.stringify(t)));
  return `${corpo}.${assinar(corpo)}`;
}

export type MotivoFechado = "ausente" | "invalido" | "outra-conta" | "senha-mudou" | "inatividade" | "teto";

/**
 * Valida o token para esta conta e este instante. Devolve o token (para a
 * renovação) ou o motivo de estar fechado — o motivo vai para a tela ("fechou
 * por inatividade"), nunca para decidir acesso de outra forma.
 */
export function lerCadeado(
  token: string | undefined,
  conta: { email: string; pv: string },
  agoraSeg = Math.floor(Date.now() / 1000),
): { ok: true; token: TokenCadeado } | { ok: false; motivo: MotivoFechado } {
  if (!token) return { ok: false, motivo: "ausente" };
  const [corpo, sig] = token.split(".");
  if (!corpo || !sig) return { ok: false, motivo: "invalido" };
  const esperado = Buffer.from(assinar(corpo));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return { ok: false, motivo: "invalido" };
  let t: TokenCadeado;
  try {
    t = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as TokenCadeado;
  } catch {
    return { ok: false, motivo: "invalido" };
  }
  if (typeof t.e !== "string" || typeof t.pv !== "string" || typeof t.ini !== "number" || typeof t.ult !== "number") {
    return { ok: false, motivo: "invalido" };
  }
  if (t.e.toLowerCase() !== conta.email.toLowerCase()) return { ok: false, motivo: "outra-conta" };
  if (t.pv !== conta.pv) return { ok: false, motivo: "senha-mudou" };
  // Relógio do token no futuro é token forjado ou servidor com hora errada: fechado.
  if (t.ini > agoraSeg + 60 || t.ult > agoraSeg + 60) return { ok: false, motivo: "invalido" };
  if (agoraSeg - t.ini > TETO_SEGUNDOS) return { ok: false, motivo: "teto" };
  if (agoraSeg - t.ult > INATIVIDADE_SEGUNDOS) return { ok: false, motivo: "inatividade" };
  return { ok: true, token: t };
}

/** Novo token com a atividade de agora — ou null quando ainda não vale reemitir. */
export function renovarCadeado(t: TokenCadeado, agoraSeg = Math.floor(Date.now() / 1000)): string | null {
  if (agoraSeg - t.ult < RENOVAR_APOS_SEGUNDOS) return null;
  return emitirCadeado({ ...t, ult: agoraSeg });
}

/** Opções do cookie: o navegador o apaga no teto, mesmo que ninguém peça. */
export function opcoesCookie(t: TokenCadeado, agoraSeg = Math.floor(Date.now() / 1000)) {
  return {
    httpOnly: true,
    // Strict: o cookie nem viaja numa navegação vinda de outro site.
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, t.ini + TETO_SEGUNDOS - agoraSeg),
  };
}

export const MOTIVO_TEXTO: Record<MotivoFechado, string> = {
  ausente: "Digite sua senha para abrir o Financeiro.",
  invalido: "Digite sua senha para abrir o Financeiro.",
  "outra-conta": "Digite sua senha para abrir o Financeiro.",
  "senha-mudou": "A senha da conta mudou. Digite a nova senha para abrir o Financeiro.",
  inatividade: "O Financeiro fechou sozinho depois de 30 minutos sem uso. Digite sua senha para continuar.",
  teto: "Por segurança, a senha é pedida de novo a cada 12 horas. Digite sua senha para continuar.",
};
