import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * A corrente inteira, ponta a ponta, pelas rotas de verdade:
 *
 * ```
 * Negociação ──pedido──> Tarefa (Operações) ──> Proposta ──> valor de volta
 * ```
 *
 * É o percurso que atravessa as DUAS ferramentas e duas pessoas diferentes —
 * exatamente onde um elo perdido não daria erro nenhum: a proposta sairia, o
 * técnico acharia que entregou, e o comercial ficaria esperando um retorno que
 * nunca vem. Só um teste que anda o caminho todo pega isso.
 */

const ANA = { email: "ana@gta.com", name: "Ana Comercial" };
const BRUNO = { email: "bruno@gta.com", name: "Bruno Engenharia" };
let usuarioAtual = ANA;

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => usuarioAtual,
  getSessionUser: async () => usuarioAtual,
  requirePageUser: async () => usuarioAtual,
}));
/*
 * `after()` do Next adia o trabalho para depois da resposta e só existe dentro
 * de uma requisição real. Aqui ele roda na hora — o que, de quebra, faz o teste
 * VERIFICAR os avisos em vez de ignorá-los.
 */
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => { void fn(); } };
});
// `requireApi` (usado pela esteira) fala com a mesma sessão fingida.
vi.mock("@/lib/rbac/guards", () => ({
  requireApi: async () => ({ me: usuarioAtual }),
  requirePermissaoApi: async () => ({ me: usuarioAtual }),
}));
// Permissão não é o objeto deste teste; a esteira tem os seus.
vi.mock("@/lib/rbac/resolve", () => ({
  temPermissao: async () => true,
  permissoesDoUsuario: async () => new Set(),
}));

type Rotas = {
  funis: typeof import("@/app/api/crm/funis/route");
  negociacoes: typeof import("@/app/api/crm/negociacoes/route");
  negociacaoId: typeof import("@/app/api/crm/negociacoes/[id]/route");
  pedir: typeof import("@/app/api/crm/negociacoes/[id]/pedir-proposta/route");
  montar: typeof import("@/app/api/crm/montar-proposta/route");
  propostaId: typeof import("@/app/api/propostas/[id]/route");
};
let r: Rotas;
let cwdOriginal: string;
let tmp: string;

const req = (corpo: unknown, metodo = "POST") =>
  new Request("http://localhost/api", { method: metodo, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const corpoDe = async (res: Response) => res.json() as Promise<Record<string, never>>;

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crm-ponte-"));
  process.chdir(tmp);
  r = {
    funis: await import("@/app/api/crm/funis/route"),
    negociacoes: await import("@/app/api/crm/negociacoes/route"),
    negociacaoId: await import("@/app/api/crm/negociacoes/[id]/route"),
    pedir: await import("@/app/api/crm/negociacoes/[id]/pedir-proposta/route"),
    montar: await import("@/app/api/crm/montar-proposta/route"),
    propostaId: await import("@/app/api/propostas/[id]/route"),
  };
});

