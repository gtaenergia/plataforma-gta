import { describe, expect, it } from "vitest";
import {
  STATUS_TAREFA,
  createTaskSchema,
  estaVerificada,
  ordemDeConclusao,
  rotuloCurto,
  statusLabel,
  trabalhoEntregue,
  updateTaskSchema,
} from "@/lib/tasks/types";

/**
 * As etapas de status das Tarefas de Operações.
 *
 * A conclusão tem duas: "Concluída" (`entregue`), que deixa a tarefa nas
 * ativas aguardando verificação, e "Concluída (verificada)" (`concluida`), que
 * faz o que a antiga Concluída fazia. O valor gravado do final não mudou de
 * nome — é o que dispensou migrar os dados.
 */

const base = { titulo: "Projeto elétrico BT", responsavel: "ana@gta.com" };

describe("a lista de status", () => {
  it("toda opção que a tela oferece é aceita pela API", () => {
    // Eram duas listas à mão; esquecer uma fazia a tela oferecer um status que
    // a API recusava com 422. Agora o zod deriva da lista.
    for (const { value } of STATUS_TAREFA) {
      expect(createTaskSchema.safeParse({ ...base, status: value }).success, value).toBe(true);
      expect(updateTaskSchema.safeParse({ status: value }).success, value).toBe(true);
    }
  });

  it("valor fora da lista é recusado", () => {
    for (const status of ["verificada", "", "Concluída", "CONCLUIDA"]) {
      expect(updateTaskSchema.safeParse({ status }).success, status).toBe(false);
    }
  });

  it("“Concluída” vem logo antes de “Concluída (verificada)”, no fim", () => {
    // A ordem da lista é a ordem dos seletores da tela.
    const valores = STATUS_TAREFA.map((s) => s.value);
    expect(valores.slice(-2)).toEqual(["entregue", "concluida"]);
    expect(statusLabel("entregue")).toBe("Concluída");
    expect(statusLabel("concluida")).toBe("Concluída (verificada)");
  });

  it("PATCH sem status não inventa um status", () => {
    // `.partial()` não pode aplicar o `default("afazer")` da criação: se
    // aplicasse, salvar o título de uma tarefa verificada a reabriria.
    expect(updateTaskSchema.parse({}).status).toBeUndefined();
    expect(updateTaskSchema.parse({ titulo: "Novo título" }).status).toBeUndefined();
  });

  it("quem entregou e quem verificou não passam pelo zod", () => {
    // Só o servidor grava os carimbos: o cliente não consegue forjar uma
    // verificação mandando o campo no corpo.
    const forjado = { verificadaPor: "eu@gta.com", verificadaEm: "2026-01-01", entreguePor: "x", entregueEm: "y" };
    expect(createTaskSchema.parse({ ...base, ...forjado })).not.toHaveProperty("verificadaPor");
    const patch = updateTaskSchema.parse({ status: "concluida", ...forjado });
    expect(patch).toEqual({ status: "concluida" });
  });
});

describe("rotuloCurto", () => {
  it("nenhum rótulo do seletor da linha passa do mais longo de antes", () => {
    // Um <select> toma a largura da maior opção: um rótulo longo alargaria o
    // seletor de TODAS as linhas e espremeria o título no celular.
    const limite = "Em Andamento".length;
    for (const { value } of STATUS_TAREFA) {
      expect(rotuloCurto(value).length, value).toBeLessThanOrEqual(limite);
    }
    expect(rotuloCurto("concluida")).toBe("Verificada");
    expect(rotuloCurto("entregue")).toBe("Concluída");
  });
});

describe("as três perguntas sobre o status", () => {
  const casos: [string, boolean, boolean, number][] = [
    // status       verificada  entregue  ordem
    ["afazer", false, false, 0],
    ["andamento", false, false, 0],
    ["atraso", false, false, 0],
    ["continuo", false, false, 0],
    ["entregue", false, true, 1],
    ["concluida", true, true, 2],
  ];

  it.each(casos)("%s", (status, verificada, entregue, ordem) => {
    expect(estaVerificada(status)).toBe(verificada);
    expect(trabalhoEntregue(status)).toBe(entregue);
    expect(ordemDeConclusao(status)).toBe(ordem);
  });

  it("cobre todos os status da lista", () => {
    expect(casos.map((c) => c[0]).sort()).toEqual(STATUS_TAREFA.map((s) => s.value).sort());
  });
});
