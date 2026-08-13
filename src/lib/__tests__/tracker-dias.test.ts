import { describe, expect, it } from "vitest";
import { atravessaDia, fatiarPorDia, minutosNoIntervalo, sobrepoe, ymdLocal } from "../tracker/dias";
import { duracaoMin } from "../tracker/types";

/**
 * O defeito que originou este arquivo: quem trabalhava de um dia para o outro
 * via TUDO contabilizado no dia em que começou. Estes testes fixam as duas
 * metades da correção — repartir os minutos entre os dias e devolver o
 * lançamento a quem pergunta pelo dia seguinte.
 *
 * As datas são escritas em hora local (sem `Z`) de propósito: é o calendário
 * de parede que a pessoa lê, e é nele que o dia vira.
 */

const local = (s: string) => new Date(s);
const lanc = (inicio: string, fim?: string) => ({
  inicio: local(inicio).toISOString(),
  fim: fim ? local(fim).toISOString() : undefined,
});

describe("fatiarPorDia", () => {
  it("lançamento dentro do dia rende uma fatia só", () => {
    const f = fatiarPorDia(lanc("2026-08-13T09:00", "2026-08-13T17:30"));
    expect(f).toHaveLength(1);
    expect(f[0].dia).toBe("2026-08-13");
    expect(f[0].min).toBe(510);
    expect(f[0].atravessa).toBe(false);
    expect(f[0].inicioMin).toBe(540);
    expect(f[0].fimMin).toBe(1050);
  });

  it("o plantão 22:00 → 02:00 entrega duas horas para cada dia", () => {
    const f = fatiarPorDia(lanc("2026-08-13T22:00", "2026-08-14T02:00"));
    expect(f.map((x) => [x.dia, x.min])).toEqual([
      ["2026-08-13", 120],
      ["2026-08-14", 120],
    ]);
    expect(f.every((x) => x.atravessa)).toBe(true);
  });

  it("a fatia que vai até a virada termina em 1440, não em 0", () => {
    // `getHours()` da meia-noite seguinte devolveria 0 — e o bloco desabaria
    // para o topo da grade do calendário.
    const [primeira, segunda] = fatiarPorDia(lanc("2026-08-13T22:00", "2026-08-14T02:00"));
    expect(primeira.inicioMin).toBe(1320);
    expect(primeira.fimMin).toBe(1440);
    expect(segunda.inicioMin).toBe(0);
    expect(segunda.fimMin).toBe(120);
  });

  it("terminar exatamente na meia-noite não cria um dia seguinte vazio", () => {
    const f = fatiarPorDia(lanc("2026-08-13T22:00", "2026-08-14T00:00"));
    expect(f).toHaveLength(1);
    expect(f[0].min).toBe(120);
    expect(f[0].fimMin).toBe(1440);
    expect(f[0].atravessa).toBe(false);
  });

  it("cronômetro esquecido por três dias rende três fatias, a do meio com 24h", () => {
    const f = fatiarPorDia(lanc("2026-08-13T22:00", "2026-08-15T02:00"));
    expect(f.map((x) => [x.dia, x.min])).toEqual([
      ["2026-08-13", 120],
      ["2026-08-14", 1440],
      ["2026-08-15", 120],
    ]);
  });

  it("cronômetro em andamento é fechado por `agora`", () => {
    const f = fatiarPorDia(lanc("2026-08-13T22:00"), local("2026-08-14T10:00"));
    expect(f.map((x) => [x.dia, x.min])).toEqual([
      ["2026-08-13", 120],
      ["2026-08-14", 600],
    ]);
  });

  it("duração zero ainda pertence ao seu dia", () => {
    const f = fatiarPorDia(lanc("2026-08-13T09:00", "2026-08-13T09:00"));
    expect(f).toHaveLength(1);
    expect(f[0].min).toBe(0);
  });

  it("relógio atrasado não vira duração negativa", () => {
    const f = fatiarPorDia(lanc("2026-08-13T09:00"), local("2026-08-13T08:00"));
    expect(f).toHaveLength(1);
    expect(f[0].min).toBe(0);
  });

  it("a soma das fatias é sempre a duração inteira", () => {
    const f = fatiarPorDia(lanc("2026-08-13T22:00", "2026-08-15T02:00"));
    expect(f.reduce((s, x) => s + x.min, 0)).toBe(120 + 1440 + 120);
  });

  /**
   * Com segundos é que a conta pega: `round(a) + round(b)` não é `round(a+b)`,
   * e o cronômetro grava segundos em toda entrada. Arredondar cada fatia por
   * si fazia o plantão perder (ou ganhar) um minuto por virada, e a tela
   * mostrava as fatias somando 3h58min ao lado de "3h59min no total".
   */
  it.each([
    ["2026-08-13T22:00:40", "2026-08-14T01:59:20"],
    ["2026-08-13T22:00:20", "2026-08-14T01:59:44"],
    ["2026-08-13T23:59:59", "2026-08-14T00:00:01"],
    ["2026-08-13T22:00:31", "2026-08-16T03:17:07"],
  ])("a soma das fatias reconcilia com duracaoMin mesmo com segundos (%s → %s)", (ini, fim) => {
    const e = lanc(ini, fim);
    expect(fatiarPorDia(e).reduce((s, x) => s + x.min, 0)).toBe(duracaoMin(e));
  });

  it("nenhuma fatia sai com minutos negativos por causa do arredondamento", () => {
    const f = fatiarPorDia(lanc("2026-08-13T23:59:50", "2026-08-14T00:00:05"));
    expect(f.every((x) => x.min >= 0)).toBe(true);
    expect(f.reduce((s, x) => s + x.min, 0)).toBe(duracaoMin(lanc("2026-08-13T23:59:50", "2026-08-14T00:00:05")));
  });

  it("data inválida devolve lista vazia em vez de quebrar a tela", () => {
    expect(fatiarPorDia({ inicio: "não é data" })).toEqual([]);
  });
});

