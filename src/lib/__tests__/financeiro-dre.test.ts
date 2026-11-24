import { describe, expect, it } from "vitest";
import { calcularDre, depreciacaoDoAno } from "@/lib/financeiro/dre";
import { eventos } from "@/lib/financeiro/motor";
import { CONFIG_PADRAO, type ConfigFinanceiro, type Lancamento, type ReceitaCrm, type Recorrente } from "@/lib/financeiro/tipos";

/**
 * DRE na sequência da aba DRE-BP-DFC da planilha de Gestão Financeira.
 * Competência: negociação ganha conta no mês do fechamento; o recebimento
 * dela no caixa não conta de novo.
 */

const HOJE = "2026-11-24";
const semBens: ConfigFinanceiro = { ...CONFIG_PADRAO, bens: [] };

const l = (p: Partial<Lancamento> & Pick<Lancamento, "id" | "k" | "valor" | "data" | "cat">): Lancamento => ({
  desc: p.id,
  nat: "variavel",
  quem: "",
  proj: "",
  pago: false,
  ...p,
});

function dre(lanc: Lancamento[], crm: ReceitaCrm[] = [], cfg = semBens, rec: Recorrente[] = []) {
  const evs = eventos({ lanc, rec, crm, prazoCrmDias: cfg.prazoCrmDias }, HOJE);
  const d = calcularDre(evs, crm, cfg, 2026);
  return (k: string) => d.linhas.find((x) => x.key === k)!;
}

const dez = (linha: { valores: number[] }) => linha.valores[11];

describe("DRE", () => {
  it("segue a sequência da planilha", () => {
    const L = calcularDre([], [], semBens, 2026).linhas.filter((x) => x.tipo !== "sub").map((x) => x.key);
    expect(L).toEqual([
      "fb", "i", "c", "fl", "csv", "lb", "mb", "opex", "dv", "mc", "mcp", "df", "ebitda", "ebitdap", "rf", "da", "lair", "il", "ll", "mlp",
      "fora:retirada", "fora:invest", "fora:emprest",
    ]);
  });

  it("negociação ganha entra no mês do fechamento, e o recebimento dela não conta de novo", () => {
    const crm: ReceitaCrm[] = [{ negociacaoId: "n1", nome: "SE", cliente: "X", valor: 20000, mensal: 0, fechadoEm: "2026-11-10", responsavelNome: "" }];
    const L = dre(
      [
        l({ id: "parcela", k: "r", valor: 8000, data: "2026-12-10", cat: "Projetos", negociacaoId: "n1", pago: true, pagoEm: "2026-12-10" }),
        l({ id: "avulso", k: "r", valor: 3000, data: "2026-12-15", cat: "Laudos e medições" }),
      ],
      crm,
    );
    expect(L("fb").valores[10]).toBe(20000); // novembro
    expect(L("fb:crm").valores[10]).toBe(20000);
    expect(dez(L("fb"))).toBe(3000); // dezembro: só o avulso
    expect(L("fb").total).toBe(23000);
  });

  it("recebimento ligado a negociação que deixou de estar ganha volta a contar", () => {
    const L = dre([l({ id: "p", k: "r", valor: 5000, data: "2026-12-10", cat: "Projetos", negociacaoId: "reaberta" })]);
    expect(dez(L("fb"))).toBe(5000);
  });

  it("calcula a cascata: FL, LB, MC, EBITDA, LAIR e LL", () => {
    const L = dre([
      l({ id: "fat", k: "r", valor: 10000, data: "2026-12-01", cat: "Projetos" }),
      l({ id: "imp", k: "d", valor: 600, data: "2026-12-20", cat: "Impostos sobre faturamento" }),
      l({ id: "csv", k: "d", valor: 3000, data: "2026-12-10", cat: "Terceiros e parceiros" }),
      l({ id: "comb", k: "d", valor: 400, data: "2026-12-10", cat: "Deslocamento e combustível" }),
      l({ id: "fixa", k: "d", valor: 2000, data: "2026-12-05", cat: "Equipe" }),
      l({ id: "juros", k: "r", valor: 100, data: "2026-12-28", cat: "Rendimentos e juros" }),
      l({ id: "tarifa", k: "d", valor: 50, data: "2026-12-28", cat: "Juros e tarifas bancárias" }),
      l({ id: "cartao", k: "d", valor: 900, data: "2026-12-10", cat: "Cartões de crédito" }),
    ]);
    expect(dez(L("fb"))).toBe(10000);
    expect(dez(L("i"))).toBe(600);
    expect(dez(L("fl"))).toBe(9400);
    expect(dez(L("lb"))).toBe(6400);
    expect(dez(L("mb"))).toBeCloseTo(6400 / 9400, 6);
    expect(dez(L("dv"))).toBe(400);
    expect(dez(L("dv:combustivel"))).toBe(400);
    expect(dez(L("mc"))).toBe(6000);
    expect(dez(L("df"))).toBe(2000);
    expect(dez(L("opex"))).toBe(2400);
    expect(dez(L("ebitda"))).toBe(4000);
    expect(dez(L("rf"))).toBe(50);
    // A planilha subtraía RF inteiro; aqui o resultado financeiro entra com o próprio sinal.
    expect(dez(L("lair"))).toBe(4050);
    expect(dez(L("ll"))).toBe(4050);
    // Cartão de crédito é retirada dos sócios: sai do caixa, não do resultado.
    expect(dez(L("fora:retirada"))).toBe(900);
  });

  it("despesa fixa se abre por descrição, como na planilha", () => {
    const rec: Recorrente[] = [
      { id: "pl", k: "d", desc: "Pró-labore do Tito", valor: 6000, dia: 5, ini: "2026-12", fim: null, nat: "fixo", cat: "Pró-labore e sócios", quem: "", proj: "" },
    ];
    const L = dre([], [], semBens, rec);
    expect(dez(L("df"))).toBe(6000);
    expect(L("df:0").rotulo).toBe("Pró-labore do Tito");
  });

  it("a linha escolhida no lançamento vence a da categoria", () => {
    const L = dre([l({ id: "x", k: "d", valor: 2800, data: "2026-12-10", cat: "Contabilidade e impostos", dre: "impostos" })]);
    expect(dez(L("i"))).toBe(2800);
    expect(dez(L("df"))).toBe(0);
  });

  it("o mapa da configuração muda para onde a categoria vai", () => {
    const cfg: ConfigFinanceiro = { ...semBens, mapa: { d: { Alimentação: "retirada" }, r: {} } };
    const L = dre([l({ id: "ifood", k: "d", valor: 3500, data: "2026-12-05", cat: "Alimentação" })], [], cfg);
    expect(dez(L("dv:alimentacao"))).toBe(0);
    expect(dez(L("fora:retirada"))).toBe(3500);
  });

  it("depreciação: valor ÷ vida útil, a partir do mês de início", () => {
    const [analisador] = depreciacaoDoAno({ ...CONFIG_PADRAO, bens: [{ id: "a", nome: "Analisador", valor: 11000, vidaMeses: 60, inicio: "2026-03" }] }, 2026);
    expect(analisador.valores.slice(0, 2)).toEqual([0, 0]);
    expect(analisador.valores[2]).toBe(183.33);
    const [curto] = depreciacaoDoAno({ ...CONFIG_PADRAO, bens: [{ id: "b", nome: "B", valor: 300, vidaMeses: 3, inicio: "2025-11" }] }, 2026);
    expect(curto.valores).toEqual([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
