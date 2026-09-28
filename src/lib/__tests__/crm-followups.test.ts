import { describe, expect, it } from "vitest";
import {
  clienteDaTarefa,
  ehDoCliente,
  negociacaoDeReferencia,
  quemFez,
  resumoFollowUps,
  tarefasDoCliente,
} from "@/lib/crm/followups";
import { indicePreset } from "@/lib/crm/repeticao";
import type { Negociacao, TarefaCrm } from "@/lib/crm/types";

const neg = (sobre: Partial<Negociacao>): Negociacao => ({
  id: "n1", nome: "Negociação", funilId: "f", etapaId: "e", valor: 0,
  empresaId: "", empresaNome: "", contatoIds: [],
  responsavel: "ana@gta.com", responsavelNome: "Ana",
  fonteId: "", fonteNome: "", situacao: "aberta",
  motivoPerdaId: "", motivoPerdaNome: "", previsao: "", qualificacao: 0,
  produtos: [], campos: {}, anotacoes: [], fechadoEm: "", fechadoPor: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

const tar = (sobre: Partial<TarefaCrm>): TarefaCrm => ({
  id: "t1", negociacaoId: "", negociacaoNome: "", clienteId: "", clienteNome: "",
  tipo: "ligacao", assunto: "Ligar", data: "2026-10-01", hora: "", notas: "",
  responsavel: "ana@gta.com", responsavelNome: "Ana", repetirCada: 0, repetirUnidade: "",
  concluida: false, concluidaEm: "", concluidaPor: "", concluidaPorNome: "", comentario: "", proximaId: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

const FAZENDA = { id: "c1", nome: "Fazenda Rio Doce" };

describe("clienteDaTarefa", () => {
  it("a tarefa com cliente próprio responde por si", () => {
    const porId = new Map([["n1", neg({ empresaId: "outro", empresaNome: "Outro" })]]);
    expect(clienteDaTarefa(tar({ negociacaoId: "n1", clienteId: "c1", clienteNome: "Fazenda" }), porId)).toEqual({ id: "c1", nome: "Fazenda" });
  });

  it("tarefa antiga, só com negociação, fica com o cliente da negociação", () => {
    const porId = new Map([["n1", neg({ empresaId: "c1", empresaNome: "Fazenda Rio Doce" })]]);
    expect(clienteDaTarefa(tar({ negociacaoId: "n1" }), porId)).toEqual(FAZENDA);
  });
});

describe("ehDoCliente", () => {
  it("com id, só o id decide — nome igual de outro cadastro não conta", () => {
    expect(ehDoCliente({ id: "c2", nome: "Fazenda Rio Doce" }, FAZENDA)).toBe(false);
    expect(ehDoCliente({ id: "c1", nome: "Nome antigo" }, FAZENDA)).toBe(true);
  });

  it("sem id, casa pelo nome ignorando caixa e espaços nas pontas", () => {
    expect(ehDoCliente({ id: "", nome: "  fazenda rio doce " }, FAZENDA)).toBe(true);
  });

  it("sem id e sem nome não é de ninguém", () => {
    expect(ehDoCliente({ id: "", nome: "" }, FAZENDA)).toBe(false);
  });
});

describe("tarefasDoCliente", () => {
  it("junta o follow-up direto no cliente e as tarefas antigas das negociações dele", () => {
    const negociacoes = [neg({ id: "n1", empresaId: "c1" }), neg({ id: "n2", empresaId: "c9" })];
    const r = tarefasDoCliente(FAZENDA, [
      tar({ id: "direta", clienteId: "c1", clienteNome: "Fazenda Rio Doce" }),
      tar({ id: "antiga", negociacaoId: "n1" }),
      tar({ id: "de-outro", negociacaoId: "n2" }),
    ], negociacoes);
    expect(r.map((t) => t.id)).toEqual(["direta", "antiga"]);
  });
});

describe("resumoFollowUps", () => {
  it("conta os feitos, aponta o último pelo registro e o próximo pela data", () => {
    const r = resumoFollowUps([
      tar({ id: "feito-antes", concluida: true, data: "2026-09-20", concluidaEm: "2026-09-20T12:00:00.000Z" }),
      // Marcado para antes, mas feito depois: é o último contato.
      tar({ id: "feito-atrasado", concluida: true, data: "2026-09-10", concluidaEm: "2026-09-25T12:00:00.000Z" }),
      tar({ id: "depois", data: "2026-11-01" }),
      tar({ id: "logo", data: "2026-10-05" }),
    ]);
    expect(r.feitos).toBe(2);
    expect(r.ultimo?.id).toBe("feito-atrasado");
    expect(r.proximo?.id).toBe("logo");
    expect(r.pendentes.map((t) => t.id)).toEqual(["logo", "depois"]);
  });

  it("sem nada, sem números inventados", () => {
    const r = resumoFollowUps([]);
    expect(r).toMatchObject({ feitos: 0, ultimo: null, proximo: null });
  });
});

describe("negociacaoDeReferencia", () => {
  const negs = [
    neg({ id: "velha", empresaId: "c1", atualizadoEm: "2026-09-01T00:00:00.000Z" }),
    neg({ id: "viva", empresaId: "c1", atualizadoEm: "2026-10-01T00:00:00.000Z" }),
    neg({ id: "ganha", empresaId: "c1", situacao: "ganha", atualizadoEm: "2026-10-20T00:00:00.000Z" }),
    neg({ id: "alheia", empresaId: "c9", atualizadoEm: "2026-10-25T00:00:00.000Z" }),
  ];

  it("a negociação da própria tarefa, quando ela tem", () => {
    expect(negociacaoDeReferencia(tar({ negociacaoId: "velha" }), FAZENDA, negs)?.id).toBe("velha");
  });

  it("follow-up só de cliente: a negociação em andamento mexida por último", () => {
    // A ganha é mais recente, mas não diz em que etapa o cliente ESTÁ.
    expect(negociacaoDeReferencia(tar({ clienteId: "c1" }), FAZENDA, negs)?.id).toBe("viva");
  });

  it("sem nenhuma em andamento, nenhuma — melhor mostrar nada que uma etapa velha", () => {
    expect(negociacaoDeReferencia(tar({ clienteId: "c1" }), FAZENDA, [negs[2], negs[3]])).toBeNull();
  });
});

describe("indicePreset", () => {
  it("reconhece a cadência da lista e aponta a personalizada", () => {
    expect(indicePreset(0, "")).toBe(0);
    expect(indicePreset(3, "meses")).toBeGreaterThan(0);
    expect(indicePreset(5, "semanas")).toBe(-1);
  });
});

describe("quemFez", () => {
  it("quem registrou como autor; conclusão antiga cai no responsável", () => {
    expect(quemFez(tar({ concluidaPorNome: "Beto", responsavelNome: "Ana" }))).toBe("Beto");
    expect(quemFez(tar({ concluidaPor: "", concluidaPorNome: "", responsavelNome: "Ana" }))).toBe("Ana");
  });
});
