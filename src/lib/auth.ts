/**
 * Sessão e assinatura de cookie (edge-safe).
 *
 * - A sessão é um cookie httpOnly assinado com HMAC-SHA256 (AUTH_SECRET).
 * - Usa Web Crypto, então funciona no Node (rotas) e no Edge (middleware).
 * - NÃO importa banco de dados aqui (o middleware roda no Edge). A validação de
 *   credenciais fica em `src/lib/users/authenticate.ts` (Node).
 */

export const SESSION_COOKIE = "gta_session";

/**
 * Vida do COOKIE em si (janela deslizante). A cada acesso, se já passou da
 * metade, o middleware emite um cookie novo — quem usa a plataforma não é
 * deslogado no meio do trabalho.
 */
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

/**
 * Teto ABSOLUTO da sessão com "continuar conectado". A renovação deslizante
 * nunca passa daqui: mesmo um cookie roubado morre em 30 dias, e o usuário
 * relogar de tempos em tempos é o que limita o estrago.
 */
export const REMEMBER_MAX_SECONDS = 60 * 60 * 24 * 30; // 30 dias

/** Renova o cookie quando resta menos da metade da janela. */
const RENOVAR_QUANDO_RESTAR = SESSION_TTL_SECONDS / 2;

const IS_PROD = process.env.NODE_ENV === "production";

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (IS_PROD) {
    // Em produção NUNCA usar segredo padrão (permitiria forjar sessões).
    throw new Error("AUTH_SECRET não configurado. Defina-o nas variáveis de ambiente.");
  }
  return "dev-secret-troque-em-producao";
}

// ----- assinatura de cookie (HMAC-SHA256) ----------------------------------

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Comparação de tempo constante (não sai no 1º caractere diferente).
 * Em JS puro para funcionar tanto no Node quanto no Edge (middleware).
 * As assinaturas têm tamanho fixo (base64url de SHA-256), então o length
 * não vaza informação útil.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

export interface SessionPayload {
  email: string;
  name?: string;
  /** Expiração DESTA cópia do cookie (janela deslizante). */
  exp: number;
  /** Teto absoluto: a renovação nunca passa daqui. */
  mx: number;
  /**
   * "Password version": impressão digital do hash da senha. Se a senha muda,
   * o hash muda, a impressão não bate e TODAS as sessões antigas caem — é o
   * que torna seguro manter o usuário logado por semanas.
   */
  pv: string;
}

/**
 * Impressão digital curta do hash da senha (edge-safe). Não é segredo: já é
 * derivada de um hash, e serve só para detectar que a senha mudou.
 */
export async function passwordFingerprint(passwordHash: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwordHash));
  return b64url(new Uint8Array(buf)).slice(0, 16);
}

export async function signSession(
  user: { email: string; name?: string; passwordHash: string },
  opts: { lembrar?: boolean; mx?: number } = {},
): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  // Sem "continuar conectado", o teto é a própria janela: some em 12h.
  const mx = opts.mx ?? agora + (opts.lembrar ? REMEMBER_MAX_SECONDS : SESSION_TTL_SECONDS);
  const payload: SessionPayload = {
    email: user.email,
    name: user.name,
    exp: Math.min(agora + SESSION_TTL_SECONDS, mx),
    mx,
    pv: await passwordFingerprint(user.passwordHash),
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(body));
  return `${body}.${sig}`;
}

/** Reassina o mesmo payload com a janela empurrada para frente (sem tocar no teto). */
export async function renewSession(p: SessionPayload): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { ...p, exp: Math.min(agora + SESSION_TTL_SECONDS, p.mx) };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(body));
  return `${body}.${sig}`;
}

/** true quando vale a pena reemitir o cookie (passou da metade e ainda há teto). */
export function precisaRenovar(p: SessionPayload): boolean {
  const agora = Math.floor(Date.now() / 1000);
  return p.exp - agora < RENOVAR_QUANDO_RESTAR && agora < p.mx;
}

/** Segundos restantes até o teto absoluto — vira o maxAge do cookie. */
export function maxAgeRestante(p: SessionPayload): number {
  return Math.max(0, p.mx - Math.floor(Date.now() / 1000));
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(await hmac(body));
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as SessionPayload;
    const agora = Math.floor(Date.now() / 1000);
    if (payload.exp < agora) return null;
    // Teto absoluto e impressão da senha são obrigatórios: um cookie do formato
    // antigo (sem eles) sobreviveria a uma troca de senha, então é recusado —
    // custa um relogin único na virada.
    if (typeof payload.mx !== "number" || payload.mx < agora) return null;
    if (typeof payload.pv !== "string" || !payload.pv) return null;
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_TTL_SECONDS };
