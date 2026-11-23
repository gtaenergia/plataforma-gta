import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NovaNotificacao } from "@/lib/notificacoes/types";
import type { Task } from "@/lib/tasks/types";

/**
 * A verificação pelas rotas de verdade, com o store JSON num diretório
 * temporário. O que se protege aqui é o que a tela não consegue garantir:
 * quem verifica, quem devolve, o que fica registrado e quem é avisado.
 */

type Pessoa = { email: string; name: string; podeVerificar: boolean };
const RESP: Pessoa = { email: "ana@gta.com", name: "Ana Projetos", podeVerificar: false };
const CRIADOR: Pessoa = { email: "bruno@gta.com", name: "Bruno Comercial", podeVerificar: false };
const CHEFE: Pessoa = { email: "chefe@gta.com", name: "Carla Gestão", podeVerificar: true };

const h = vi.hoisted(() => ({
  usuario: null as unknown as { email: string; name: string; podeVerificar: boolean },
  avisos: [] as NovaNotificacao[],
  pendentes: [] as Promise<unknown>[],
}));

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => h.usuario,
  requirePageUser: async () => h.usuario,
}));
// `after()` só existe dentro de uma requisição real. Aqui ele roda já, e o
// teste espera os avisos terminarem antes de conferi-los.
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => { h.pendentes.push(Promise.resolve().then(fn)); } };
});
vi.mock("@/lib/rbac/resolve", () => ({
  temPermissao: async (u: { podeVerificar?: boolean }, chave: string) => chave === "tarefas.verificar" && !!u.podeVerificar,
  permissoesDoUsuario: async () => new Set(),
}));
vi.mock("@/lib/notificacoes/store", () => ({
  notificar: async (n: NovaNotificacao) => { h.avisos.push(n); },
}));
// O CADASTRO é fingido, e não a função que escolhe quem avisar: assim a
// seleção de verdade (admin ativo, cargo com a chave, menos quem agiu) roda
// aqui dentro, em vez de o teste conferir o próprio dublê.
vi.mock("@/lib/users/store", () => ({
  users: async () => ({
    list: async () => [
      { email: "ana@gta.com", role: "member", active: true },
      { email: "bruno@gta.com", role: "member", active: true, cargoId: "campo" },
      { email: "chefe@gta.com", role: "member", active: true, cargoId: "gestao" },
      { email: "admin@gta.com", role: "admin", active: true },
      { email: "ex-admin@gta.com", role: "admin", active: false },
    ],
  }),
}));
vi.mock("@/lib/cargos/store", () => ({
  cargos: async () => ({
    list: async () => [
      { id: "gestao", permissoes: ["tarefas.verificar"] },
      { id: "campo", permissoes: ["servicos.editar"] },
    ],
  }),
}));
// A criação avisa o responsável e mede a capacidade; nada disso é o objeto aqui.
vi.mock("@/lib/email/notifyTask", () => ({ notifyTaskAssigned: async () => undefined }));
vi.mock("@/lib/capacidade/aviso-estouro", () => ({ avisarSeEstourou: async () => undefined }));

type Rotas = {
  lista: typeof import("@/app/api/tarefas/route");
  tarefa: typeof import("@/app/api/tarefas/[id]/route");
  devolver: typeof import("@/app/api/tarefas/[id]/devolver/route");
  store: typeof import("@/lib/tasks/store");
};
let r: Rotas;
let cwdOriginal: string;
let tmp: string;

const como = (p: Pessoa) => { h.usuario = p; };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const corpo = async (res: Response) => (await res.json()) as { task: Task; error?: string };

async function patch(id: string, dados: unknown) {
  const res = await r.tarefa.PATCH(
    new Request(`http://localhost/api/tarefas/${id}`, { method: "PATCH", body: JSON.stringify(dados) }),
    ctx(id),
  );
  await Promise.all(h.pendentes.splice(0));
  return res;
}
async function devolver(id: string, dados: unknown) {
  const res = await r.devolver.POST(
    new Request(`http://localhost/api/tarefas/${id}/devolver`, {
      method: "POST",
      body: dados === undefined ? undefined : JSON.stringify(dados),
    }),
    ctx(id),
  );
  await Promise.all(h.pendentes.splice(0));
  return res;
}
const gravada = async (id: string) => (await r.store.getTaskStore().get(id))!;

