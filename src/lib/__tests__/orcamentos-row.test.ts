import { describe, expect, it } from "vitest";
import { rowTo, type Row } from "../orcamentos/store";
import { formatBRL } from "../format";

/**
 * `rowTo` é a fronteira onde PRODUÇÃO diverge do DEV: em dev o store JSON já
 * guarda os tipos certos, mas o driver do Postgres devolve `numeric` como
 * STRING e `timestamptz` como Date. Nenhum teste tocava esse caminho — foi
 * por aí que passou o bug da reabertura.
 */

const linha = (over: Partial<Row> = {}): Row => ({
  id: "id-1",
  referencia: "GTA-2026-CLIENTE-ORC-001",
  cliente: "Cliente",
  fonte: "interno",
  estacao: "em_revisao",
  service_key: "solar",
  proposta_id: null,
  descricao: "",
  meta: null,
  valor: null,
  ficha: null,
  comentarios: [],
  historico: [],
  anexos: [],
  parecer: null,
  decidido_por: null,
  decidido_em: null,
  expira_em: null,
  one_drive: null,
  criado_por: "a@gta.com",
  criado_por_nome: null,
  criado_em: "2026-07-01T12:00:00.000Z",
  atualizado_em: "2026-07-02T12:00:00.000Z",
  ...over,
});

describe("valor: numeric volta como string do Postgres", () => {
  it("string vira number — senão o R$ sai sem formatação pt-BR", () => {
    const o = rowTo(linha({ valor: "1500.00" }));
    expect(o.valor).toBe(1500);
    expect(typeof o.valor).toBe("number");
    // O sintoma que isso evita: String.toLocaleString ignora as opções.
    expect(formatBRL(o.valor!)).toBe("R$ 1.500,00");
  });

  it("valor alto mantém o separador de milhar", () => {
    expect(formatBRL(rowTo(linha({ valor: "87450.90" })).valor!)).toBe("R$ 87.450,90");
  });

  it("number continua funcionando (não quebra o caminho já correto)", () => {
    expect(rowTo(linha({ valor: 250 })).valor).toBe(250);
  });

  it("null vira undefined (sem valor), não 0", () => {
    // 0 apareceria como "R$ 0,00" na fila de aprovações; undefined some.
    expect(rowTo(linha({ valor: null })).valor).toBeUndefined();
  });
});

describe("datas: timestamptz volta como Date do Postgres", () => {
  it("Date vira ISO string", () => {
    const o = rowTo(linha({
      criado_em: new Date("2026-07-01T12:00:00.000Z") as unknown as string,
      atualizado_em: new Date("2026-07-02T12:00:00.000Z") as unknown as string,
    }));
    expect(o.criadoEm).toBe("2026-07-01T12:00:00.000Z");
    expect(o.atualizadoEm).toBe("2026-07-02T12:00:00.000Z");
  });

  it("decisão e expiração ausentes não viram data inválida", () => {
    const o = rowTo(linha());
    expect(o.decididoEm).toBeUndefined();
    expect(o.expiraEm).toBeNull();
  });

  it("expiração presente vira ISO", () => {
    const o = rowTo(linha({ expira_em: new Date("2026-08-06T12:00:00.000Z") as unknown as string }));
    expect(o.expiraEm).toBe("2026-08-06T12:00:00.000Z");
  });
});

describe("colunas nulas viram os vazios que o app espera", () => {
  it("arrays e textos não vêm null para a UI", () => {
    const o = rowTo(linha());
    expect(o.comentarios).toEqual([]);
    expect(o.historico).toEqual([]);
    expect(o.anexos).toEqual([]);
    expect(o.descricao).toBe("");
    expect(o.serviceKey).toBe("solar");
  });
});
