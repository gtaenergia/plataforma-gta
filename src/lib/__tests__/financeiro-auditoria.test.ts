import { readFileSync, globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditar, type AuditoriaStore, type RegistroAuditoria } from "@/lib/financeiro/auditoria";

/**
 * A auditoria só cresce: a interface não tem como alterar nem apagar, e
 * nenhuma rota do Financeiro muda dinheiro sem gravar o rastro ANTES.
 */

function memoria(): AuditoriaStore & { todos: RegistroAuditoria[] } {
  const todos: RegistroAuditoria[] = [];
  return {
    todos,
    async inserir(r) {
      todos.push(r);
    },
    async listar(n) {
      return [...todos].reverse().slice(0, n);
    },
  };
}

describe("auditoria", () => {
  it("grava quem, de onde e o antes/depois", async () => {
    const s = memoria();
    const req = new Request("https://x/api", { headers: { "x-forwarded-for": "200.1.2.3, 10.0.0.1", "user-agent": "Teste" } });
    await auditar({ email: "tito@gta.com", name: "Tito" }, req, { acao: "lanc.excluir", alvo: "s05", resumo: "Contabilidade", antes: { valor: 2800 }, depois: undefined }, s);
    expect(s.todos[0]).toMatchObject({ email: "tito@gta.com", nome: "Tito", acao: "lanc.excluir", alvo: "s05", ip: "200.1.2.3", agente: "Teste", antes: { valor: 2800 } });
    expect(s.todos[0].id).toBeTruthy();
    expect(s.todos[0].quando).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("falha de gravação SOBE (quem chama não faz a mudança)", async () => {
    const quebrado: AuditoriaStore = {
      inserir: async () => {
        throw new Error("banco fora");
      },
      listar: async () => [],
    };
    await expect(auditar({ email: "a@b", name: "A" }, null, { acao: "lanc.criar", alvo: "1", resumo: "", antes: undefined, depois: {} }, quebrado)).rejects.toThrow();
  });

  it("a camada de dados não oferece como apagar nem alterar registro", () => {
    const src = readFileSync("src/lib/financeiro/auditoria.ts", "utf8");
    const iface = src.slice(src.indexOf("export interface AuditoriaStore"), src.indexOf("}", src.indexOf("export interface AuditoriaStore")));
    expect(iface).not.toMatch(/remove|delete|apagar|atualizar|update/i);
    // E o gatilho do Postgres recusa UPDATE, DELETE e TRUNCATE.
    expect(src).toMatch(/BEFORE UPDATE OR DELETE OR TRUNCATE ON fin_auditoria/);
  });

  it("toda rota do Financeiro que muda dados audita antes de gravar", () => {
    const rotas = globSync("src/app/api/financeiro/**/route.ts").map((f) => f.replace(/\\/g, "/"));
    const mutam = rotas.filter((f) => /export async function (POST|PUT|PATCH|DELETE)/.test(readFileSync(f, "utf8")) && !f.includes("/cadeado/"));
    expect(mutam.length).toBeGreaterThanOrEqual(6);
    for (const f of mutam) {
      const src = readFileSync(f, "utf8");
      const primeiraAuditoria = src.indexOf("await auditar(");
      const primeiraGravacao = src.search(/\.(put|putMany|remove)\(/);
      expect(primeiraAuditoria, `${f} não audita`).toBeGreaterThan(-1);
      expect(primeiraAuditoria, `${f} grava antes de auditar`).toBeLessThan(primeiraGravacao);
    }
  });

  it("toda rota do Financeiro passa pela guarda (sessão, marca, cadeado e origem)", () => {
    for (const f of globSync("src/app/api/financeiro/**/route.ts")) {
      const src = readFileSync(f, "utf8");
      const handlers = src.match(/export async function (GET|POST|PUT|PATCH|DELETE)/g) ?? [];
      const guardas = src.match(/requireApiFinanceiro\(req/g) ?? [];
      expect(guardas.length, f).toBe(handlers.length);
    }
  });
});
