import { describe, expect, it } from "vitest";
import { contasPorDia, eventos, meses, projetar, totaisDoMes } from "@/lib/financeiro/motor";
import { receitasDoCrm } from "@/lib/financeiro/crm";
import { ehSocioComAcessoInicial } from "@/lib/financeiro/acesso-inicial";
import type { Lancamento, ReceitaCrm, Recorrente } from "@/lib/financeiro/tipos";

/**
 * O motor é o do artefato "GTA Controle Financeiro", portado. Estes casos
 * prendem as regras que os sócios já conferiam lá — e a regra nova do CRM.
 */

const HOJE = "2026-11-24";

const lanc = (p: Partial<Lancamento> & Pick<Lancamento, "id" | "k" | "valor" | "data">): Lancamento => ({
  desc: p.id,
  nat: "variavel",
  cat: "Outros",
  quem: "",
  proj: "",
  pago: false,
  ...p,
});

const rec = (p: Partial<Recorrente> & Pick<Recorrente, "id" | "k" | "valor" | "dia" | "ini">): Recorrente => ({
  desc: p.id,
  fim: null,
  nat: "fixo",
  cat: "Outros",
  quem: "",
  proj: "",
  ...p,
});

const base = { lanc: [] as Lancamento[], rec: [] as Recorrente[], crm: [] as ReceitaCrm[], prazoCrmDias: 30 };

describe("eventos", () => {
  it("gera um lançamento por mês do recorrente, no dia certo, até o fim", () => {
    const evs = eventos({ ...base, rec: [rec({ id: "aluguel", k: "d", valor: 1000, dia: 31, ini: "2027-01", fim: "2027-03" })] }, HOJE);
    expect(evs.map((e) => e.data)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
    expect(evs.every((e) => e.virt && e.nat === "fixo")).toBe(true);
  });

  it("recorrente sem fim vai até dezembro do ano seguinte", () => {
    const evs = eventos({ ...base, rec: [rec({ id: "x", k: "d", valor: 10, dia: 5, ini: "2026-12" })] }, HOJE);
    expect(evs.at(-1)!.data).toBe("2027-12-05");
    expect(evs).toHaveLength(13);
  });

  it("a ocorrência editada ou pulada substitui a do recorrente naquele mês", () => {
    const evs = eventos(
      {
        ...base,
        rec: [rec({ id: "pl", k: "d", valor: 6000, dia: 5, ini: "2026-12", fim: "2027-02" })],
        lanc: [
          lanc({ id: "edit", k: "d", valor: 5000, data: "2026-12-07", rec: "pl", mes: "2026-12" }),
          lanc({ id: "pula", k: "d", valor: 6000, data: "2027-01-05", rec: "pl", mes: "2027-01", skip: true }),
        ],
      },
      HOJE,
    );
    expect(evs.map((e) => [e.id, e.data, e.valor])).toEqual([
      ["edit", "2026-12-07", 5000],
      ["pl|2027-02", "2027-02-05", 6000],
    ]);
  });

  it("em aberto vencido vai para hoje e fica atrasado", () => {
    const [e] = eventos({ ...base, lanc: [lanc({ id: "a", k: "d", valor: 100, data: "2026-11-20" })] }, HOJE);
    expect(e.atras).toBe(true);
    expect(e.eff).toBe(HOJE);
  });
});

describe("projetar", () => {
  it("parte do saldo conferido e ignora o que foi pago até a âncora", () => {
    const evs = eventos(
      {
        ...base,
        lanc: [
          lanc({ id: "pago-antes", k: "d", valor: 500, data: "2026-11-20", pago: true, pagoEm: "2026-11-20" }),
          lanc({ id: "entra", k: "r", valor: 1000, data: "2026-11-26" }),
          lanc({ id: "sai", k: "d", valor: 300, data: "2026-11-26" }),
        ],
      },
      HOJE,
    );
    const serie = projetar(evs, { data: "2026-11-21", valor: 3985.88 }, HOJE);
    expect(serie[0].d).toBe("2026-11-21");
    expect(serie.find((p) => p.d === "2026-11-25")!.bal).toBe(3985.88);
    expect(serie.find((p) => p.d === "2026-11-26")!.bal).toBe(4685.88);
  });

  it("mês a mês: saldo inicial, final e o pior dia", () => {
    const evs = eventos(
      { ...base, lanc: [lanc({ id: "s", k: "d", valor: 5000, data: "2026-12-05" }), lanc({ id: "e", k: "r", valor: 8000, data: "2026-12-15" })] },
      HOJE,
    );
    const serie = projetar(evs, { data: HOJE, valor: 1000 }, HOJE);
    const dez = meses(serie, { data: HOJE, valor: 1000 }).find((m) => m.m === "2026-12")!;
    expect(dez).toMatchObject({ ini: 1000, in: 8000, out: 5000, fim: 4000, min: -4000, minD: "2026-12-05" });
  });

  it("contas por dia: saldo antes de pagar é o do fim do dia anterior", () => {
    const evs = eventos(
      { ...base, lanc: [lanc({ id: "s", k: "d", valor: 700, data: "2026-12-05", nat: "fixo" }), lanc({ id: "e", k: "r", valor: 200, data: "2026-12-05" })] },
      HOJE,
    );
    const serie = projetar(evs, { data: HOJE, valor: 500 }, HOJE);
    const [dia] = contasPorDia(serie, { data: HOJE, valor: 500 }, HOJE);
    expect(dia).toMatchObject({ d: "2026-12-05", antes: 500, tot: 700, fix: 700, vari: 0, depois: -200, inn: 200, fim: 0 });
  });
});

describe("negociação ganha no CRM", () => {
  const ganha: ReceitaCrm = {
    negociacaoId: "n1",
    nome: "Subestação Fazenda X",
    cliente: "Fazenda X",
    valor: 10000,
    mensal: 0,
    fechadoEm: "2026-11-10",
    responsavelNome: "Gabriel",
  };

  it("entra no caixa como recebimento previsto, o prazo depois do fechamento", () => {
    const evs = eventos({ ...base, crm: [ganha] }, HOJE);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ id: "crm|n1", crm: "n1", k: "r", valor: 10000, data: "2026-12-10", pago: false });
  });

  it("parcelas lançadas (planejadas ou recebidas) abatem o previsto", () => {
    const evs = eventos(
      {
        ...base,
        crm: [ganha],
        lanc: [
          lanc({ id: "p1", k: "r", valor: 3000, data: "2026-11-20", pago: true, pagoEm: "2026-11-20", negociacaoId: "n1" }),
          lanc({ id: "p2", k: "r", valor: 2000, data: "2027-01-10", negociacaoId: "n1" }),
        ],
      },
      HOJE,
    );
    expect(evs.find((e) => e.crm)!.valor).toBe(5000);
  });

  it("quitada, some do previsto", () => {
    const evs = eventos({ ...base, crm: [ganha], lanc: [lanc({ id: "p", k: "r", valor: 10000, data: "2026-12-01", negociacaoId: "n1" })] }, HOJE);
    expect(evs.some((e) => e.crm)).toBe(false);
  });

  it("só negociação GANHA conta; o dia do fechamento é o de Brasília", () => {
    const negs = [
      { id: "a", nome: "A", empresaNome: "Cli", valor: 1000, produtos: [], situacao: "ganha" as const, fechadoEm: "2026-12-01T01:30:00.000Z", responsavelNome: "" },
      { id: "b", nome: "B", empresaNome: "Cli", valor: 1000, produtos: [], situacao: "aberta" as const, fechadoEm: "", responsavelNome: "" },
      { id: "c", nome: "C", empresaNome: "Cli", valor: 1000, produtos: [], situacao: "perdida" as const, fechadoEm: "2026-12-01T12:00:00.000Z", responsavelNome: "" },
    ];
    const r = receitasDoCrm(negs);
    expect(r.map((x) => x.negociacaoId)).toEqual(["a"]);
    // 01:30 UTC do dia 1º = 22:30 do dia 30/11 em Brasília
    expect(r[0].fechadoEm).toBe("2026-11-30");
  });

  it("separa a parte mensal dos produtos (ela vira recorrente, não entra de uma vez)", () => {
    const [r] = receitasDoCrm([
      {
        id: "m",
        nome: "Manutenção",
        empresaNome: "Cli",
        valor: 0,
        situacao: "ganha",
        fechadoEm: "2026-11-10T15:00:00.000Z",
        responsavelNome: "",
        produtos: [
          { produtoId: "1", nome: "Projeto", preco: 8000, quantidade: 1, desconto: 0, tipoDesconto: "valor", recorrencia: "unico" },
          { produtoId: "2", nome: "Manutenção", preco: 1500, quantidade: 1, desconto: 0, tipoDesconto: "valor", recorrencia: "mensal" },
        ],
      },
    ]);
    expect(r).toMatchObject({ valor: 8000, mensal: 1500 });
  });
});

