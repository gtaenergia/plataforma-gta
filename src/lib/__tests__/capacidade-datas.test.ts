import { describe, expect, it } from "vitest";
import {
  diaDaSemana,
  diasEntre,
  diasUteisEntre,
  ehDiaUtil,
  ehYmd,
  fimJanelaCurta,
  fimJanelaLonga,
  paraData,
  proximoDiaUtil,
  somarDias,
  ymd,
} from "@/lib/capacidade/datas";

/** Seg a sex, sem feriado. */
const UTIL = { diasUteis: [1, 2, 3, 4, 5], feriados: [] as string[] };

describe("aritmética de dias", () => {
  it("soma atravessa mês e ano sem escorregar", () => {
    expect(somarDias("2026-01-31", 1)).toBe("2026-02-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2028-03-01", -1)).toBe("2028-02-29"); // bissexto
  });

  it("diasEntre conta corridos", () => {
    expect(diasEntre("2026-08-03", "2026-08-10")).toBe(7);
    expect(diasEntre("2026-08-10", "2026-08-03")).toBe(-7);
  });

  it("rejeita data que não existe no calendário", () => {
    expect(ehYmd("2026-02-31")).toBe(false);
    expect(ehYmd("2026-13-01")).toBe(false);
    expect(ehYmd("03/08/2026")).toBe(false);
    expect(ehYmd("2026-08-03")).toBe(true);
  });

  it("o dia da semana não escorrega no horário de verão", () => {
    // Datas construídas às 00:00 podem voltar um dia quando o relógio atrasa;
    // por isso o módulo usa meio-dia. 2026-08-03 é uma segunda-feira.
    expect(diaDaSemana("2026-08-03")).toBe(1);
    expect(diaDaSemana("2026-08-09")).toBe(0);
    // Varre dois anos: nenhuma data pode mudar na ida e volta Ymd → Date → Ymd,
    // inclusive nas viradas de horário de verão.
    let d = "2026-01-01";
    for (let i = 0; i < 730; i++) {
      expect(ymd(paraData(d))).toBe(d);
      d = somarDias(d, 1);
    }
  });
});

describe("dias úteis", () => {
  it("sexta + 1 dia útil cai na segunda", () => {
    // 2026-08-07 é sexta.
    expect(proximoDiaUtil(somarDias("2026-08-07", 1), UTIL)).toBe("2026-08-10");
  });

  it("o feriado é pulado", () => {
    const cal = { diasUteis: [1, 2, 3, 4, 5], feriados: ["2026-08-04"] };
    expect(ehDiaUtil("2026-08-04", cal)).toBe(false);
    expect(proximoDiaUtil("2026-08-04", cal)).toBe("2026-08-05");
  });

  it("quem trabalha sábado enxerga o sábado", () => {
    const cal = { diasUteis: [1, 2, 3, 4, 5, 6], feriados: [] };
    expect(proximoDiaUtil("2026-08-08", cal)).toBe("2026-08-08");
    expect(proximoDiaUtil("2026-08-08", UTIL)).toBe("2026-08-10");
  });

  it("sem nenhum dia útil devolve null em vez de travar", () => {
    // É a diferença entre um campo em branco e um laço infinito dentro de um
    // render: sem esse retorno, procurar "o próximo dia útil" nunca termina.
    const cal = { diasUteis: [] as number[], feriados: [] };
    expect(proximoDiaUtil("2026-08-03", cal)).toBe(null);
    expect(diasUteisEntre("2026-08-03", "2026-12-31", cal)).toEqual([]);
  });

  it("feriado em todo o intervalo também devolve null", () => {
    const feriados: string[] = [];
    let d = "2026-08-03";
    for (let i = 0; i < 400; i++) {
      feriados.push(d);
      d = somarDias(d, 1);
    }
    expect(proximoDiaUtil("2026-08-03", { diasUteis: [1, 2, 3, 4, 5], feriados })).toBe(null);
  });

  it("conta os dias úteis da janela nas duas pontas", () => {
    // Segunda a sexta da mesma semana.
    expect(diasUteisEntre("2026-08-03", "2026-08-07", UTIL)).toHaveLength(5);
    // Semana inteira (com sáb e dom) continua com 5.
    expect(diasUteisEntre("2026-08-03", "2026-08-09", UTIL)).toHaveLength(5);
    // Intervalo invertido não é erro, é vazio.
    expect(diasUteisEntre("2026-08-09", "2026-08-03", UTIL)).toEqual([]);
  });
});

describe("janelas rolantes", () => {
  it("a janela conta a partir de hoje, inclusive", () => {
    expect(fimJanelaCurta("2026-08-03")).toBe("2026-08-09");
    expect(fimJanelaLonga("2026-08-03")).toBe("2026-09-01");
  });

  it("SEMPRE tem dia útil dentro — é a razão de ser rolante", () => {
    // Com janela de calendário, num domingo "o que resta da semana" são zero
    // dias úteis: a capacidade dava zero, a ocupação virava null e o painel
    // inteiro ficava em branco. Numa sexta à tarde, qualquer tarefa virava
    // estouro. Varre o ano inteiro para garantir que isso não volta.
    let d = "2026-01-01";
    for (let i = 0; i < 365; i++) {
      expect(diasUteisEntre(d, fimJanelaCurta(d), UTIL).length).toBeGreaterThan(0);
      d = somarDias(d, 1);
    }
  });

  it("a janela curta cobre 5 dias úteis numa semana comum", () => {
    // Segunda + 6 dias = domingo seguinte: seg a sex.
    expect(diasUteisEntre("2026-08-03", fimJanelaCurta("2026-08-03"), UTIL)).toHaveLength(5);
    // Sábado + 6 = sexta: também 5 (seg a sex da semana seguinte).
    expect(diasUteisEntre("2026-08-08", fimJanelaCurta("2026-08-08"), UTIL)).toHaveLength(5);
  });
});