afterAll(() => {
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("ponte CRM ↔ Operações", () => {
  const ids = { funil: "", etapa: "", negociacao: "", tarefa: "", proposta: "" };

  it("Ana abre a negociação com uma estimativa", async () => {
    const f = (await corpoDe(await r.funis.GET())).funis as unknown as { id: string; etapas: { id: string }[] }[];
    ids.funil = f[0].id;
    ids.etapa = f[0].etapas[0].id;

    const res = await r.negociacoes.POST(req({
      nome: "Subestação — Fazenda Rio Doce",
      funilId: ids.funil,
      etapaId: ids.etapa,
      valor: 50000,
      empresaNome: "Fazenda Rio Doce",
      previsao: "2026-09-10",
    }));
    expect(res.status).toBe(201);
    const n = (await corpoDe(res)).negociacao as unknown as { id: string; responsavel: string };
    ids.negociacao = n.id;
    expect(n.responsavel).toBe(ANA.email);
  });

  it("Ana pede a proposta — a tarefa nasce em Operações, com o comercial como demandante", async () => {
    const res = await r.pedir.POST(
      req({ serviceKey: "projeto-subestacao", tipoDemanda: "Subestação", responsavel: BRUNO.email, prazo: "2026-08-20", estimativaMin: 240 }),
      ctx(ids.negociacao),
    );
    expect(res.status).toBe(201);
    const d = await corpoDe(res);
    const tarefa = d.tarefa as unknown as {
      id: string; categoria: string; demandante: string; responsavel: string;
      negociacaoId: string; serviceKey: string; cliente: string; descricao: string;
    };
    ids.tarefa = tarefa.id;

    expect(tarefa.categoria).toBe("Orçamentos");
    expect(tarefa.demandante).toBe("comercial");
    expect(tarefa.responsavel).toBe(BRUNO.email);
    expect(tarefa.negociacaoId).toBe(ids.negociacao);
    expect(tarefa.serviceKey).toBe("projeto-subestacao");
    expect(tarefa.cliente).toBe("Fazenda Rio Doce");
    // O que Bruno precisa saber viaja junto: ele não abre o CRM.
    expect(tarefa.descricao).toContain("R$ 50.000,00");
    expect(tarefa.descricao).toContain("10/09/2026");
    expect(tarefa.descricao).toContain(ANA.name);

    // E o pedido fica no histórico da negociação.
    const n = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.negociacao)))).negociacao as unknown as { anotacoes: { texto: string }[] };
    expect(n.anotacoes.at(-1)!.texto).toContain("Proposta pedida a bruno@gta.com");
  });

  it("negociação fechada não aceita pedido de proposta", async () => {
    const outra = (await corpoDe(await r.negociacoes.POST(req({ nome: "X", funilId: ids.funil, etapaId: ids.etapa })))).negociacao as unknown as { id: string };
    const transicao = await import("@/app/api/crm/negociacoes/[id]/transicao/route");
    await transicao.POST(req({ acao: "ganhar" }), ctx(outra.id));
    const res = await r.pedir.POST(req({ responsavel: BRUNO.email }), ctx(outra.id));
    expect(res.status).toBe(409);
  });

  it("Bruno abre a tarefa e monta a proposta — ela já nasce vinculada", async () => {
    usuarioAtual = BRUNO;
    const res = await r.montar.POST(req({ tarefaId: ids.tarefa }));
    expect(res.status).toBe(201);
    const destino = (await corpoDe(res)).destino as unknown as string;
    expect(destino).toMatch(/^\/nova\/projeto-subestacao\?proposta=/);
    ids.proposta = destino.split("proposta=")[1];

    const p = (await corpoDe(await r.propostaId.GET(req({}), ctx(ids.proposta)))).proposta as unknown as { dados: { negociacaoId: string } };
    expect(p.dados.negociacaoId).toBe(ids.negociacao);
  });

  it("o vínculo SOBREVIVE ao configurador gravar `dados` inteiro", async () => {
    // É exatamente o que os 13 configuradores fazem a cada "Salvar proposta":
    // mandam o objeto do próprio formulário, que não conhece o CRM.
    const res = await r.propostaId.PATCH(
      req({ cliente: "Fazenda Rio Doce", dados: { clienteNome: "Fazenda Rio Doce", potencia: 500, cond: {} } }, "PATCH"),
      ctx(ids.proposta),
    );
    const p = (await corpoDe(res)).proposta as unknown as { dados: Record<string, unknown> };
    expect(p.dados.negociacaoId).toBe(ids.negociacao);
    expect(p.dados.potencia).toBe(500);
  });

  it("a proposta gerada devolve o valor a Ana, com a estimativa à vista", async () => {
    const { devolverAoComercial } = await import("@/lib/crm/retorno");
    await devolverAoComercial({
      negociacaoId: ids.negociacao,
      referencia: "GTA-2026-RIODOCE-SUB-001",
      valor: 63500,
      momento: "gerada",
      autor: BRUNO.email,
      autorNome: BRUNO.name,
    });

    const n = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.negociacao)))).negociacao as unknown as {
      valor: number; anotacoes: { texto: string }[];
    };
    expect(n.valor).toBe(63500);
    expect(n.anotacoes.at(-1)!.texto).toContain("estimado R$ 50.000,00 → proposta R$ 63.500,00");
  });

  it("e a aprovação manda o segundo aviso, sem repetir a anotação de valor", async () => {
    const { devolverAoComercial } = await import("@/lib/crm/retorno");
    const antes = ((await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.negociacao)))).negociacao as unknown as { anotacoes: unknown[] }).anotacoes.length;

    await devolverAoComercial({
      negociacaoId: ids.negociacao,
      referencia: "GTA-2026-RIODOCE-SUB-001",
      valor: 63500, // o mesmo: nada mudou
      momento: "aprovada",
      autor: BRUNO.email,
      autorNome: BRUNO.name,
    });

    const n = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.negociacao)))).negociacao as unknown as {
      valor: number; anotacoes: { texto: string }[];
    };
    expect(n.valor).toBe(63500);
    expect(n.anotacoes).toHaveLength(antes + 1);
    expect(n.anotacoes.at(-1)!.texto).toContain("aprovada");
  });

  it("Ana é avisada — e Bruno, que gerou, não recebe eco do próprio clique", async () => {
    const { getNotificacaoStore } = await import("@/lib/notificacoes/store");
    const paraAna = await getNotificacaoStore().listPara(ANA.email, 50);
    expect(paraAna.length).toBeGreaterThanOrEqual(2);
    expect(paraAna.some((x) => x.tipo === "crm_proposta_gerada")).toBe(true);
    expect(paraAna.some((x) => x.tipo === "crm_proposta_aprovada")).toBe(true);
    expect(paraAna.every((x) => x.link.includes(ids.negociacao))).toBe(true);

    const paraBruno = await getNotificacaoStore().listPara(BRUNO.email, 50);
    // Bruno recebeu o PEDIDO (de Ana), mas nenhum retorno de si mesmo.
    expect(paraBruno.some((x) => x.tipo === "crm_pedido_proposta")).toBe(true);
    expect(paraBruno.some((x) => x.tipo.startsWith("crm_proposta_"))).toBe(false);
  });

  it("negociação com produtos NÃO tem o valor sobrescrito — a soma deles é a verdade", async () => {
    const comProdutos = (await corpoDe(await r.negociacoes.POST(req({
      nome: "Com produtos", funilId: ids.funil, etapaId: ids.etapa, valor: 100,
      produtos: [{ produtoId: "p1", nome: "Item", preco: 900, quantidade: 1, desconto: 0, tipoDesconto: "valor", recorrencia: "unico" }],
    })))).negociacao as unknown as { id: string };

    const { devolverAoComercial } = await import("@/lib/crm/retorno");
    await devolverAoComercial({
      negociacaoId: comProdutos.id, referencia: "GTA-Y", valor: 5000,
      momento: "gerada", autor: ANA.email, autorNome: ANA.name,
    });

    const n = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(comProdutos.id)))).negociacao as unknown as {
      valor: number; anotacoes: { texto: string }[];
    };
    expect(n.valor).toBe(100); // o campo livre fica como estava
    // Mas o histórico registra o que a proposta trouxe.
    expect(n.anotacoes.at(-1)!.texto).toContain("R$ 5.000,00");
  });

  it("tarefa de Operações comum não vira pedido do CRM", async () => {
    usuarioAtual = ANA;
    // Pelo store, e não pela rota: `/api/tarefas` usa o `after()` do Next, que
    // exige escopo de requisição real. O que importa aqui é o dado.
    const { getTaskStore } = await import("@/lib/tasks/store");
    const t = await getTaskStore().create({
      titulo: "Tarefa interna", descricao: "", cliente: "", categoria: "Projetos", tipoDemanda: "",
      demandante: "operacional", responsavel: ANA.email, status: "afazer", prioridade: "media",
      prazo: "", prazoComercial: "", prazoOperacional: "", horaComercial: "", horaOperacional: "",
      estimativaMin: 0, negociacaoId: "", serviceKey: "", criadoPor: ANA.email,
    });
    expect(t.negociacaoId).toBe("");
    expect(t.serviceKey).toBe("");

    // E "montar proposta" recusa uma tarefa sem negociação.
    const m = await r.montar.POST(req({ tarefaId: t.id }));
    expect(m.status).toBe(409);
  });
});