async function novaTarefa(status: Task["status"] = "andamento", responsavel = RESP.email): Promise<string> {
  const t = await r.store.getTaskStore().create({
    titulo: "Memorial descritivo — Galpão Rio Verde",
    descricao: "",
    cliente: "Agro Rio Verde",
    categoria: "Projetos",
    tipoDemanda: "",
    demandante: "operacional",
    responsavel,
    status,
    prioridade: "media",
    prazo: "",
    prazoComercial: "",
    prazoOperacional: "",
    horaComercial: "",
    horaOperacional: "",
    estimativaMin: 0,
    negociacaoId: "",
    serviceKey: "",
    criadoPor: CRIADOR.email,
  });
  return t.id;
}

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tarefas-verificacao-"));
  process.chdir(tmp);
  // O store é um singleton em globalThis; um resto de outro teste apontaria
  // para outro diretório.
  delete (globalThis as { __gtaTaskStore?: unknown }).__gtaTaskStore;
  r = {
    lista: await import("@/app/api/tarefas/route"),
    tarefa: await import("@/app/api/tarefas/[id]/route"),
    devolver: await import("@/app/api/tarefas/[id]/devolver/route"),
    store: await import("@/lib/tasks/store"),
  };
}, 30_000);

afterAll(() => {
  process.chdir(cwdOriginal);
  delete (globalThis as { __gtaTaskStore?: unknown }).__gtaTaskStore;
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  h.avisos.length = 0;
});

describe("entregar (“Concluída”)", () => {
  it("o responsável entrega: carimbo gravado e quem verifica é avisado", async () => {
    const id = await novaTarefa();
    como(RESP);
    const res = await patch(id, { status: "entregue" });
    expect(res.status).toBe(200);
    const t = (await corpo(res)).task;
    expect(t.status).toBe("entregue");
    expect(t.entreguePor).toBe(RESP.email);
    expect(t.entregueEm).not.toBe("");
    expect(t.verificadaPor).toBe("");

    expect(h.avisos.map((a) => [a.paraEmail, a.tipo])).toEqual([
      ["chefe@gta.com", "tarefa_aguardando_verificacao"],
      ["admin@gta.com", "tarefa_aguardando_verificacao"],
    ]);
    expect(h.avisos[0].link).toBe(`/tarefas/${id}`);
    expect(h.avisos[0].mensagem).toContain(RESP.name);
  });

  it("quem entrega não é avisado da própria entrega", async () => {
    const id = await novaTarefa();
    como(CHEFE);
    await patch(id, { status: "entregue" });
    expect(h.avisos.map((a) => a.paraEmail)).toEqual(["admin@gta.com"]);
  });

  it("salvar uma tarefa já entregue não recarimba nem avisa de novo", async () => {
    const id = await novaTarefa();
    como(RESP);
    const primeira = (await corpo(await patch(id, { status: "entregue" }))).task;
    h.avisos.length = 0;
    const segunda = (await corpo(await patch(id, { status: "entregue", titulo: "Memorial revisado" }))).task;
    expect(segunda.entregueEm).toBe(primeira.entregueEm);
    expect(h.avisos).toEqual([]);
  });
});

