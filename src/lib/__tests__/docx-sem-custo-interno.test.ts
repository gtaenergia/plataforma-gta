import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { SERVICES } from "@/services/registry";

/**
 * O documento do cliente não pode carregar o custo interno da GTA.
 *
 * A proteção real é estrutural: cada configurador monta o `formData` do
 * `/api/gerar` enumerando campo a campo, e o custo da equipe vive fora do
 * `form`. Mas "estrutural" dura até alguém trocar a enumeração por um spread
 * — e aí o R$/h de cada pessoa sairia impresso numa proposta comercial, sem
 * erro nenhum para avisar.
 *
 * Este teste vigia os dois lados: nenhum mapeador de proposta sabe o que é
 * custo de equipe, e nenhum schema de serviço aceita esses campos.
 */

const PROIBIDOS = [
  "custoEquipe",
  "custoAdministrativo",
  "custoHora",
  "linhasDominio",
  "equipe:custos",
];

describe("o .docx não conhece o custo interno", () => {
  it("nenhum arquivo de src/services cita campo de custo de equipe", () => {
    const arquivos = globSync("src/services/**/*.ts", { exclude: (p) => p.includes("__tests__") });
    const achados: string[] = [];
    for (const f of arquivos) {
      const txt = readFileSync(f, "utf8");
      for (const termo of PROIBIDOS) {
        // `custoEquipe` é legítimo nos ENGINES de Fator K (entra na base de
        // custo). O que não pode é chegar ao mapeador da proposta.
        if (txt.includes(termo) && (f.includes("proposta") || f.includes("_cpq"))) {
          achados.push(`${f} cita "${termo}"`);
        }
      }
    }
    expect(achados).toEqual([]);
  });

  it("nenhum schema de serviço aceita custo de equipe vindo do navegador", () => {
    for (const s of SERVICES) {
      const forma = Object.keys((s.zodSchema as { shape?: Record<string, unknown> }).shape ?? {});
      for (const termo of PROIBIDOS) {
        expect(forma, `${s.key} aceita "${termo}"`).not.toContain(termo);
      }
    }
  });
});
