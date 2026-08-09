import { describe, expect, it } from "vitest";
import {
  atividades,
  conversoes,
  noPeriodo,
  PERIODO_TUDO,
  pipelinePorEtapa,
  porFonte,
  porProduto,
  porResponsavel,
  type FiltroRelatorio,
} from "@/lib/crm/relatorios";
import type { Funil, Negociacao, TarefaCrm } from "@/lib/crm/types";

/** Negociação mínima válida — os testes só mexem no que importa a cada caso. */
function neg(sobre: Partial<Negociacao>): Negociacao {
  return {
    id: crypto.randomUUID(),
    nome: "N",
    funilId: "f1",
    etapaId: "e1",
    valor: 0,
    empresaId: "",
    empresaNome: "",
    contatoIds: [],
    responsavel: "ana@gta.com",
    responsavelNome: "Ana",
    fonteId: "",
    fonteNome: "",
    situacao: "aberta",
    motivoPerdaId: "",
    motivoPerdaNome: "",
    previsao: "",
    qualificacao: 0,
    produtos: [],
    anotacoes: [],
    fechadoEm: "",
    fechadoPor: "",
    criadoPor: "ana@gta.com",
    criadoEm: "2026-08-01T10:00:00.000Z",
    atualizadoEm: "2026-08-01T10:00:00.000Z",
    ...sobre,
  };
}

const FUNIL: Funil = {
  id: "f1",
  nome: "Funil",
  etapas: [
    { id: "e1", nome: "Sem contato" },
    { id: "e2", nome: "Proposta" },
  ],
  criadoEm: "2026-01-01",
  atualizadoEm: "2026-01-01",
};

const AGOSTO: FiltroRelatorio = { periodo: { inicio: "2026-08-01", fim: "2026-08-31" }, funilId: "", responsavel: "" };

describe("noPeriodo", () => {
  it("compara só o dia, com limites inclusivos", () => {
    expect(noPeriodo("2026-08-01T23:59:00Z", { inicio: "2026-08-01", fim: "2026-08-31" })).toBe(true);
    expect(noPeriodo("2026-07-31T10:00:00Z", { inicio: "2026-08-01", fim: "" })).toBe(false);
    expect(noPeriodo("2026-09-01", { inicio: "", fim: "2026-08-31" })).toBe(false);
    expect(noPeriodo("", PERIODO_TUDO)).toBe(false);
  });
});

describe("pipelinePorEtapa", () => {
  it("fotografa abertas e pausadas na ordem do funil, ignorando fechadas", () => {
    const linhas = pipelinePorEtapa(
      [
        neg({ etapaId: "e1", valor: 100 }),
        neg({ etapaId: "e1", valor: 50, situacao: "pausada" }),
        neg({ etapaId: "e2", valor: 999, situacao: "ganha" }),
        neg({ etapaId: "e1", valor: 10, funilId: "outro" }),
      ],
      FUNIL,
    );
    expect(linhas.map((l) => l.quantidade)).toEqual([2, 0]);
    expect(linhas[0].valor).toBe(150);
  });
});

describe("conversoes", () => {
  it("criadas por criadoEm, fechadas por fechadoEm — meses diferentes não se misturam", () => {
    const r = conversoes(
      [
        neg({ criadoEm: "2026-06-10T00:00:00Z", situacao: "ganha", fechadoEm: "2026-08-05T00:00:00Z", valor: 1000 }),
        neg({ criadoEm: "2026-08-02T00:00:00Z" }),
        neg({ criadoEm: "2026-08-03T00:00:00Z", situacao: "perdida", fechadoEm: "2026-08-20T00:00:00Z", motivoPerdaNome: "Preço" }),
        neg({ criadoEm: "2026-05-01T00:00:00Z", situacao: "perdida", fechadoEm: "2026-05-15T00:00:00Z", motivoPerdaNome: "Preço" }),
      ],
      AGOSTO,
    );
    expect(r.criadas).toBe(2); // a de junho e a de maio ficam fora
    expect(r.ganhas).toBe(1);
    expect(r.perdidas).toBe(1);
    expect(r.valorGanho).toBe(1000);
    expect(r.taxa).toBe(0.5);
    expect(r.motivos).toEqual([{ nome: "Preço", quantidade: 1 }]);
  });

  it("sem fechamento no período, a taxa é null — não zero", () => {
    expect(conversoes([neg({})], AGOSTO).taxa).toBeNull();
  });
});

