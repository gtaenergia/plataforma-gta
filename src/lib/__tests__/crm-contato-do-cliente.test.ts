import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contatoDoCadastro } from "@/lib/crm/contato-do-cliente";

/**
 * A seção "Contato" do cadastro do cliente vira contato na aba Contatos —
 * pelas ROTAS de verdade. Mesmo arranjo do `crm-followup-rotas.test.ts`:
 * `chdir` para um diretório temporário e só a sessão fingida.
 */

const ANA = { email: "ana@gta.com", name: "Ana Vendedora", role: "admin" };

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => ANA,
  getSessionUser: async () => ANA,
  requirePageUser: async () => ANA,
}));

type Rotas = {
  clientes: typeof import("@/app/api/clientes/route");
  clienteId: typeof import("@/app/api/clientes/[id]/route");
  contatos: typeof import("@/app/api/crm/contatos/route");
  contatoId: typeof import("@/app/api/crm/contatos/[id]/route");
};
let r: Rotas;
let cwdOriginal: string;
let tmp: string;

const req = (corpo: unknown, metodo = "POST") =>
  new Request("http://localhost/api/clientes", { method: metodo, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpoDe = async (res: Response) => res.json() as Promise<any>;
const contatosDe = async (clienteId: string) =>
  ((await corpoDe(await r.contatos.GET())).contatos as { empresaId: string; nome: string; telefone: string; email: string; id: string }[])
    .filter((c) => c.empresaId === clienteId);

const cadastrar = async (corpo: Record<string, unknown>) => {
  const res = await r.clientes.POST(req(corpo));
  expect(res.status).toBe(201);
  return (await corpoDe(res)).cliente as { id: string };
};

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crm-contato-cliente-"));
  process.chdir(tmp);
  r = {
    clientes: await import("@/app/api/clientes/route"),
    clienteId: await import("@/app/api/clientes/[id]/route"),
    contatos: await import("@/app/api/crm/contatos/route"),
    contatoId: await import("@/app/api/crm/contatos/[id]/route"),
  };
});

afterAll(() => {
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("contatoDoCadastro", () => {
  const base = { nome: "Fazenda Rio Doce", tipoPessoa: "PJ" as const, contatoNome: "", telefone: "", email: "" };

  it("sem nome do contato não há contato — a aba Contatos exige nome", () => {
    expect(contatoDoCadastro({ ...base, telefone: "(62) 3333-0000" })).toBeNull();
  });

  it("pessoa física: o próprio cliente é o contato, se houver como falar com ele", () => {
    const pf = { ...base, nome: "Maria Souza", tipoPessoa: "PF" as const };
    expect(contatoDoCadastro({ ...pf, telefone: "(62) 98888-1111" })).toEqual({ nome: "Maria Souza", telefone: "(62) 98888-1111", email: "" });
    expect(contatoDoCadastro(pf)).toBeNull();
  });
});

describe("Cadastro do cliente → aba Contatos", () => {
  it("cliente novo com a seção Contato preenchida cria o contato, vinculado", async () => {
    const c = await cadastrar({
      nome: "Fazenda Rio Doce", contatoNome: "João Pereira", telefone: "(62) 99999-0000", email: "joao@riodoce.com",
    });
    const contatos = await contatosDe(c.id);
    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({
      nome: "João Pereira", telefone: "(62) 99999-0000", email: "joao@riodoce.com", empresaNome: "Fazenda Rio Doce",
      criadoPor: ANA.email,
    });
  });

  it("sem a seção Contato, nada entra na aba Contatos", async () => {
    const c = await cadastrar({ nome: "Galpão Sem Contato" });
    expect(await contatosDe(c.id)).toHaveLength(0);
  });

  it("na edição, preencher o contato depois também o cadastra", async () => {
    const c = await cadastrar({ nome: "Supermercado Bom Preço" });
    const res = await r.clienteId.PATCH(req({ contatoNome: "Carla", email: "carla@bompreco.com" }, "PATCH"), ctx(c.id));
    expect(res.status).toBe(200);
    expect(await contatosDe(c.id)).toMatchObject([{ nome: "Carla", email: "carla@bompreco.com" }]);

    // Salvar de novo sem mexer no contato não duplica.
    await r.clienteId.PATCH(req({ cidade: "Goiânia" }, "PATCH"), ctx(c.id));
    expect(await contatosDe(c.id)).toHaveLength(1);
  });

  it("o mesmo contato com outro jeito de escrever o nome não duplica", async () => {
    const c = await cadastrar({ nome: "Indústria Alfa", contatoNome: "Paulo", telefone: "(62) 3333-4444" });
    await r.clienteId.PATCH(req({ contatoNome: "Paulo Mendes" }, "PATCH"), ctx(c.id));
    // Casou pelo telefone: é o Paulo de antes, e o contato existente não é reescrito.
    expect(await contatosDe(c.id)).toMatchObject([{ nome: "Paulo" }]);
  });

  it("contato apagado da aba Contatos não volta só porque o cliente foi editado", async () => {
    const c = await cadastrar({ nome: "Clínica Vida", contatoNome: "Rita", telefone: "(62) 97777-0000" });
    const [rita] = await contatosDe(c.id);
    await r.contatoId.DELETE(new Request("http://localhost"), ctx(rita.id));

    await r.clienteId.PATCH(req({ logradouro: "Rua 10" }, "PATCH"), ctx(c.id));
    expect(await contatosDe(c.id)).toHaveLength(0);
  });

  it("falhou o contato, o cliente novo não fica gravado pela metade", async () => {
    const { getContatoStore } = await import("@/lib/crm/contatos-store");
    const { getClienteStore } = await import("@/lib/clientes/store");
    const antes = (await getClienteStore().list()).length;
    const espiao = vi.spyOn(getContatoStore(), "create").mockRejectedValueOnce(new Error("banco fora"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    const res = await r.clientes.POST(req({ nome: "Cliente Azarado", contatoNome: "Zé" }));
    expect(res.status).toBe(500);
    expect((await getClienteStore().list()).length).toBe(antes);
    espiao.mockRestore();
  });
});
