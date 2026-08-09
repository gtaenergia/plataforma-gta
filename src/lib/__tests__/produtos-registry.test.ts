import { describe, expect, it } from "vitest";
import { PRODUTOS, itemAtivo, produtoDaRota, rotaSob } from "@/lib/produtos/registry";

/**
 * A rota é a única fonte da ferramenta ativa e do item aceso no menu. Os casos
 * abaixo são justamente os que dão errado quando se compara prefixo por texto:
 * `/crm` acendendo junto com `/crm/funil`, e o "Tarefas" de Operações acendendo
 * dentro do CRM.
 */

const operacoes = PRODUTOS.find((p) => p.key === "operacoes")!;
const crm = PRODUTOS.find((p) => p.key === "crm")!;
const item = (produto: typeof crm, href: string) => produto.nav.find((i) => i.href === href)!;

describe("produtoDaRota", () => {
  it("manda as rotas do CRM para o CRM", () => {
    for (const p of ["/crm", "/crm/funil", "/crm/clientes", "/crm/configuracoes"]) {
      expect(produtoDaRota(p).key).toBe("crm");
    }
  });

  it("manda o resto para Operações", () => {
    for (const p of ["/", "/propostas", "/tarefas", "/nova/solar", "/admin/cargos"]) {
      expect(produtoDaRota(p).key).toBe("operacoes");
    }
  });

  it("não confunde um prefixo de texto com um segmento de rota", () => {
    expect(produtoDaRota("/crmx").key).toBe("operacoes");
  });
});

describe("rotaSob", () => {
  it("trata a raiz como correspondência exata", () => {
    expect(rotaSob("/", "/")).toBe(true);
    expect(rotaSob("/propostas", "/")).toBe(false);
  });

  it("aceita o próprio prefixo e o que está dentro dele", () => {
    expect(rotaSob("/tarefas", "/tarefas")).toBe(true);
    expect(rotaSob("/tarefas/42", "/tarefas")).toBe(true);
    expect(rotaSob("/tarefas-antigas", "/tarefas")).toBe(false);
  });
});

describe("itemAtivo", () => {
  it("acende a casa da ferramenta só na própria rota", () => {
    const inicio = item(crm, "/crm");
    expect(itemAtivo("/crm", inicio)).toBe(true);
    expect(itemAtivo("/crm/funil", inicio)).toBe(false);
  });

  it("acende 'Nova proposta' também nos configuradores", () => {
    const nova = item(operacoes, "/");
    expect(itemAtivo("/", nova)).toBe(true);
    expect(itemAtivo("/nova/solar", nova)).toBe(true);
    expect(itemAtivo("/propostas", nova)).toBe(false);
  });

  it("mantém as duas telas de Tarefas independentes", () => {
    expect(itemAtivo("/crm/tarefas", item(operacoes, "/tarefas"))).toBe(false);
    expect(itemAtivo("/tarefas", item(crm, "/crm/tarefas"))).toBe(false);
    expect(itemAtivo("/crm/tarefas", item(crm, "/crm/tarefas"))).toBe(true);
  });

  it("acende a tela de detalhe junto com a listagem", () => {
    expect(itemAtivo("/tarefas/abc-123", item(operacoes, "/tarefas"))).toBe(true);
  });
});

describe("registro", () => {
  it("aponta cada ferramenta para uma casa que existe no próprio menu", () => {
    for (const p of PRODUTOS) {
      expect(p.nav.some((i) => i.href === p.home)).toBe(true);
    }
  });

  it("não repete rota dentro da mesma ferramenta", () => {
    for (const p of PRODUTOS) {
      const hrefs = [...p.nav.map((i) => i.href), ...(p.config ? [p.config.href] : [])];
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