describe("porFonte", () => {
  it("agrupa criadas no período pela fonte, com rótulo para as sem fonte", () => {
    const r = porFonte(
      [
        neg({ fonteNome: "Site", valor: 100 }),
        neg({ fonteNome: "Site", valor: 200, situacao: "ganha", fechadoEm: "2026-08-10T00:00:00Z" }),
        neg({ valor: 50 }),
      ],
      AGOSTO,
    );
    expect(r[0]).toMatchObject({ chave: "Site", criadas: 2, ganhas: 1, valor: 300 });
    expect(r[1].chave).toBe("Sem fonte");
  });
});

describe("porResponsavel", () => {
  it("calcula ganhas, valor e ticket médio por pessoa", () => {
    const r = porResponsavel(
      [
        neg({ situacao: "ganha", fechadoEm: "2026-08-10T00:00:00Z", valor: 300 }),
        neg({ situacao: "ganha", fechadoEm: "2026-08-11T00:00:00Z", valor: 100 }),
        neg({ responsavelNome: "Beto", responsavel: "beto@gta.com", situacao: "perdida", fechadoEm: "2026-08-12T00:00:00Z" }),
      ],
      AGOSTO,
    );
    const ana = r.find((l) => l.responsavel === "Ana")!;
    expect(ana).toMatchObject({ ganhas: 2, valorGanho: 400, ticketMedio: 200 });
    expect(r.find((l) => l.responsavel === "Beto")).toMatchObject({ perdidas: 1, ticketMedio: 0 });
  });
});

describe("porProduto", () => {
  it("soma quantidades e valor com desconto, e separa o que está em ganhas", () => {
    const item = { produtoId: "p", nome: "Projeto", preco: 100, quantidade: 2, desconto: 10, tipoDesconto: "percentual" as const, recorrencia: "unico" as const };
    const r = porProduto(
      [
        neg({ produtos: [item] }),
        neg({ produtos: [{ ...item, quantidade: 1, desconto: 0 }], situacao: "ganha", fechadoEm: "2026-08-10T00:00:00Z" }),
      ],
      AGOSTO,
    );
    expect(r).toEqual([{ nome: "Projeto", quantidade: 3, valor: 280, valorMensal: 0, emGanhas: 1 }]);
  });

  it("mensalidade fica em coluna própria — somá-la ao único faria R$ dizer duas coisas", () => {
    const r = porProduto(
      [
        neg({
          produtos: [
            { produtoId: "p1", nome: "Instalação", preco: 8000, quantidade: 1, desconto: 0, tipoDesconto: "valor", recorrencia: "unico" },
            { produtoId: "p2", nome: "Manutenção", preco: 900, quantidade: 1, desconto: 0, tipoDesconto: "valor", recorrencia: "mensal" },
          ],
        }),
      ],
      AGOSTO,
    );
    expect(r.find((l) => l.nome === "Instalação")).toMatchObject({ valor: 8000, valorMensal: 0 });
    expect(r.find((l) => l.nome === "Manutenção")).toMatchObject({ valor: 0, valorMensal: 900 });
  });
});

describe("atividades", () => {
  const tarefa = (sobre: Partial<TarefaCrm>): TarefaCrm => ({
    id: crypto.randomUUID(),
    negociacaoId: "n1",
    negociacaoNome: "N",
    tipo: "ligacao",
    assunto: "A",
    data: "2026-08-05",
    hora: "",
    notas: "",
    responsavel: "ana@gta.com",
    responsavelNome: "Ana",
    concluida: false,
    concluidaEm: "",
    criadoPor: "ana@gta.com",
    criadoEm: "2026-08-01T00:00:00.000Z",
    atualizadoEm: "2026-08-01T00:00:00.000Z",
    ...sobre,
  });

  it("conta concluídas, pendentes e atrasadas por tipo", () => {
    const r = atividades(
      [
        tarefa({ concluida: true }),
        tarefa({ data: "2026-08-04" }), // pendente atrasada
        tarefa({ tipo: "reuniao", data: "2026-08-20" }), // pendente futura
        tarefa({ data: "2026-09-10" }), // fora do período
      ],
      AGOSTO,
      "2026-08-07",
    );
    expect(r).toMatchObject({ total: 3, concluidas: 1, pendentes: 2, atrasadas: 1 });
    expect(r.porTipo.find((t) => t.tipo === "ligacao")).toMatchObject({ total: 2, concluidas: 1 });
  });
});
