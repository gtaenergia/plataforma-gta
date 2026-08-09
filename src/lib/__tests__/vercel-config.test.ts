import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O `vercel.json` derruba o build inteiro por um campo a mais.
 *
 * A validação da Vercel é ESTRITA e roda antes de compilar: um `comment`
 * dentro de um cron devolve "should NOT have additional property" e o deploy
 * morre em dois segundos. O efeito é pior do que parece — a plataforma
 * continua no ar com a versão antiga, `git push` não reclama de nada, e a
 * única pista fica no log da Vercel. Já custou 13 commits parados sem ninguém
 * perceber.
 *
 * Este teste é a trava: roda no CI, antes do push, e falha por um campo
 * inventado. Comentário explicando um cron mora no arquivo da ROTA.
 */

const CAMPOS_DE_CRON = new Set(["path", "schedule"]);

describe("vercel.json", () => {
  const bruto = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");

  it("é JSON válido", () => {
    expect(() => JSON.parse(bruto)).not.toThrow();
  });

  const config = JSON.parse(bruto) as { crons?: Record<string, unknown>[] };

  it("não inventa campo em cron — a Vercel recusa o que não conhece", () => {
    for (const cron of config.crons ?? []) {
      const desconhecidos = Object.keys(cron).filter((k) => !CAMPOS_DE_CRON.has(k));
      expect(desconhecidos, `cron ${cron.path}: campo não suportado`).toEqual([]);
    }
  });

  it("todo cron aponta para uma rota que existe", () => {
    for (const cron of config.crons ?? []) {
      const rota = String(cron.path ?? "");
      expect(rota.startsWith("/api/"), `cron ${rota}: caminho fora de /api`).toBe(true);
      // Um cron apontando para rota inexistente não quebra o build: ele passa a
      // bater num 404 todo dia, em silêncio.
      const arquivo = path.join(process.cwd(), "src", "app", rota, "route.ts");
      expect(fs.existsSync(arquivo), `cron ${rota}: não há ${arquivo}`).toBe(true);
    }
  });

  it("todo cron tem expressão de agendamento com cinco campos", () => {
    for (const cron of config.crons ?? []) {
      const campos = String(cron.schedule ?? "").trim().split(/\s+/);
      expect(campos, `cron ${cron.path}: schedule inválido`).toHaveLength(5);
    }
  });
});
