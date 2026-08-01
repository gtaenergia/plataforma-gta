import { describe, expect, it } from "vitest";
import {
  createTimeEntrySchema,
  startTimeEntrySchema,
  updateTimeEntrySchema,
  duracaoMin,
  formatarDuracao,
} from "../tracker/types";
import { rowTo, type Row } from "../tracker/postgres-store";

describe("startTimeEntrySchema — iniciar cronômetro", () => {
  it("aceita corpo mínimo (tudo tem default)", () => {
    const r = startTimeEntrySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ descricao: "", cliente: "", categoria: "", billable: false, tags: [] });
    }
  });

  it("aceita tarefaId, billable e tags", () => {
    const r = startTimeEntrySchema.safeParse({ tarefaId: "abc", billable: true, tags: ["urgente"] });
    expect(r.success).toBe(true);
  });
});

describe("createTimeEntrySchema — lançamento manual", () => {
  it("exige início e fim", () => {
    expect(createTimeEntrySchema.safeParse({}).success).toBe(false);
    expect(createTimeEntrySchema.safeParse({ inicio: "2026-07-30T08:00:00.000Z" }).success).toBe(false);
  });

  it("recusa fim antes (ou igual) do início", () => {
    const base = { inicio: "2026-07-30T10:00:00.000Z" };
    expect(createTimeEntrySchema.safeParse({ ...base, fim: "2026-07-30T09:00:00.000Z" }).success).toBe(false);
    expect(createTimeEntrySchema.safeParse({ ...base, fim: "2026-07-30T10:00:00.000Z" }).success).toBe(false);
  });

  it("aceita fim depois do início", () => {
    const r = createTimeEntrySchema.safeParse({ inicio: "2026-07-30T09:00:00.000Z", fim: "2026-07-30T10:30:00.000Z" });
    expect(r.success).toBe(true);
  });
});

describe("updateTimeEntrySchema", () => {
  it("todos os campos são opcionais (patch parcial)", () => {
    expect(updateTimeEntrySchema.safeParse({}).success).toBe(true);
    expect(updateTimeEntrySchema.safeParse({ descricao: "novo texto" }).success).toBe(true);
  });

  it("se só um dos dois (início/fim) vier, não valida a ordem — só quando os dois vêm juntos", () => {
    expect(updateTimeEntrySchema.safeParse({ fim: "2026-07-30T10:00:00.000Z" }).success).toBe(true);
  });

  it("com os dois, ainda recusa fim <= início", () => {
    const r = updateTimeEntrySchema.safeParse({ inicio: "2026-07-30T10:00:00.000Z", fim: "2026-07-30T09:00:00.000Z" });
    expect(r.success).toBe(false);
  });

  it('tarefaId: "" (LIMPAR) passa — a store, não o schema, decide o que fazer', () => {
    expect(updateTimeEntrySchema.safeParse({ tarefaId: "" }).success).toBe(true);
  });
});

describe("duracaoMin", () => {
  it("calcula a diferença entre início e fim", () => {
    expect(duracaoMin({ inicio: "2026-07-30T08:00:00.000Z", fim: "2026-07-30T09:30:00.000Z" })).toBe(90);
  });

  it("sem fim, usa `agora` (cronômetro rodando)", () => {
    const agora = new Date("2026-07-30T08:45:00.000Z");
    expect(duracaoMin({ inicio: "2026-07-30T08:00:00.000Z" }, agora)).toBe(45);
  });

  it("nunca retorna negativo (relógio do cliente atrasado, por exemplo)", () => {
    const agora = new Date("2026-07-30T07:00:00.000Z"); // antes do início
    expect(duracaoMin({ inicio: "2026-07-30T08:00:00.000Z" }, agora)).toBe(0);
  });
});

describe("formatarDuracao", () => {
  it("só minutos quando < 1h", () => expect(formatarDuracao(45)).toBe("45min"));
  it("só horas quando exato", () => expect(formatarDuracao(120)).toBe("2h"));
  it("horas e minutos", () => expect(formatarDuracao(90)).toBe("1h 30min"));
  it("zero", () => expect(formatarDuracao(0)).toBe("0min"));
});

/**
 * `rowTo` é a fronteira onde produção (Postgres) diverge do dev (JSON) — foi
 * exatamente aqui que os bugs de "valor sem formatação" e "reabrir quebrado"
 * viveram em Orçamentos. Testa contra os tipos crus que o driver devolve:
 * `timestamptz` vira Date, `jsonb` vira array/objeto já parseado.
 */
describe("rowTo — fronteira com o Postgres", () => {
  const linha = (over: Partial<Row> = {}): Row => ({
    id: "id-1",
    usuario_email: "a@gta.com",
    descricao: "Revisão de proposta",
    tarefa_id: null,
    cliente: "Cliente X",
    categoria: "Orçamentos",
    billable: false,
    tags: [],
    inicio: "2026-07-30T08:00:00.000Z",
    fim: null,
    criado_em: "2026-07-30T08:00:00.000Z",
    atualizado_em: "2026-07-30T08:00:00.000Z",
    ...over,
  });

  it("fim null vira undefined (cronômetro rodando) — não string vazia nem data inválida", () => {
    const e = rowTo(linha({ fim: null }));
    expect(e.fim).toBeUndefined();
  });

  it("fim com Date do driver vira ISO string", () => {
    const e = rowTo(linha({ fim: new Date("2026-07-30T09:30:00.000Z") as unknown as string }));
    expect(e.fim).toBe("2026-07-30T09:30:00.000Z");
  });

  it("inicio com Date do driver vira ISO string", () => {
    const e = rowTo(linha({ inicio: new Date("2026-07-30T08:00:00.000Z") as unknown as string }));
    expect(e.inicio).toBe("2026-07-30T08:00:00.000Z");
  });

  it("tarefa_id null vira undefined (lançamento avulso)", () => {
    expect(rowTo(linha({ tarefa_id: null })).tarefaId).toBeUndefined();
  });

  it("tarefa_id presente é preservado", () => {
    expect(rowTo(linha({ tarefa_id: "tarefa-123" })).tarefaId).toBe("tarefa-123");
  });

  it("billable é sempre boolean de verdade (driver pode devolver 0/1)", () => {
    expect(rowTo(linha({ billable: 1 as unknown as boolean })).billable).toBe(true);
    expect(rowTo(linha({ billable: 0 as unknown as boolean })).billable).toBe(false);
  });

  it("tags null (linha antiga) vira array vazio, não crasha", () => {
    expect(rowTo(linha({ tags: null as unknown as string[] })).tags).toEqual([]);
  });

  it("campos de texto null viram string vazia", () => {
    const e = rowTo(linha({ descricao: null as unknown as string, cliente: null as unknown as string, categoria: null as unknown as string }));
    expect(e.descricao).toBe("");
    expect(e.cliente).toBe("");
    expect(e.categoria).toBe("");
  });
});
