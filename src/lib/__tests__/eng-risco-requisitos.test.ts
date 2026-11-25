import { describe, expect, it } from "vitest";
import { calcularRisco } from "@/lib/engenharia/risco/motor";
import { observacoesNorma, requisitosDps, requisitosSpda, textoIimp } from "@/lib/engenharia/risco/requisitos";
import { novaLinha } from "@/lib/engenharia/risco/tipos";
import { pousada } from "./eng-fixtures";

/**
 * Requisitos de SPDA (NBR 5419-3:2026) e de DPS (NBR 5419-1 e 5419-4:2026)
 * que saem das medidas adotadas na análise de risco.
 */

describe("SPDA — NBR 5419-3", () => {
  it("Tabelas 2, 5 e 11 por nível e número mínimo de descidas (5.4.3.1)", () => {
    const e = pousada(true); // SPDA nível I, 72 × 43 m
    const s = requisitosSpda(e)!;
    expect(s.nivel).toBe("I");
    expect(s.cartoes.map((c) => c.valor)).toEqual(["20 m", "5 × 5 m", "10 m", "10 m"]);
    expect(s.descida.join(" ")).toContain("Mínimo de 23 condutores de descida");
    expect(s.equipotencializacao.join(" ")).toContain("ki = 0,08");
    expect(s.equipotencializacao.join(" ")).toContain("kc = 0,44");
    e.estrutura.PB = "IV";
    const iv = requisitosSpda(e)!;
    expect(iv.cartoes.map((c) => c.valor)).toEqual(["60 m", "20 × 20 m", "20 m", "20 m"]);
    expect(iv.equipotencializacao.join(" ")).toContain("ki = 0,04");
  });

  it("pelo menos duas descidas, kc de duas descidas (Tabela 13)", () => {
    const e = pousada(true);
    e.estrutura.L = 4;
    e.estrutura.W = 3;
    const s = requisitosSpda(e)!;
    expect(s.descida.join(" ")).toContain("Mínimo de 2 condutores");
    expect(s.equipotencializacao.join(" ")).toContain("kc = 0,66");
  });

  it("acima de 60 m, captação lateral (5.3.2.14.2); áreas classificadas 0/1: inspeção anual (7.3.2 f)", () => {
    const e = pousada(true);
    e.estrutura.H = 75;
    e.zonas[1].rf = "explosao-z1";
    const s = requisitosSpda(e)!;
    expect(s.captacao.join(" ")).toContain("5.3.2.14.2");
    expect(s.equipotencializacao.join(" ")).toContain("a cada ano");
  });

  it("materiais citam as Tabelas 6, 7 e 8", () => {
    const n = requisitosSpda(pousada(true))!.nota;
    expect(n).toContain("Tabela 6");
    expect(n).toContain("Tabela 7");
    expect(n).toContain("Tabela 8");
  });
});

describe("DPS — corrente de impulso (NBR 5419-1, Anexo E; NBR 5419-4, D.3.2)", () => {
  it("NP I, uma linha trifásica com neutro: 25 kA por condutor (D.3.2.1 e Tabela E.1)", () => {
    const d = requisitosDps(pousada(true))!.dimensionamento; // SPDA I, DPS NP II
    expect(d.npCorrente).toBe("I");
    expect(d.total).toBe(200);
    expect(d.porCondutor[0].s1).toBeCloseTo(25, 9);
    expect(d.porCondutor[0].adotado).toBe(25);
  });

  it("o NP do DPS prevalece quando é mais rigoroso que o do SPDA", () => {
    const e = pousada(true);
    e.estrutura.PB = "III";
    e.estrutura.PEB = "I";
    const d = requisitosDps(e)!.dimensionamento;
    expect(d.npCorrente).toBe("I");
    expect(d.total).toBe(200);
  });

  it("três linhas metálicas: 8,3 kA pela divisão (D.3.2.2), mas vale o mínimo de 12,5 kA da NBR 5410", () => {
    const e = pousada(true);
    e.estrutura.PEB = "I";
    e.linhas = [
      { ...novaLinha("energia", 1), condutores: 4 },
      { ...novaLinha("sinal", 1), condutores: 2 },
      { ...novaLinha("sinal", 2), condutores: 2 },
    ];
    const d = requisitosDps(e)!.dimensionamento;
    const energia = d.porCondutor[0];
    expect(energia.s1!).toBeCloseTo(200 / 2 / 3 / 4, 9);
    expect(energia.exigido).toBe(12.5);
    expect(energia.adotado).toBe(12.5);
  });

  it("linha de sinal segue a Tabela E.2 (2,5 kA no NP I), metade se blindada", () => {
    const e = pousada(true);
    e.estrutura.PEB = "I";
    e.linhas = [novaLinha("energia", 1), novaLinha("sinal", 1), { ...novaLinha("sinal", 2), blindagem: "1-5" }];
    const [, sinal, blindada] = requisitosDps(e)!.dimensionamento.porCondutor;
    expect(sinal.exigido).toBe(2.5);
    expect(sinal.adotado).toBeNull();
    expect(textoIimp(sinal)).toContain("IEC 61643-21");
    expect(blindada.exigido).toBe(1.25);
  });

  it("linha de energia de dois condutores: S3 dobra (Tabela E.1, nota c)", () => {
    const e = pousada(true);
    e.estrutura.PB = "IV";
    e.estrutura.PEB = "III-IV";
    e.linhas = [{ ...novaLinha("energia", 1), condutores: 2 }, novaLinha("sinal", 1), novaLinha("sinal", 2), novaLinha("sinal", 3)];
    const energia = requisitosDps(e)!.dimensionamento.porCondutor[0];
    expect(energia.s3).toBe(10);
    expect(energia.s1!).toBeCloseTo(100 / 2 / 4 / 2, 9);
    expect(energia.exigido).toBe(12.5);
  });

  it("SPDA sem DPS classe I nas linhas gera observação (NBR 5419-3, 6.2.4.2)", () => {
    const e = pousada(true);
    e.estrutura.PEB = "sem";
    expect(requisitosDps(e)).toBeNull();
    expect(observacoesNorma(e, calcularRisco(e)).join(" ")).toContain("6.2.4.2");
  });
});
