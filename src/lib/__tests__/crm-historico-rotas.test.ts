import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * O histórico do cliente pelas ROTAS de verdade: as propostas do operacional
 * aparecendo sozinhas, o que o comercial escreve sobre elas, o pedido avulso,
 * o vínculo manual e quem pode apagar.
 *
 * Mesmo arranjo do `crm-fluxo.test.ts`: `chdir` para um diretório temporário
 * (os stores gravam em `data/`) e só a sessão fingida.
 */

const ANA = { email: "ana@gta.com", name: "Ana Vendedora", role: "admin" };
const BETO = { email: "beto@gta.com", name: "Beto Vendedor", role: "member" };
let usuarioAtual: typeof ANA | null = ANA;

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => usuarioAtual,
  getSessionUser: async () => usuarioAtual,
  requirePageUser: async () => usuarioAtual,
}));
vi.mock("@/lib/rbac/resolve", () => ({
  temPermissao: async () => true,
  permissoesDoUsuario: async () => new Set<string>(),
}));

type Rotas = {
  historico: typeof import("@/app/api/crm/historico/route");
  registro: typeof import("@/app/api/crm/historico/[id]/route");
};
let r: Rotas;
let cwdOriginal: string;
let tmp: string;
const ids = { fazenda: "", outro: "", pSpda: "", pManual: "", pApelido: "", pDoOutro: "" };

const req = (corpo: unknown, metodo = "POST") =>
  new Request("http://localhost/api/crm/historico", { method: metodo, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpoDe = async (res: Response) => res.json() as Promise<any>;
const historicoDe = async (clienteId: string) =>
  corpoDe(await r.historico.GET(new Request(`http://localhost/api/crm/historico?cliente=${clienteId}`)));

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crm-historico-"));
  process.chdir(tmp);

  r = {
    historico: await import("@/app/api/crm/historico/route"),
    registro: await import("@/app/api/crm/historico/[id]/route"),
  };

  const { getClienteStore } = await import("@/lib/clientes/store");
  const cliente = (nome: string) =>
    getClienteStore().create({
      nome, tipoPessoa: "PJ", documento: "", contatoNome: "", telefone: "", email: "", cep: "", logradouro: "",
      numero: "", bairro: "", cidade: "", uf: "", segmento: "", observacoes: "", criadoPor: ANA.email,
    });
  ids.fazenda = (await cliente("Fazenda Rio Doce")).id;
  ids.outro = (await cliente("Condomínio Bela Vista")).id;

  const { getPropostaStore } = await import("@/lib/propostas/store");
  const proposta = (cliente: string, serviceKey: string, extra: Record<string, unknown> = {}) =>
    getPropostaStore().create({
      serviceKey, cliente, referencia: "", status: "gerada", dados: { dataEmissao: "2026-03-12", ...extra },
      manual: serviceKey === "outro", criadoPor: ANA.email,
    });
  // Escrito do jeito que o técnico digitou: caixa e acento diferentes.
  ids.pSpda = (await proposta("FAZENDA RIO DÔCE", "spda")).id;
  ids.pManual = (await proposta("Fazenda Rio Doce", "outro", { servicoOutro: "Consultoria tarifária", valor: 3200 })).id;
  ids.pApelido = (await proposta("Faz. R. Doce", "laudo-inspecao")).id;
  ids.pDoOutro = (await proposta("Condomínio Bela Vista", "solar")).id;
});

