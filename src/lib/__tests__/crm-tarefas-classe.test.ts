import { describe, expect, it } from "vitest";
import { classificarTarefa, dataCurta } from "@/components/crm/util";

const HOJE = "2026-08-07";

describe("classificarTarefa", () => {
  it("concluída vence qualquer data — até a atrasada", () => {
    expect(classificarTarefa({ data: "2026-08-01", concluida: true }, HOJE)).toBe("concluida");
    expect(classificarTarefa({ data: "2026-12-31", concluida: true }, HOJE)).toBe("concluida");
  });

  it("separa atrasada, hoje e próxima pela data", () => {
    expect(classificarTarefa({ data: "2026-08-06", concluida: false }, HOJE)).toBe("atrasada");
    expect(classificarTarefa({ data: "2026-08-07", concluida: false }, HOJE)).toBe("hoje");
    expect(classificarTarefa({ data: "2026-08-08", concluida: false }, HOJE)).toBe("proxima");
  });

  it("a virada de mês e de ano compara certo como texto", () => {
    expect(classificarTarefa({ data: "2026-07-31", concluida: false }, "2026-08-01")).toBe("atrasada");
    expect(classificarTarefa({ data: "2027-01-01", concluida: false }, "2026-12-31")).toBe("proxima");
  });
});

describe("dataCurta", () => {
  it("converte ISO para dd/mm/aaaa e deixa o resto em paz", () => {
    expect(dataCurta("2026-08-07")).toBe("07/08/2026");
    expect(dataCurta("")).toBe("");
    expect(dataCurta("amanhã")).toBe("amanhã");
  });
});