describe("verificar (“Concluída (verificada)”)", () => {
  it("sem a permissão, nem o responsável nem quem demandou verificam", async () => {
    const id = await novaTarefa("entregue");
    for (const p of [RESP, CRIADOR]) {
      como(p);
      const res = await patch(id, { status: "concluida" });
      expect(res.status, p.email).toBe(403);
      expect((await corpo(res)).error).toMatch(/administradores/);
    }
    expect((await gravada(id)).status).toBe("entregue");
  });

  it("com a permissão, verifica: carimbo gravado e a entrega continua registrada", async () => {
    const id = await novaTarefa();
    como(RESP);
    await patch(id, { status: "entregue" });
    h.avisos.length = 0; // os da entrega; o que se confere aqui é a verificação
    como(CHEFE);
    const res = await patch(id, { status: "concluida" });
    expect(res.status).toBe(200);
    const t = (await corpo(res)).task;
    expect(t.status).toBe("concluida");
    expect(t.verificadaPor).toBe(CHEFE.email);
    expect(t.verificadaEm).not.toBe("");
    expect(t.entreguePor).toBe(RESP.email);
    // Verificar não avisa ninguém: o responsável vê a tarefa sair da lista.
    expect(h.avisos).toEqual([]);
  });

  it("editar o título de uma tarefa verificada preserva os carimbos e o status", async () => {
    const id = await novaTarefa();
    como(RESP);
    await patch(id, { status: "entregue" });
    como(CHEFE);
    await patch(id, { status: "concluida" });
    como(CRIADOR);
    const res = await patch(id, { titulo: "Memorial — versão final" });
    expect(res.status).toBe(200);
    const t = await gravada(id);
    expect(t.status).toBe("concluida");
    expect(t.verificadaPor).toBe(CHEFE.email);
  });

  it("carimbo mandado no corpo é ignorado", async () => {
    const id = await novaTarefa("entregue");
    como(CRIADOR);
    await patch(id, { titulo: "x", verificadaPor: "eu@gta.com", verificadaEm: "2026-01-01" });
    const t = await gravada(id);
    expect(t.verificadaPor).toBe("");
    expect(t.verificadaEm).toBe("");
  });
});

describe("tela desatualizada", () => {
  it("verificar uma tarefa que outro verificador já devolveu é recusado, e a tarefa atual volta", async () => {
    const id = await novaTarefa();
    como(RESP);
    await patch(id, { status: "entregue" });
    // Dois verificadores abriram a página; o primeiro devolve.
    como(CHEFE);
    expect((await devolver(id, { motivo: "Falta a ART assinada." })).status).toBe(200);
    // O segundo, com a tela de antes, clica em verificar.
    const res = await patch(id, { status: "concluida", statusEsperado: "entregue" });
    expect(res.status).toBe(409);
    const r409 = await corpo(res);
    expect(r409.error).toMatch(/Em Andamento/);
    expect(r409.task.status).toBe("andamento");
    expect((await gravada(id)).status).toBe("andamento");
  });

  it("com o status esperado certo, segue normal", async () => {
    const id = await novaTarefa("entregue");
    como(CHEFE);
    expect((await patch(id, { status: "concluida", statusEsperado: "entregue" })).status).toBe(200);
  });

  it("devolver o que já não está entregue devolve a tarefa atual junto do 409", async () => {
    const id = await novaTarefa("andamento");
    como(CHEFE);
    const res = await devolver(id, { motivo: "Motivo qualquer" });
    expect(res.status).toBe(409);
    expect((await corpo(res)).task.status).toBe("andamento");
  });
});

