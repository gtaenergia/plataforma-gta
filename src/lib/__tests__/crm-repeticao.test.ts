import { describe, expect, it } from "vitest";
import { descreverRepeticao, hojeEmSaoPaulo, proximaOcorrencia, somarIntervalo } from "@/lib/crm/repeticao";

describe("somarIntervalo", () => {
  it("dias e semanas atravessam o fim do mês", () => {
    expect(somarIntervalo("2026-10-29", 5, "dias")).toBe("2026-11-03");
    expect(somarIntervalo("2026-12-28", 1, "semanas")).toBe("2027-01-04");
  });

  it("mês soma no calendário e para no último dia — 31/01 + 1 mês é fevereiro, não março", () => {
    expect(somarIntervalo("2026-01-31", 1, "meses")).toBe("2026-02-28");
    expect(somarIntervalo("2028-01-31", 1, "meses")).toBe("2028-02-29");
    expect(somarIntervalo("2026-12-15", 1, "meses")).toBe("2027-01-15");
    expect(somarIntervalo("2026-11-30", 3, "meses")).toBe("2027-02-28");
  });

  it("data torta volta como veio, em vez de virar NaN", () => {
    expect(somarIntervalo("29/10/2026", 1, "dias")).toBe("29/10/2026");
  });
});

describe("proximaOcorrencia", () => {
  it("feito antes do dia: a próxima conta da data AGENDADA, não do dia feito", () => {
    expect(proximaOcorrencia("2026-10-29", 1, "meses", "2026-10-25")).toBe("2026-11-29");
  });

  it("feito no dia: um intervalo adiante", () => {
    expect(proximaOcorrencia("2026-10-29", 1, "meses", "2026-10-29")).toBe("2026-11-29");
  });

  it("feito com atraso: pula as ocorrências vencidas em vez de empilhar cobranças para hoje", () => {
    // Semanal, marcado para 05/10, feito só em 15/10: 12/10 já passou.
    expect(proximaOcorrencia("2026-10-05", 1, "semanas", "2026-10-15")).toBe("2026-10-19");
  });

  it("nunca agenda para o próprio dia do contato", () => {
    // 13/10 é exatamente uma semana depois de 06/10 — e é o dia em que o
    // contato foi feito. A próxima é a semana seguinte.
    expect(proximaOcorrencia("2026-10-06", 1, "semanas", "2026-10-13")).toBe("2026-10-20");
  });

  it("o dia 31 não se perde no primeiro fevereiro", () => {
    // Somando mês a mês, 31/01 viraria 28/02 e depois 28/03. Contando da
    // data agendada, março volta ao 31.
    expect(proximaOcorrencia("2026-01-31", 1, "meses", "2026-03-01")).toBe("2026-03-31");
  });

  it("sem intervalo não há próxima", () => {
    expect(proximaOcorrencia("2026-10-29", 0, "meses", "2026-10-29")).toBe("");
  });
});

describe("descreverRepeticao", () => {
  it("fala como gente", () => {
    expect(descreverRepeticao(0, "")).toBe("Não se repete");
    expect(descreverRepeticao(1, "semanas")).toBe("Toda semana");
    expect(descreverRepeticao(1, "meses")).toBe("Todo mês");
    expect(descreverRepeticao(15, "dias")).toBe("A cada 15 dias");
    expect(descreverRepeticao(3, "meses")).toBe("A cada 3 meses");
  });
});

describe("hojeEmSaoPaulo", () => {
  it("às 23h daqui o servidor em UTC já está no dia seguinte — vale o dia daqui", () => {
    expect(hojeEmSaoPaulo(new Date("2026-10-29T02:00:00Z"))).toBe("2026-10-28");
    expect(hojeEmSaoPaulo(new Date("2026-10-29T15:00:00Z"))).toBe("2026-10-29");
  });
});