describe("atravessaDia", () => {
  it("distingue o turno noturno do turno diurno", () => {
    expect(atravessaDia(lanc("2026-08-13T22:00", "2026-08-14T02:00"))).toBe(true);
    expect(atravessaDia(lanc("2026-08-13T09:00", "2026-08-13T18:00"))).toBe(false);
  });
});

describe("minutosNoIntervalo", () => {
  const agosto = [local("2026-08-01T00:00"), local("2026-09-01T00:00")] as const;

  it("recorta o turno que termina depois do fim do período", () => {
    // 31/08 22:00 → 01/09 02:00: agosto fica com 2h, não com 4h.
    expect(minutosNoIntervalo(lanc("2026-08-31T22:00", "2026-09-01T02:00"), ...agosto)).toBe(120);
  });

  it("recorta o turno que começou antes do início do período", () => {
    // 31/07 22:00 → 01/08 02:00: agosto recebe as 2h da madrugada.
    expect(minutosNoIntervalo(lanc("2026-07-31T22:00", "2026-08-01T02:00"), ...agosto)).toBe(120);
  });

  it("lançamento inteiramente fora devolve zero", () => {
    expect(minutosNoIntervalo(lanc("2026-07-10T09:00", "2026-07-10T17:00"), ...agosto)).toBe(0);
  });

  it("lançamento inteiramente dentro devolve a duração cheia", () => {
    expect(minutosNoIntervalo(lanc("2026-08-10T09:00", "2026-08-10T17:00"), ...agosto)).toBe(480);
  });

  it("as duas metades de um turno na borda somam a duração inteira", () => {
    const turno = lanc("2026-08-31T22:00", "2026-09-01T02:00");
    const setembro = [local("2026-09-01T00:00"), local("2026-10-01T00:00")] as const;
    expect(minutosNoIntervalo(turno, ...agosto) + minutosNoIntervalo(turno, ...setembro)).toBe(240);
  });
});

describe("sobrepoe — o predicado da consulta", () => {
  const dia14 = ["2026-08-14T00:00", "2026-08-15T00:00"].map((s) => local(s).toISOString()) as [string, string];

  it("o turno que ENTRA no dia pela madrugada agora aparece", () => {
    // Era este o desaparecimento: `inicio` em 13/08 ficava fora da janela do 14.
    expect(sobrepoe(lanc("2026-08-13T22:00", "2026-08-14T02:00"), ...dia14)).toBe(true);
  });

  it("o turno que SAI do dia pela madrugada continua aparecendo", () => {
    expect(sobrepoe(lanc("2026-08-14T22:00", "2026-08-15T02:00"), ...dia14)).toBe(true);
  });

  it("lançamento inteiramente antes fica de fora", () => {
    expect(sobrepoe(lanc("2026-08-13T09:00", "2026-08-13T17:00"), ...dia14)).toBe(false);
  });

  it("lançamento inteiramente depois fica de fora", () => {
    expect(sobrepoe(lanc("2026-08-15T09:00", "2026-08-15T17:00"), ...dia14)).toBe(false);
  });

  it("encostar na borda não conta: a janela é [desde, ate)", () => {
    expect(sobrepoe(lanc("2026-08-13T20:00", "2026-08-14T00:00"), ...dia14)).toBe(false);
    expect(sobrepoe(lanc("2026-08-15T00:00", "2026-08-15T04:00"), ...dia14)).toBe(false);
  });

  it("cronômetro em andamento alcança o presente — basta ter começado antes", () => {
    expect(sobrepoe(lanc("2026-08-13T22:00"), ...dia14)).toBe(true);
    expect(sobrepoe(lanc("2026-08-20T09:00"), ...dia14)).toBe(false);
  });
});

describe("ymdLocal", () => {
  it("usa o fuso local, não o UTC", () => {
    // 21:00 em Brasília é 00:00 do dia seguinte em UTC — o dia não pode pular.
    expect(ymdLocal(local("2026-08-13T21:00"))).toBe("2026-08-13");
  });
});