describe("devolver ao responsável", () => {
  it("pelo seletor de status, não: a devolução passa pela rota que avisa o responsável", async () => {
    const id = await novaTarefa("entregue");
    como(CHEFE);
    expect((await patch(id, { status: "andamento" })).status).toBe(403);
    como(CRIADOR);
    expect((await patch(id, { status: "andamento" })).status).toBe(403);
    expect((await gravada(id)).status).toBe("entregue");
  });

  it("o responsável reabre a própria entrega, sem aviso e sem carimbo", async () => {
    const id = await novaTarefa();
    como(RESP);
    await patch(id, { status: "entregue" });
    h.avisos.length = 0;
    const res = await patch(id, { status: "andamento" });
    expect(res.status).toBe(200);
    const t = (await corpo(res)).task;
    expect(t.entreguePor).toBe("");
    expect(t.entregueEm).toBe("");
    expect(h.avisos).toEqual([]);
  });

  it("quem verifica devolve com motivo: comentário, status, carimbos e aviso", async () => {
    const id = await novaTarefa();
    como(RESP);
    await patch(id, { status: "entregue" });
    h.avisos.length = 0;

    como(CHEFE);
    const res = await devolver(id, { motivo: "  Falta o memorial de cálculo da malha de terra.  " });
    expect(res.status).toBe(200);
    const t = (await corpo(res)).task;
    expect(t.status).toBe("andamento");
    expect(t.entreguePor).toBe("");
    expect(t.verificadaPor).toBe("");
    const ultimo = t.comentarios[t.comentarios.length - 1];
    expect(ultimo.autor).toBe(CHEFE.name);
    expect(ultimo.texto).toBe("Devolvida para ajuste: Falta o memorial de cálculo da malha de terra.");

    expect(h.avisos).toHaveLength(1);
    expect(h.avisos[0]).toMatchObject({ paraEmail: RESP.email, tipo: "tarefa_devolvida", link: `/tarefas/${id}` });
    expect(h.avisos[0].mensagem).toContain("Falta o memorial de cálculo");
  });

  it("quem verifica e devolve a própria tarefa não avisa a si mesmo", async () => {
    const id = await novaTarefa("andamento", CHEFE.email);
    como(CHEFE);
    await patch(id, { status: "entregue" });
    h.avisos.length = 0;
    expect((await devolver(id, { motivo: "Revisar o quantitativo." })).status).toBe(200);
    expect(h.avisos).toEqual([]);
  });

  it("motivo acima do limite é recusado em português", async () => {
    const id = await novaTarefa("entregue");
    como(CHEFE);
    const res = await devolver(id, { motivo: "x".repeat(2001) });
    expect(res.status).toBe(422);
    expect((await corpo(res)).error).toBe("O motivo pode ter até 2000 caracteres.");
  });

  it("sem motivo, devolve do mesmo jeito: registro nos comentários e aviso", async () => {
    // O motivo é opcional (decisão do dono), mas a devolução nunca é muda:
    // o histórico mostra quem devolveu e quando, e o responsável é avisado.
    for (const corpoDaDevolucao of [{ motivo: "" }, { motivo: "   " }, {}, undefined]) {
      const id = await novaTarefa("entregue");
      como(CHEFE);
      h.avisos.length = 0;
      const res = await devolver(id, corpoDaDevolucao);
      const rotulo = JSON.stringify(corpoDaDevolucao) ?? "sem corpo";
      expect(res.status, rotulo).toBe(200);
      const t = (await corpo(res)).task;
      expect(t.status, rotulo).toBe("andamento");
      expect(t.comentarios.map((c) => c.texto), rotulo).toEqual(["Devolvida para ajuste."]);
      expect(h.avisos.map((a) => [a.paraEmail, a.tipo, a.mensagem]), rotulo).toEqual([
        [RESP.email, "tarefa_devolvida", `${CHEFE.name} devolveu a tarefa para ajuste.`],
      ]);
    }
  });

  it("sem a permissão, não devolve", async () => {
    const id = await novaTarefa("entregue");
    como(CRIADOR);
    expect((await devolver(id, { motivo: "Quero refazer" })).status).toBe(403);
    expect((await gravada(id)).status).toBe("entregue");
  });

  it("só tarefa entregue pode ser devolvida", async () => {
    como(CHEFE);
    for (const status of ["andamento", "concluida"] as const) {
      const id = await novaTarefa(status);
      expect((await devolver(id, { motivo: "Motivo qualquer" })).status, status).toBe(409);
    }
  });
});

describe("criar", () => {
  it("uma tarefa nasce em aberto", async () => {
    como(CRIADOR);
    for (const status of ["entregue", "concluida"]) {
      const res = await r.lista.POST(
        new Request("http://localhost/api/tarefas", {
          method: "POST",
          body: JSON.stringify({ titulo: "Atalho", responsavel: RESP.email, status }),
        }),
      );
      expect(res.status, status).toBe(422);
    }
  });

  it("criada em aberto, nasce sem carimbos", async () => {
    como(CRIADOR);
    const res = await r.lista.POST(
      new Request("http://localhost/api/tarefas", {
        method: "POST",
        body: JSON.stringify({ titulo: "Levantamento de cargas", responsavel: RESP.email }),
      }),
    );
    await Promise.all(h.pendentes.splice(0));
    expect(res.status).toBe(201);
    const t = (await corpo(res)).task;
    expect(t).toMatchObject({ status: "afazer", entregueEm: "", entreguePor: "", verificadaEm: "", verificadaPor: "" });
  });
});
