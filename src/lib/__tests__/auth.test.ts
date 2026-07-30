import { describe, expect, it, vi, afterEach } from "vitest";
import {
  signSession,
  verifySession,
  renewSession,
  precisaRenovar,
  maxAgeRestante,
  passwordFingerprint,
  REMEMBER_MAX_SECONDS,
} from "../auth";

/**
 * Sessão é superfície de segurança: estes testes travam o contrato que permite
 * manter o usuário logado por semanas sem abrir brecha — assinatura, teto
 * absoluto e revogação quando a senha muda.
 */

const user = { email: "a@gta.com", name: "A", passwordHash: "hash-original" };
const agora = () => Math.floor(Date.now() / 1000);

afterEach(() => vi.useRealTimers());

describe("assinatura do cookie", () => {
  it("ida e volta preserva o usuário", async () => {
    const p = await verifySession(await signSession(user));
    expect(p?.email).toBe("a@gta.com");
    expect(p?.name).toBe("A");
  });

  it("recusa token adulterado no payload", async () => {
    const token = await signSession(user);
    const [, sig] = token.split(".");
    const forjado = btoa(JSON.stringify({ email: "admin@gta.com", exp: agora() + 999, mx: agora() + 999, pv: "x" }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifySession(`${forjado}.${sig}`)).toBeNull();
  });

  it("recusa assinatura trocada", async () => {
    const [body] = (await signSession(user)).split(".");
    expect(await verifySession(`${body}.assinaturaerrada`)).toBeNull();
  });

  it("recusa token vazio ou malformado", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("sem-ponto")).toBeNull();
  });
});

describe("formato antigo (sem teto nem impressão da senha)", () => {
  it("é recusado — sobreviveria a uma troca de senha", async () => {
    // Reproduz um cookie legado assinado com o mesmo segredo: só email + exp.
    const legado = await signSession(user);
    const [, sig] = legado.split(".");
    const body = btoa(JSON.stringify({ email: user.email, exp: agora() + 3600 }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifySession(`${body}.${sig}`)).toBeNull();
  });
});

describe("revogação ao trocar a senha", () => {
  it("a impressão muda quando o hash muda", async () => {
    const antes = await passwordFingerprint("hash-original");
    const depois = await passwordFingerprint("hash-novo");
    expect(antes).not.toBe(depois);
  });

  it("o token guarda a impressão da senha vigente", async () => {
    const p = await verifySession(await signSession(user));
    expect(p?.pv).toBe(await passwordFingerprint("hash-original"));
    // getCurrentUser compara com o hash do banco: mudou, sessão cai.
    expect(p?.pv).not.toBe(await passwordFingerprint("hash-novo"));
  });
});

describe("janela deslizante e teto absoluto", () => {
  it('sem "continuar conectado" o teto é a própria janela de 12h', async () => {
    const p = (await verifySession(await signSession(user)))!;
    expect(p.mx - agora()).toBeLessThanOrEqual(60 * 60 * 12 + 1);
  });

  it('com "continuar conectado" o teto vai a 30 dias', async () => {
    const p = (await verifySession(await signSession(user, { lembrar: true })))!;
    expect(p.mx - agora()).toBeGreaterThan(REMEMBER_MAX_SECONDS - 5);
    // mas o cookie em si continua valendo 12h por vez
    expect(p.exp - agora()).toBeLessThanOrEqual(60 * 60 * 12 + 1);
  });

  it("não renova enquanto a janela está fresca", async () => {
    const p = (await verifySession(await signSession(user, { lembrar: true })))!;
    expect(precisaRenovar(p)).toBe(false);
  });

  it("renova depois de passar da metade da janela", async () => {
    const p = (await verifySession(await signSession(user, { lembrar: true })))!;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000); // +7h
    expect(precisaRenovar(p)).toBe(true);

    const renovado = (await verifySession(await renewSession(p)))!;
    expect(renovado.exp).toBeGreaterThan(p.exp);
    expect(renovado.mx).toBe(p.mx); // teto intacto
    expect(renovado.pv).toBe(p.pv);
  });

  it("a renovação NUNCA passa do teto absoluto", async () => {
    const p = (await verifySession(await signSession(user, { lembrar: true })))!;
    vi.useFakeTimers();
    // quase no fim dos 30 dias: a janela de 12h não pode estourar o teto
    vi.setSystemTime((p.mx - 60 * 30) * 1000);
    const renovado = (await verifySession(await renewSession(p)))!;
    expect(renovado.exp).toBe(p.mx);
    expect(maxAgeRestante(renovado)).toBeLessThanOrEqual(60 * 30);
  });

  it("depois do teto o token morre e não renova", async () => {
    const token = await signSession(user, { lembrar: true });
    const p = (await verifySession(token))!;
    vi.useFakeTimers();
    vi.setSystemTime((p.mx + 60) * 1000);
    expect(precisaRenovar(p)).toBe(false);
    expect(await verifySession(token)).toBeNull();
  });

  it("cookie expirado é recusado", async () => {
    const token = await signSession(user, { lembrar: true });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000); // +13h > janela de 12h
    expect(await verifySession(token)).toBeNull();
  });
});