afterAll(() => {
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Histórico do cliente", () => {
  it("as propostas do cliente entram sozinhas, com serviço e valor", async () => {
    const d = await historicoDe(ids.fazenda);
    const porProposta = new Map((d.linhas as { propostaId: string }[]).map((l) => [l.propostaId, l]));
    expect([...porProposta.keys()].sort()).toEqual([ids.pManual, ids.pSpda].sort());
    // A manual traz o valor digitado no cadastro dela e o nome do serviço avulso.
    expect(porProposta.get(ids.pManual)).toMatchObject({ titulo: "Consultoria tarifária", valor: 3200 });
    expect(porProposta.get(ids.pSpda)).toMatchObject({ natureza: "projeto", naturezaAutomatica: true, propostaEm: "2026-03-12" });
    expect(d.resumo).toMatchObject({ pedidos: 2, fechados: 0 });
  });

  it("a de nome diferente fica disponível para vincular; a de outro cliente do cadastro, não", async () => {
    const d = await historicoDe(ids.fazenda);
    const avulsas = (d.avulsas as { id: string }[]).map((a) => a.id);
    expect(avulsas).toContain(ids.pApelido);
    expect(avulsas).not.toContain(ids.pDoOutro);
  });

  it("escrever sobre a proposta guarda só o que foi escrito — o resto segue automático", async () => {
    const res = await r.historico.POST(req({
      clienteId: ids.fazenda, propostaId: ids.pSpda, apresentadoEm: "2026-03-15", resultado: "fechado",
      decididoEm: "2026-03-20", movimento: "primeira_venda", observacoes: "Fechou na primeira reunião.",
    }));
    expect(res.status).toBe(201);
    const l = ((await historicoDe(ids.fazenda)).linhas as { propostaId: string }[]).find((x) => x.propostaId === ids.pSpda);
    expect(l).toMatchObject({
      apresentadoEm: "2026-03-15", resultado: "fechado", resultadoAutomatico: false, movimento: "primeira_venda",
      natureza: "projeto", naturezaAutomatica: true,
    });
  });

  it("escrever de novo sobre a mesma proposta edita o registro, não cria outro", async () => {
    const res = await r.historico.POST(req({ clienteId: ids.fazenda, propostaId: ids.pSpda, natureza: "execucao" }));
    expect(res.status).toBe(200);
    const { getHistoricoStore } = await import("@/lib/crm/historico-store");
    const daProposta = (await getHistoricoStore().list()).filter((x) => x.propostaId === ids.pSpda);
    expect(daProposta).toHaveLength(1);
    expect(daProposta[0].natureza).toBe("execucao");
  });

  it("vincular a proposta de nome diferente traz ela para o histórico", async () => {
    const res = await r.historico.POST(req({ clienteId: ids.fazenda, propostaId: ids.pApelido }));
    expect(res.status).toBe(201);
    const d = await historicoDe(ids.fazenda);
    expect((d.linhas as { propostaId: string }[]).some((l) => l.propostaId === ids.pApelido)).toBe(true);
    expect((d.avulsas as { id: string }[]).some((a) => a.id === ids.pApelido)).toBe(false);
  });

  it("proposta já no histórico de um cliente não pode ir para outro", async () => {
    const res = await r.historico.POST(req({ clienteId: ids.outro, propostaId: ids.pApelido }));
    expect(res.status).toBe(409);
    expect((await corpoDe(res)).error).toMatch(/Fazenda Rio Doce/);
  });

  it("pedido avulso precisa dizer o que foi pedido", async () => {
    const sem = await r.historico.POST(req({ clienteId: ids.fazenda }));
    expect(sem.status).toBe(422);
    const ok = await r.historico.POST(req({
      clienteId: ids.fazenda, titulo: "Manutenção de subestação", natureza: "execucao", valor: 8000,
      solicitadoEm: "2025-10-01", resultado: "fechado", movimento: "recompra",
    }));
    expect(ok.status).toBe(201);
    const d = await historicoDe(ids.fazenda);
    expect(d.resumo).toMatchObject({ pedidos: 4, desde: "2025-10-01" });
  });

  it("limpar o valor escrito volta ao automático", async () => {
    const { getHistoricoStore } = await import("@/lib/crm/historico-store");
    const r0 = (await getHistoricoStore().list()).find((x) => x.propostaId === ids.pManual);
    const criado = r0 ?? (await corpoDe(await r.historico.POST(req({ clienteId: ids.fazenda, propostaId: ids.pManual, valor: 2900 })))).registro;
    await r.registro.PATCH(req({ valor: 2900 }, "PATCH"), ctx(criado.id));
    let l = ((await historicoDe(ids.fazenda)).linhas as { propostaId: string; valor: number }[]).find((x) => x.propostaId === ids.pManual)!;
    expect(l.valor).toBe(2900);
    await r.registro.PATCH(req({ valor: null }, "PATCH"), ctx(criado.id));
    l = ((await historicoDe(ids.fazenda)).linhas as { propostaId: string; valor: number }[]).find((x) => x.propostaId === ids.pManual)!;
    expect(l.valor).toBe(3200);
  });

  it("só quem registrou (ou um administrador) apaga", async () => {
    const criado = (await corpoDe(await r.historico.POST(req({ clienteId: ids.fazenda, titulo: "Visita técnica" })))).registro;
    usuarioAtual = BETO;
    const negado = await r.registro.DELETE(req({}, "DELETE"), ctx(criado.id));
    expect(negado.status).toBe(403);
    usuarioAtual = ANA;
    expect((await r.registro.DELETE(req({}, "DELETE"), ctx(criado.id))).status).toBe(200);
  });

  it("sem sessão, nada passa", async () => {
    usuarioAtual = null;
    expect((await r.historico.GET(new Request(`http://localhost/api/crm/historico?cliente=${ids.fazenda}`))).status).toBe(401);
    expect((await r.historico.POST(req({ clienteId: ids.fazenda, titulo: "X" }))).status).toBe(401);
    usuarioAtual = ANA;
  });
});
