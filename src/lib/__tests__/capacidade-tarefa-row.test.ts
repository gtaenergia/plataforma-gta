import { describe, expect, it } from "vitest";
import { rowToTask, type Row } from "@/lib/tasks/postgres-store";
import { createTaskSchema, updateTaskSchema } from "@/lib/tasks/types";

/**
 * A fronteira onde produção diverge de desenvolvimento: em dev o store JSON já
 * guarda os tipos certos; em produção o driver do Postgres devolve o que a
 * coluna der — e a linha gravada ANTES da coluna existir devolve `null`.
 *
 * Foi por esse caminho que passaram os bugs de orçamentos, e é o único ponto
 * desta feature que pode falhar só depois do deploy.
 */

const linha = (over: Partial<Row> = {}): Row => ({
  id: "id-1",
  titulo: "Orçamento do galpão",
  descricao: "",
  cliente: "",
  categoria: "Orçamentos",
  tipo_demanda: "Usina solar residencial",
  demandante: "comercial",
  responsavel: "ana@gta.com",
  status: "afazer",
  prioridade: "media",
  prazo: "",
  prazo_comercial: "",
  prazo_operacional: "",
  hora_comercial: "",
  hora_operacional: "",
  estimativa_min: 240,
  comentarios: [],
  criado_por: "chefe@gta.com",
  criado_em: "2026-08-03T12:00:00.000Z",
  atualizado_em: "2026-08-03T12:00:00.000Z",
  ...over,
});

describe("estimativa vinda do banco", () => {
  it("integer volta como número", () => {
    expect(rowToTask(linha()).estimativaMin).toBe(240);
  });

  it("linha anterior à coluna (null) vira 0, não NaN", () => {
    // `undefined` cobre o SELECT de uma réplica ainda sem a coluna.
    expect(rowToTask(linha({ estimativa_min: null as never })).estimativaMin).toBe(0);
    expect(rowToTask(linha({ estimativa_min: undefined as never })).estimativaMin).toBe(0);
  });

  it("valor textual não contamina a conta", () => {
    // Se um dia a coluna virar numeric, o driver passa a devolver string —
    // e `"240" + 60` seria "24060" em vez de 300.
    const t = rowToTask(linha({ estimativa_min: "240" as never }));
    expect(t.estimativaMin).toBe(240);
    expect(t.estimativaMin + 60).toBe(300);
  });

  it("lixo no lugar do número vira 0 em vez de NaN", () => {
    expect(rowToTask(linha({ estimativa_min: "abc" as never })).estimativaMin).toBe(0);
  });
});

describe("elo com a negociação do CRM", () => {
  it("o id atravessa intacto", () => {
    expect(rowToTask(linha({ negociacao_id: "neg-42" })).negociacaoId).toBe("neg-42");
  });

  it("tarefa nascida em Operações (e linha sem a coluna) vira string vazia", () => {
    // `String(null)` daria "neg-null" na URL de volta para o CRM.
    expect(rowToTask(linha()).negociacaoId).toBe("");
    expect(rowToTask(linha({ negociacao_id: null })).negociacaoId).toBe("");
  });
});

describe("tipo de demanda vindo do banco", () => {
  it("o texto atravessa intacto", () => {
    expect(rowToTask(linha()).tipoDemanda).toBe("Usina solar residencial");
  });

  it("linha anterior à coluna (null) vira string vazia, não 'null'", () => {
    // `String(null)` daria "null" na tela e nunca casaria com o catálogo.
    expect(rowToTask(linha({ tipo_demanda: null as never })).tipoDemanda).toBe("");
    expect(rowToTask(linha({ tipo_demanda: undefined as never })).tipoDemanda).toBe("");
  });
});

describe("validação do payload", () => {
  const base = { titulo: "X", responsavel: "ana@gta.com" };

  it("sem estimativa, o padrão é 0 (= não informado)", () => {
    const r = createTaskSchema.parse(base);
    expect(r.estimativaMin).toBe(0);
  });

  it("string do formulário é convertida", () => {
    expect(createTaskSchema.parse({ ...base, estimativaMin: "180" }).estimativaMin).toBe(180);
  });

  it("negativo e fração de minuto são rejeitados", () => {
    expect(createTaskSchema.safeParse({ ...base, estimativaMin: -30 }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...base, estimativaMin: 12.5 }).success).toBe(false);
  });

  it("estimativa absurda é barrada — um dígito a mais tomaria meses da agenda", () => {
    expect(createTaskSchema.safeParse({ ...base, estimativaMin: 400 * 60 }).success).toBe(true);
    expect(createTaskSchema.safeParse({ ...base, estimativaMin: 400 * 60 + 1 }).success).toBe(false);
  });

  it("a atualização parcial herda o campo sem exigi-lo", () => {
    expect(updateTaskSchema.parse({}).estimativaMin).toBeUndefined();
    expect(updateTaskSchema.parse({ estimativaMin: 60 }).estimativaMin).toBe(60);
    // Zerar é uma alteração legítima, e precisa chegar como 0 (não undefined),
    // senão o COALESCE do UPDATE preservaria o valor antigo.
    expect(updateTaskSchema.parse({ estimativaMin: 0 }).estimativaMin).toBe(0);
  });
});
