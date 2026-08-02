import { describe, expect, it } from "vitest";
import { fioBPctDoAno, simularEconomia, FIO_B_POR_ANO } from "@/services/solar/economia";

describe("fioBPctDoAno — rampa da Lei 14.300/2022", () => {
  it("segue a tabela da lei, ano a ano", () => {
    expect(fioBPctDoAno(2023)).toBe(0.15);
    expect(fioBPctDoAno(2024)).toBe(0.3);
    expect(fioBPctDoAno(2025)).toBe(0.45);
    expect(fioBPctDoAno(2026)).toBe(0.6);
    expect(fioBPctDoAno(2027)).toBe(0.75);
    expect(fioBPctDoAno(2028)).toBe(0.9);
  });

  it("de 2029 em diante é pleno", () => {
    expect(fioBPctDoAno(2029)).toBe(1);
    expect(fioBPctDoAno(2040)).toBe(1);
  });

  it("antes da lei não havia cobrança", () => {
    expect(fioBPctDoAno(2022)).toBe(0);
  });

  it("a tabela é monotônica — nunca recua", () => {
    const anos = Object.keys(FIO_B_POR_ANO).map(Number).sort((a, b) => a - b);
    for (let k = 1; k < anos.length; k++) {
      expect(FIO_B_POR_ANO[anos[k]]).toBeGreaterThan(FIO_B_POR_ANO[anos[k - 1]]);
    }
  });

  it("nenhum ano vale 0,7 — o valor que estava fixado antes", () => {
    // O default era 0,7, que não corresponde a ano nenhum da tabela.
    expect(Object.values(FIO_B_POR_ANO)).not.toContain(0.7);
  });
});

/**
 * Cenário em que o Fio B REALMENTE pesa: ligação monofásica (disponibilidade
 * de só 30 kWh) e geração bem acima do consumo, então a energia injetada é
 * grande e o custo do Fio B supera o mínimo faturado.
 *
 * No perfil típico (trifásico dimensionado ao consumo) o custo de
 * disponibilidade domina o `Math.max` e a rampa não muda nada — por isso o
 * golden test não se moveu com esta correção.
 */
const cenarioInjecao = {
  consumo: Array(12).fill(300),
  geracaoMensal: Array(12).fill(2000),
  disponibilidade: 30,
  tarifaEnergia: 1.0,
  fioB: 0.35,
  simultaneidade: 0.2,
  iluminacao: 40,
  investimento: 80000,
  inflacaoTarifa: 0,
  degradacao: 0,
  anos: 6,
};

describe("simularEconomia — a rampa é por ano-calendário", () => {
  it("um sistema que entra em 2026 percorre 60/75/90/100/100/100", () => {
    const r = simularEconomia({ ...cenarioInjecao, anoInicial: 2026 });
    // Sem inflação nem degradação, a única coisa que muda entre anos é o %FioB.
    // Custo mensal do Fio B = 2000 × 0,8 × pct × 0,35 = 560 × pct.
    const custoAno = (pct: number) => 12 * (Math.max(30 * 1.0, 560 * pct) + 40);
    const semSolar = 12 * (300 * 1.0 + 40);
    for (const [idx, pct] of [0.6, 0.75, 0.9, 1, 1, 1].entries()) {
      expect(r.economiaPorAno[idx]).toBeCloseTo(semSolar - custoAno(pct), 6);
    }
  });

  it("a economia CAI enquanto a rampa sobe e estabiliza em 2029", () => {
    const r = simularEconomia({ ...cenarioInjecao, anoInicial: 2026 });
    expect(r.economiaPorAno[0]).toBeGreaterThan(r.economiaPorAno[1]);
    expect(r.economiaPorAno[1]).toBeGreaterThan(r.economiaPorAno[2]);
    expect(r.economiaPorAno[2]).toBeGreaterThan(r.economiaPorAno[3]);
    // 2029 em diante é pleno: para de cair.
    expect(r.economiaPorAno[3]).toBeCloseTo(r.economiaPorAno[4], 6);
    expect(r.economiaPorAno[4]).toBeCloseTo(r.economiaPorAno[5], 6);
  });

  it("entrar em operação mais tarde rende menos — a rampa já está adiantada", () => {
    const em2026 = simularEconomia({ ...cenarioInjecao, anoInicial: 2026 });
    const em2028 = simularEconomia({ ...cenarioInjecao, anoInicial: 2028 });
    expect(em2028.economiaPorAno[0]).toBeLessThan(em2026.economiaPorAno[0]);
    expect(em2028.economiaHorizonte).toBeLessThan(em2026.economiaHorizonte);
  });

  it("o modelo antigo (ano2=90%, ano3+=100%) era mais pessimista que a lei", () => {
    // Antigo: 2º ano já a 90%. Lei, para quem entra em 2026: 75%.
    const lei = simularEconomia({ ...cenarioInjecao, anoInicial: 2026 });
    const custoMensal = (pct: number) => Math.max(30, 560 * pct) + 40;
    const antigoAno2 = 12 * (300 + 40) - 12 * custoMensal(0.9);
    expect(lei.economiaPorAno[1]).toBeGreaterThan(antigoAno2);
  });
});
