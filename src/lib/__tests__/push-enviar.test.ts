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
let erroDeConfiguracao: string | null = null;
const removidos: string[] = [];
let inscricoes: InscricaoPush[] = [];

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(() => {
      // O `web-push` de verdade LANÇA com assunto sem `mailto:` ou chave de
      // tamanho errado.
      if (erroDeConfiguracao) throw new Error(erroDeConfiguracao);
    }),
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
  erroDeConfiguracao = null;
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

describe("configuração inválida", () => {
  it("não lança — vira indisponível com motivo", async () => {
    // Sem isso a exceção sobe até a rota, vira 500, e a tela mostra
    // "não configurado" escondendo justamente a frase que diz o que houve.
    erroDeConfiguracao = "Vapid subject is not a valid URL. gtaenergiago@gmail.com";
    const { pushDisponivel, motivoPushIndisponivel } = await carregar();
    expect(() => pushDisponivel()).not.toThrow();
    expect(pushDisponivel()).toBe(false);
    expect(motivoPushIndisponivel()).toContain("not a valid URL");
  });

  it("com configuração inválida, enviar não quebra nem entrega", async () => {
    erroDeConfiguracao = "Vapid public key should be 65 bytes long";
    const { enviarPush } = await carregar();
    await expect(enviarPush(notificacao)).resolves.toBeUndefined();
    expect(enviados).toEqual([]);
  });

  it("diz QUAL variável falta, não só que falta alguma", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const { motivoPushIndisponivel } = await carregar();
    expect(motivoPushIndisponivel()).toContain("VAPID_PRIVATE_KEY");
    expect(motivoPushIndisponivel()).not.toContain("VAPID_PUBLIC_KEY");
  });

  it("absorve chave partida por quebra de linha do terminal", async () => {
    // Aconteceu de verdade: a chave foi copiada de uma saída de terminal que
    // quebrou linha no meio dos 87 caracteres, e o `web-push` recusou com
    // "must be a URL safe Base 64". Espaço em branco nunca é legítimo dentro
    // de base64 — limpar aqui não esconde erro, evita que um detalhe de
    // terminal derrube o recurso.
    process.env.VAPID_PUBLIC_KEY = "BNGTI4PuCryX7RSJ\n-wg3l9lW4Dt7Zg6Ia";
    process.env.VAPID_PRIVATE_KEY = "  chave \r\n privada  ";
    const { pushDisponivel } = await carregar();
    expect(pushDisponivel()).toBe(true);
  });

  it("continua reclamando de variável realmente vazia", async () => {
    // Só espaço em branco vira vazio — não pode passar por chave válida.
    process.env.VAPID_PUBLIC_KEY = "   \n  ";
    const { pushDisponivel, motivoPushIndisponivel } = await carregar();
    expect(pushDisponivel()).toBe(false);
    expect(motivoPushIndisponivel()).toContain("VAPID_PUBLIC_KEY");
  });

  it("motivo fica vazio quando está tudo certo", async () => {
    const { pushDisponivel, motivoPushIndisponivel } = await carregar();
    expect(pushDisponivel()).toBe(true);
    expect(motivoPushIndisponivel()).toBe("");
  });
});
