import { describe, expect, it } from "vitest";
import { TIPOS_COM_PUSH, merecePush, payloadDe, tagDe } from "@/lib/push/politica";
import type { NovaNotificacao } from "@/lib/notificacoes/types";

const n = (over: Partial<NovaNotificacao> = {}): NovaNotificacao => ({
  paraEmail: "marcela@gtaenergia.com",
  tipo: "tarefa_atribuida",
  titulo: "Nova tarefa",
  mensagem: "Projeto elétrico BT",
  link: "/tarefas/abc",
  ...over,
});

describe("merecePush", () => {
  it("libera os tipos dirigidos a uma pessoa", () => {
    for (const tipo of ["tarefa_atribuida", "orcamento_aprovado", "orcamento_rejeitado", "orcamento_reaberto", "capacidade_estourada"]) {
      expect(merecePush(tipo), tipo).toBe(true);
    }
  });

  it("NÃO envia novidade da plataforma", () => {
    // É difusão para a equipe inteira. Virar push seria vibrar o celular de
    // todo mundo de uma vez — e quem recebe isso desliga tudo, inclusive o que
    // importava.
    expect(merecePush("novidade")).toBe(false);
  });

  it("um tipo desconhecido nasce mudo", () => {
    // A lista é de PERMITIDOS de propósito: o erro de silenciar se conserta,
    // o de espalhar não.
    expect(merecePush("tipo_que_alguem_criar_amanha")).toBe(false);
    expect(merecePush("")).toBe(false);
  });

  it("não se confunde com espaço em volta", () => {
    expect(merecePush("  tarefa_atribuida  ")).toBe(true);
  });
});

describe("tagDe", () => {
  it("agrupa pelo link, para o mesmo assunto se substituir", () => {
    // Rejeitado e depois reaberto são tipos diferentes sobre o MESMO
    // orçamento; na tela do celular vale o estado atual, não a pilha.
    const rejeitado = tagDe({ tipo: "orcamento_rejeitado", link: "/aprovacoes/42" });
    const reaberto = tagDe({ tipo: "orcamento_reaberto", link: "/aprovacoes/42" });
    expect(rejeitado).toBe(reaberto);
  });

  it("cai no tipo quando não há link", () => {
    expect(tagDe({ tipo: "capacidade_estourada", link: "" })).toBe("capacidade_estourada");
  });

  it("nunca devolve vazio", () => {
    expect(tagDe({ tipo: "", link: "" })).toBe("gta");
  });
});

describe("payloadDe", () => {
  it("devolve null para o que não vibra", () => {
    expect(payloadDe(n({ tipo: "novidade" }))).toBeNull();
  });

  it("monta título, mensagem, link e tag", () => {
    expect(payloadDe(n())).toEqual({
      titulo: "Nova tarefa",
      mensagem: "Projeto elétrico BT",
      link: "/tarefas/abc",
      tag: "/tarefas/abc",
    });
  });

  it("nunca deixa o título vazio", () => {
    // Notificação sem título viraria um aviso em branco na barra do Android.
    expect(payloadDe(n({ titulo: "   " }))?.titulo).toBe("Plataforma GTA");
  });

  it("aceita mensagem e link ausentes sem quebrar", () => {
    const p = payloadDe(n({ mensagem: "", link: "" }));
    expect(p).toEqual({ titulo: "Nova tarefa", mensagem: "", link: "", tag: "tarefa_atribuida" });
  });
});

describe("lista de tipos", () => {
  it("não tem repetição", () => {
    expect(new Set(TIPOS_COM_PUSH).size).toBe(TIPOS_COM_PUSH.length);
  });

  it("todo tipo listado realmente passa", () => {
    for (const t of TIPOS_COM_PUSH) expect(merecePush(t)).toBe(true);
  });
});
