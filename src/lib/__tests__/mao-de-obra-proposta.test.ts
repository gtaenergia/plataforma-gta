import { describe, expect, it } from "vitest";
import { custoMateriaisCent, repartirPreco, resumoEquipe, type LinhaMaterial } from "@/lib/mao-de-obra/proposta";
import { custoDeLinhas } from "@/lib/mao-de-obra/motor";
import type { Funcao } from "@/lib/mao-de-obra/types";

const FUNCOES: Funcao[] = [
  { id: "f1", nome: "Eletricista", custoHora: 45 },
  { id: "f2", nome: "Ajudante", custoHora: 25 },
];

const material = (sobre: Partial<LinhaMaterial>): LinhaMaterial => ({
  tipo: "material",
  descricao: "Cabo",
  quantidade: 1,
  unidade: "un",
  valorUnitario: 0,
  ...sobre,
});

describe("custoMateriaisCent", () => {
  it("soma quantidade × unitário, linha a linha em centavos", () => {
    expect(
      custoMateriaisCent([
        material({ quantidade: 100, valorUnitario: 12.5 }),
        material({ quantidade: 2, valorUnitario: 89.9 }),
      ]),
    ).toBe(125_000 + 17_980);
  });

  it("absorve NaN e negativo como zero", () => {
    expect(custoMateriaisCent([material({ quantidade: NaN, valorUnitario: 10 }), material({ quantidade: 2, valorUnitario: -5 })])).toBe(0);
  });
});

describe("resumoEquipe", () => {
  it("descreve as linhas válidas e cala as vazias", () => {
    const { linhas } = custoDeLinhas(
      [
        { funcaoId: "f1", pessoas: 2, horas: 40 },
        { funcaoId: "f2", pessoas: 1, horas: 40 },
        { funcaoId: "f1", pessoas: 1, horas: 0 }, // sem horas — fora
        { funcaoId: "inexistente", pessoas: 1, horas: 8 }, // função apagada — fora
      ],
      FUNCOES,
    );
    expect(resumoEquipe(linhas)).toBe("2 Eletricistas × 40 h · 1 Ajudante × 40 h");
  });
});

describe("repartirPreco", () => {
  it("divide na proporção do custo e a soma fecha exata", () => {
    // custo MO 3.000, materiais 1.000 → materiais levam 1/4 do preço.
    const r = repartirPreco(1_000_000, 300_000, 100_000);
    expect(r).toEqual({ maoDeObraCent: 750_000, materiaisCent: 250_000 });
    expect(r.maoDeObraCent + r.materiaisCent).toBe(1_000_000);
  });

  it("o resto do arredondamento cai na mão de obra", () => {
    const r = repartirPreco(1001, 500, 500);
    expect(r.maoDeObraCent + r.materiaisCent).toBe(1001);
    expect(r.materiaisCent).toBe(501); // round(1001/2) = 501
    expect(r.maoDeObraCent).toBe(500);
  });

  it("sem materiais, tudo é mão de obra; sem mão de obra, tudo é material", () => {
    expect(repartirPreco(5000, 1000, 0)).toEqual({ maoDeObraCent: 5000, materiaisCent: 0 });
    expect(repartirPreco(5000, 0, 1000)).toEqual({ maoDeObraCent: 0, materiaisCent: 5000 });
    expect(repartirPreco(5000, 0, 0)).toEqual({ maoDeObraCent: 5000, materiaisCent: 0 });
  });
});
