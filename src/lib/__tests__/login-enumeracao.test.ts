import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A defesa contra enumeração de usuários por tempo.
 *
 * O defeito medido antes da correção: e-mail inexistente respondia em 0,0 ms e
 * e-mail existente em 59,7 ms, porque `validateCredentials` saía antes de
 * hashear quando não achava o usuário. Sessenta milissegundos são triviais de
 * cronometrar pela rede — dava para mapear quem tem conta sem tentar senha
 * nenhuma, e ainda separar conta desativada de inexistente.
 *
 * O teste NÃO cronometra: medir tempo em teste é receita de intermitência. Ele
 * verifica a causa — que o scrypt roda nos três caminhos.
 */

const verifyPassword = vi.fn(() => false);
let usuario: { email: string; passwordHash: string; active: boolean } | null = null;

vi.mock("@/lib/users/password", () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...(args as [])),
  hashPassword: (p: string) => `scrypt$sal$${p}`,
}));

vi.mock("@/lib/users/store", () => ({
  users: async () => ({ getByEmail: async () => usuario }),
}));

async function carregar() {
  vi.resetModules();
  return import("@/lib/users/authenticate");
}

beforeEach(() => {
  verifyPassword.mockClear();
  verifyPassword.mockReturnValue(false);
  usuario = { email: "marcela@gtaenergia.com", passwordHash: "scrypt$abc$def", active: true };
});

describe("validateCredentials", () => {
  it("gasta o scrypt mesmo quando o e-mail NÃO existe", async () => {
    usuario = null;
    const { validateCredentials } = await carregar();
    expect(await validateCredentials("ninguem@gtaenergia.com", "x")).toBeNull();
    expect(verifyPassword, "sem hashear, o tempo denuncia que a conta não existe").toHaveBeenCalledTimes(1);
  });

  it("gasta o scrypt quando a conta está DESATIVADA", async () => {
    // Sair antes por `active === false` separaria "desativado" de
    // "inexistente" — informação que um atacante usa para escolher o alvo.
    usuario = { email: "exfuncionario@gtaenergia.com", passwordHash: "scrypt$abc$def", active: false };
    const { validateCredentials } = await carregar();
    expect(await validateCredentials("exfuncionario@gtaenergia.com", "x")).toBeNull();
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("usa a isca, não o hash real, quando não há usuário", async () => {
    usuario = null;
    const { validateCredentials } = await carregar();
    await validateCredentials("ninguem@gtaenergia.com", "x");
    const [, hashUsado] = verifyPassword.mock.calls[0] as unknown as [string, string];
    // Precisa ser um hash BEM FORMADO: `verifyPassword` devolve false na hora
    // se o formato não bater, e aí o scrypt nem roda — o buraco voltaria.
    expect(hashUsado).toMatch(/^scrypt\$/);
  });

  it("a isca é a mesma entre chamadas (gerada uma vez)", async () => {
    usuario = null;
    const { validateCredentials } = await carregar();
    await validateCredentials("a@gtaenergia.com", "x");
    await validateCredentials("b@gtaenergia.com", "x");
    const [, primeira] = verifyPassword.mock.calls[0] as unknown as [string, string];
    const [, segunda] = verifyPassword.mock.calls[1] as unknown as [string, string];
    expect(segunda).toBe(primeira);
  });

  it("continua deixando entrar quem acerta", async () => {
    verifyPassword.mockReturnValue(true);
    const { validateCredentials } = await carregar();
    const u = await validateCredentials("marcela@gtaenergia.com", "senha-certa");
    expect(u?.email).toBe("marcela@gtaenergia.com");
  });

  it("recusa senha errada de usuário existente", async () => {
    const { validateCredentials } = await carregar();
    expect(await validateCredentials("marcela@gtaenergia.com", "errada")).toBeNull();
  });
});
