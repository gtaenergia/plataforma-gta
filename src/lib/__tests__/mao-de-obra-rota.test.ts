import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A rota que decide se a calculadora aparece.
 *
 * Relatado em produção: o card não aparece para um usuário ADMIN. O card some
 * quando `podeVerFinanceiro` vem falso, então a pergunta é se a rota está
 * devolvendo isso — e este teste responde sem depender de sessão.
 */

let usuario: { email: string; name: string; role: string; cargoId?: string } | null = null;

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => usuario,
}));

vi.mock("@/lib/cargos/store", () => ({
  cargos: async () => ({ get: async () => null }),
}));

vi.mock("@/lib/settings/store", () => ({
  getSettingsStore: () => ({ get: async () => null, set: async () => undefined }),
}));

async function chamarGet() {
  vi.resetModules();
  const { GET } = await import("@/app/api/mao-de-obra/route");
  const res = await GET();
  return { status: res.status, corpo: await res.json() };
}

beforeEach(() => {
  usuario = null;
});

describe("GET /api/mao-de-obra", () => {
  it("ADMIN recebe podeVerFinanceiro true", async () => {
    // `permissoesDoUsuario` devolve todas as chaves para role admin, sem
    // consultar cargo. Se este teste falhar, o defeito está ali.
    usuario = { email: "matheus@gtaenergia.com", name: "Matheus", role: "admin" };
    const { status, corpo } = await chamarGet();
    expect(status).toBe(200);
    expect(corpo.podeVerFinanceiro).toBe(true);
    expect(corpo.config.funcoes).toBeInstanceOf(Array);
    // E as taxas precisam vir, senão a calculadora abre sem imposto e margem.
    expect(typeof corpo.config.impostoPadrao).toBe("number");
  });

  it("membro sem cargo NÃO recebe os custos", async () => {
    usuario = { email: "teste@gtaenergia.com", name: "Teste", role: "member" };
    const { corpo } = await chamarGet();
    expect(corpo.podeVerFinanceiro).toBe(false);
    // Só nome e id — nenhum custoHora na resposta.
    expect(JSON.stringify(corpo)).not.toContain("custoHora");
  });

  it("sem sessão devolve 401", async () => {
    usuario = null;
    const { status } = await chamarGet();
    expect(status).toBe(401);
  });
});
