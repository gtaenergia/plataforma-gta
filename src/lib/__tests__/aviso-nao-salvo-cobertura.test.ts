import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * Toda tela com botão de salvar avisa antes de perder a edição.
 *
 * O pedido foi "faça isso para todas as páginas semelhantes", e a primeira
 * entrega cobriu 4 de 27 — porque "semelhantes" foi decidido de cabeça, olhando
 * as telas que eu lembrava. Este teste tira a lembrança do caminho: ele mesmo
 * varre quem tem botão de salvar e cobra o aviso.
 *
 * Uma tela nova com "Salvar" nasce reprovada até ligar o aviso, que é
 * exatamente o momento em que a decisão custa uma linha em vez de um relato de
 * trabalho perdido.
 */

const IGNORAR = [
  // Só dispara o salvamento do pai; não guarda edição própria.
  "src/components/custo-equipe/CustoEquipeAdmin.tsx",
];

function telasComSalvar(): string[] {
  return globSync("src/components/**/*.tsx")
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => !IGNORAR.includes(f))
    .filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("btn-primary") && /[Ss]alvar/.test(src);
    });
}

describe("aviso de alterações não salvas", () => {
  const telas = telasComSalvar();

  it("a varredura acha as telas (não passa por vazio)", () => {
    expect(telas.length).toBeGreaterThan(20);
  });

  it.each(telasComSalvar())("%s avisa antes de perder a edição", (arquivo) => {
    const src = readFileSync(arquivo, "utf8");
    const temAviso = src.includes("useAvisoNaoSalvo") || src.includes("useEdicaoPendente");
    expect(temAviso, "tela com Salvar sem aviso de saída").toBe(true);
  });

  it.each(telasComSalvar().filter((f) => readFileSync(f, "utf8").includes("useEdicaoPendente")))(
    "%s marca a edição E limpa ao gravar",
    (arquivo) => {
      const src = readFileSync(arquivo, "utf8");
      // Marcar sem limpar deixa o aviso preso depois de salvar; limpar sem
      // marcar nunca avisa. As duas metades ou nenhuma.
      expect(src, "marca a edição mas nunca limpa").toContain("marcarSalvo");
      expect(src, "limpa mas nunca marca").toContain("marcarEditado");
    },
  );
});
