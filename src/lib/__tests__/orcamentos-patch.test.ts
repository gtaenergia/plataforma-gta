import { describe, expect, it } from "vitest";
import { limparSentinelas, LIMPAR } from "../orcamentos/store";

/**
 * Contrato do patch de orçamento. Existe porque os dois backends divergiam:
 * no store JSON (dev) um spread apaga qualquer campo, mas no Postgres o idioma
 * `COALESCE(x, coluna)` trata NULL como "não mexer" — então LIMPAR um campo era
 * impossível lá, e mandar "" numa coluna timestamptz derrubava a query.
 *
 * Estes testes travam o lado JSON. O lado SQL usa
 * `CASE WHEN p IS NULL THEN col ELSE NULLIF(p,'')::timestamptz END`:
 * o NULLIF roda ANTES do cast, então nenhum caminho tenta ler '' como data.
 */

describe("patch: campo ausente não mexe", () => {
  it("não inventa campos que não vieram", () => {
    expect(limparSentinelas({ estacao: "aprovado" })).toEqual({ estacao: "aprovado" });
  });

  it("undefined explícito continua sendo 'não mexe'", () => {
    const r = limparSentinelas({ decididoPor: undefined });
    expect(r.decididoPor).toBeUndefined();
  });
});

describe("patch: valor normal é gravado", () => {
  it("decisão preenchida passa intacta", () => {
    const r = limparSentinelas({ decididoPor: "Tito", decididoEm: "2026-07-30T12:00:00.000Z" });
    expect(r).toEqual({ decididoPor: "Tito", decididoEm: "2026-07-30T12:00:00.000Z" });
  });

  it("data de expiração passa intacta", () => {
    const r = limparSentinelas({ expiraEm: "2026-08-06T12:00:00.000Z" });
    expect(r.expiraEm).toBe("2026-08-06T12:00:00.000Z");
  });
});

describe('patch: "" LIMPA o campo', () => {
  it("apaga quem/quando decidiu (o que a reabertura exige)", () => {
    const r = limparSentinelas({ decididoPor: LIMPAR, decididoEm: LIMPAR });
    expect(r.decididoPor).toBeUndefined();
    expect(r.decididoEm).toBeUndefined();
  });

  it("zera a expiração como null — não como string vazia", () => {
    const r = limparSentinelas({ expiraEm: LIMPAR });
    // Precisa ser null: `listExpirados` filtra por `expiraEm != null`, e ""
    // passaria no filtro e ainda seria "menor" que qualquer data — o cron
    // apagaria os anexos de um orçamento reaberto.
    expect(r.expiraEm).toBeNull();
    expect(r.expiraEm).not.toBe("");
  });

  it("o patch de uma reabertura limpa os três campos de uma vez", () => {
    const r = limparSentinelas({
      estacao: "em_revisao",
      parecer: "Aprovei por engano.",
      decididoPor: LIMPAR,
      decididoEm: LIMPAR,
      expiraEm: LIMPAR,
    });
    expect(r.estacao).toBe("em_revisao");
    expect(r.parecer).toBe("Aprovei por engano.");
    expect(r.decididoPor).toBeUndefined();
    expect(r.decididoEm).toBeUndefined();
    expect(r.expiraEm).toBeNull();
  });
});

describe("o sentinela não vaza para outros campos", () => {
  it('parecer "" continua sendo "" (não é campo limpável)', () => {
    // Só decididoPor/decididoEm/expiraEm têm tratamento especial; os demais
    // seguem o COALESCE normal do SQL.
    expect(limparSentinelas({ parecer: "" }).parecer).toBe("");
  });
});
