import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InscricaoPush } from "@/lib/push/types";

/**
 * Comportamento do envio, com dublês no lugar do serviço de push.
 *
 * O que mais importa aqui é a limpeza de inscrição morta. Ela é invisível: sem
 * ela nada QUEBRA — a tabela só vai inchando com aparelhos que não existem
 * mais, e cada notificação passa a gastar uma ida à rede por fantasma. É o
 * tipo de defeito que ninguém percebe até ficar caro.
 */

const enviados: { endpoint: string; corpo: string }[] = [];
let proximoErro: { statusCode: number } | null = null;
const removidos: string[] = [];
let inscricoes: InscricaoPush[] = [];

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, corpo: string) => {
      if (proximoErro) throw proximoErro;
      enviados.push({ endpoint: sub.endpoint, corpo });
    }),
  },
}));

vi.mock("@/lib/push/store", () => ({
  getPushStore: () => ({
    listPara: async () => inscricoes,
    salvar: async () => undefined,
    remover: async (endpoint: string) => {
      removidos.push(endpoint);
      return true;
    },
    contarPara: async () => inscricoes.length,
  }),
}));

const inscricao = (endpoint: string): InscricaoPush => ({
  endpoint,
  p256dh: "chave-do-aparelho",
  auth: "segredo",
  email: "marcela@gtaenergia.com",
  aparelho: "Chrome no Android",
  criadoEm: new Date().toISOString(),
});

const notificacao = {
  paraEmail: "marcela@gtaenergia.com",
  tipo: "tarefa_atribuida",
  titulo: "Nova tarefa",
  mensagem: "Projeto elétrico BT",
  link: "/tarefas/abc",
};

/** `enviar.ts` guarda a configuração em módulo — recarrega a cada teste. */
async function carregar() {
  vi.resetModules();
  return import("@/lib/push/enviar");
}

beforeEach(() => {
  enviados.length = 0;
  removidos.length = 0;
  proximoErro = null;
  inscricoes = [inscricao("https://fcm.googleapis.com/aparelho-1")];
  process.env.VAPID_PUBLIC_KEY = "publica-de-teste";
  process.env.VAPID_PRIVATE_KEY = "privada-de-teste";
});

afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe("enviarPush", () => {
  it("entrega para todos os aparelhos da pessoa", async () => {
    inscricoes = [inscricao("https://fcm.googleapis.com/celular"), inscricao("https://fcm.googleapis.com/notebook")];
    const { enviarPush } = await carregar();
    await enviarPush(notificacao);
    expect(enviados.map((e) => e.endpoint)).toEqual([
      "https://fcm.googleapis.com/celular",
      "https://fcm.googleapis.com/notebook",
    ]);
    expect(JSON.parse(enviados[0].corpo)).toEqual({
      titulo: "Nova tarefa",
      mensagem: "Projeto elétrico BT",
      link: "/tarefas/abc",
      tag: "/tarefas/abc",
    });
  });

  it("não envia o que a política silencia", async () => {
    const { enviarPush } = await carregar();
    await enviarPush({ ...notificacao, tipo: "novidade" });
    expect(enviados).toEqual([]);
  });

  it("apaga a inscrição quando o serviço responde 410", async () => {
    proximoErro = { statusCode: 410 };
    const { enviarPush } = await carregar();
    await enviarPush(notificacao);
    expect(removidos).toEqual(["https://fcm.googleapis.com/aparelho-1"]);
  });

  it("apaga também no 404", async () => {
    proximoErro = { statusCode: 404 };
    const { enviarPush } = await carregar();
    await enviarPush(notificacao);
    expect(removidos).toEqual(["https://fcm.googleapis.com/aparelho-1"]);
  });

  it("NÃO apaga em falha passageira", async () => {
    // 500 é problema do serviço, não aparelho morto. Apagar aqui desinscreveria
    // gente de verdade por causa de uma instabilidade de dez segundos.
    proximoErro = { statusCode: 500 };
    const { enviarPush } = await carregar();
    await enviarPush(notificacao);
    expect(removidos).toEqual([]);
  });

  it("não lança quando o envio falha", async () => {
    proximoErro = { statusCode: 500 };
    const { enviarPush } = await carregar();
    // Push é efeito colateral: derrubar o fluxo que o originou seria pior que
    // não notificar.
    await expect(enviarPush(notificacao)).resolves.toBeUndefined();
  });

  it("fica quieto sem as chaves VAPID configuradas", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const { enviarPush, pushDisponivel } = await carregar();
    expect(pushDisponivel()).toBe(false);
    await enviarPush(notificacao);
    expect(enviados).toEqual([]);
  });

  it("não vai à rede quando a pessoa não tem aparelho inscrito", async () => {
    inscricoes = [];
    const { enviarPush } = await carregar();
    await enviarPush(notificacao);
    expect(enviados).toEqual([]);
  });
});