describe("totais do mês", () => {
  it("soma entradas e saídas pelo vencimento, separando o que já passou pelo banco", () => {
    const evs = eventos(
      {
        ...base,
        lanc: [
          lanc({ id: "r1", k: "r", valor: 1000, data: "2026-12-02", pago: true, pagoEm: "2026-12-02" }),
          lanc({ id: "r2", k: "r", valor: 500, data: "2026-12-20" }),
          lanc({ id: "d1", k: "d", valor: 300, data: "2026-12-05" }),
          lanc({ id: "fora", k: "d", valor: 999, data: "2027-01-05" }),
        ],
      },
      HOJE,
    );
    expect(totaisDoMes(evs, "2026-12")).toEqual({
      entradas: 1500,
      recebido: 1000,
      aReceber: 500,
      saidas: 300,
      pago: 0,
      aPagar: 300,
      resultado: 1200,
      nEntradas: 2,
      nSaidas: 1,
    });
  });
});

describe("acesso inicial ao Financeiro", () => {
  it("casa os três sócios pelo começo do nome", () => {
    for (const n of ["Tito", "Tito Alves", "gabriel", "Gabriel S.", "Paulo Vitor", "Paulo Víctor Souza", "PV"]) expect(ehSocioComAcessoInicial(n), n).toBe(true);
  });
  it("não dá acesso por engano", () => {
    for (const n of ["Paulo", "Paulo Henrique", "Matheus", "Administrador", "Titoneli", "Ana Gabriela"]) expect(ehSocioComAcessoInicial(n), n).toBe(false);
  });
});
