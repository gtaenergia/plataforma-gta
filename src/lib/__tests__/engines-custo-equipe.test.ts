import { describe, expect, it } from "vitest";
import { precoQgbt } from "@/services/qgbt/pricing";
import { precoExecSE } from "@/services/execucao-subestacao/pricing";
import { precoRedeMt } from "@/services/rede-mt/pricing";

/**
 * O custo da equipe nos engines de Fator K.
 *
 * Os goldens já provam a metade silenciosa: sem ninguém apontado, o preço é
 * byte a byte o de antes. Estes provam a metade barulhenta — quando alguém é
 * apontado, o preço sobe, e sobe pelo Fator K, não pelo custo cru.
 */

describe("QGBT", () => {
  const p = { fatorK: 1.55, aliqImpostos: 0.15 };

  it("sem equipe, o preço é o de sempre", () => {
    const a = precoQgbt({ custoUnitario: 18_000, qtdQuadros: 2 }, p);
    expect(a.custoEquipe).toBe(0);
    expect(a.faturamento).toBe(a.faturamentoSemEquipe);
  });

  it("R$ 300 de horas viram R$ 300 × 1,55 no preço", () => {
    const a = precoQgbt({ custoUnitario: 18_000, qtdQuadros: 2, custoEquipe: 300 }, p);
    // 36.000 + 300 = 36.300 × 1,55 = 56.265 → arredonda a 56.270
    expect(a.custo).toBe(36_300);
    expect(a.faturamento - a.faturamentoSemEquipe).toBe(470);
    // O acréscimo é maior que o custo cru: é markup, não repasse.
    expect(a.faturamento - a.faturamentoSemEquipe).toBeGreaterThan(300);
  });

  it("a identidade do engine continua valendo com equipe", () => {
    const a = precoQgbt({ custoUnitario: 7_777, qtdQuadros: 3, custoEquipe: 1_234.56 }, p);
    expect(a.lucro).toBeCloseTo(a.faturamento - a.custo - a.impostos, 6);
    expect(a.custo).toBeCloseTo(a.custoSemEquipe + a.custoEquipe, 6);
  });
});

describe("Execução de subestação", () => {
  const p = { fatorK: 1.7, aliqImpostos: 0.06 };
  const base = { custoMateriais: 30_000, custoMaoObra: 20_000, custoProjetoOutros: 5_000 };

  it("as horas da GTA são separadas do que foi orçado no levantamento", () => {
    const a = precoExecSE({ ...base, custoEquipe: 800 }, p);
    expect(a.custoProjetoOutros).toBe(5_000); // ART, andaime, EPI — intocado
    expect(a.custoEquipe).toBe(800);
    expect(a.custoSemEquipe).toBe(55_000);
    expect(a.custo).toBe(55_800);
  });

  it("o preço sobe pelo Fator K", () => {
    const a = precoExecSE({ ...base, custoEquipe: 800 }, p);
    expect(a.faturamento).toBeGreaterThan(a.faturamentoSemEquipe);
    expect(a.faturamento - a.faturamentoSemEquipe).toBeGreaterThanOrEqual(800);
  });
});

describe("Rede de média tensão", () => {
  const p = { fatorKProjeto: 1.9, nfProjeto: 0.1, fatorKExecucao: 1.7, nfExecucao: 0.06 };

  it("as horas entram no PROJETO, nunca na execução", () => {
    const a = precoRedeMt({ custoProjeto: 20_000, custoExecucao: 50_000, custoEquipe: 1_000 }, p);
    const b = precoRedeMt({ custoProjeto: 20_000, custoExecucao: 50_000 }, p);
    expect(a.custoExecucao).toBe(b.custoExecucao);
    expect(a.faturamentoExecucao).toBe(b.faturamentoExecucao); // obra de terceiro, intocada
    expect(a.faturamentoProjeto).toBeGreaterThan(b.faturamentoProjeto);
  });

  it("projeto sem custo orçado, mas com horas apontadas, TEM preço", () => {
    // O guard antigo era `custoProjeto > 0` e devolveria zero aqui — um projeto
    // que é só o tempo do engenheiro sairia de graça.
    const a = precoRedeMt({ custoProjeto: 0, custoExecucao: 0, custoEquipe: 2_000 }, p);
    expect(a.faturamentoProjeto).toBeGreaterThan(0);
    expect(a.faturamentoProjetoSemEquipe).toBe(0);
  });

  it("sem equipe, os dois faturamentos coincidem", () => {
    const a = precoRedeMt({ custoProjeto: 12_000, custoExecucao: 0 }, p);
    expect(a.faturamentoProjeto).toBe(a.faturamentoProjetoSemEquipe);
    expect(a.custoEquipe).toBe(0);
  });
});
