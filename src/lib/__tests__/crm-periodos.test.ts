import { describe, expect, it } from "vitest";
import { periodoDe, rotuloPeriodo } from "@/lib/crm/periodos";

/** 15 de março de 2026 — mês de 31 dias, com fevereiro de 28 antes dele. */
const HOJE = new Date(2026, 2, 15);

describe("periodoDe", () => {
  it("este mês vai do dia 1 ao último dia", () => {
    expect(periodoDe("mes", HOJE)).toEqual({ inicio: "2026-03-01", fim: "2026-03-31" });
  });

  it("mês passado respeita o tamanho dele, não o do atual", () => {
    // Fevereiro de 2026 tem 28 dias; copiar "31" daria uma data inexistente.
    expect(periodoDe("mes_passado", HOJE)).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
  });

  it("mês passado em janeiro rola para dezembro do ano anterior", () => {
    expect(periodoDe("mes_passado", new Date(2026, 0, 10))).toEqual({ inicio: "2025-12-01", fim: "2025-12-31" });
  });

  it("últimos 3 meses inclui o atual inteiro", () => {
    expect(periodoDe("trimestre", HOJE)).toEqual({ inicio: "2026-01-01", fim: "2026-03-31" });
  });

  it("trimestre em fevereiro atravessa o ano", () => {
    expect(periodoDe("trimestre", new Date(2026, 1, 5))).toEqual({ inicio: "2025-12-01", fim: "2026-02-28" });
  });

  it("ano bissexto: fevereiro tem 29", () => {
    expect(periodoDe("mes", new Date(2028, 1, 3)).fim).toBe("2028-02-29");
  });

  it("este ano e tudo", () => {
    expect(periodoDe("ano", HOJE)).toEqual({ inicio: "2026-01-01", fim: "2026-12-31" });
    expect(periodoDe("tudo", HOJE)).toEqual({ inicio: "", fim: "" });
  });
});

describe("rotuloPeriodo", () => {
  it("descreve o intervalo em pt-BR", () => {
    expect(rotuloPeriodo({ inicio: "2026-03-01", fim: "2026-03-31" })).toBe("01/03/2026 a 31/03/2026");
    expect(rotuloPeriodo({ inicio: "", fim: "" })).toBe("todo o período");
    expect(rotuloPeriodo({ inicio: "2026-03-01", fim: "" })).toBe("a partir de 01/03/2026");
    expect(rotuloPeriodo({ inicio: "", fim: "2026-03-31" })).toBe("até 31/03/2026");
  });
});
