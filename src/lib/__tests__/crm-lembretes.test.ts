import { describe, expect, it } from "vitest";
import { cobrancasDoDia, textoDaCobranca } from "@/lib/crm/lembretes";
import type { Negociacao, TarefaCrm } from "@/lib/crm/types";

const HOJE = "2026-08-10";

const neg = (sobre: Partial<Negociacao>): Negociacao => ({
  id: "n1", nome: "Negociação", funilId: "f", etapaId: "e", valor: 0,
  empresaId: "", empresaNome: "", contatoIds: [],
  responsavel: "ana@gta.com", responsavelNome: "Ana",
  fonteId: "", fonteNome: "", situacao: "aberta",
  motivoPerdaId: "", motivoPerdaNome: "", previsao: "", qualificacao: 0,
  produtos: [], anotacoes: [], fechadoEm: "", fechadoPor: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

const tar = (sobre: Partial<TarefaCrm>): TarefaCrm => ({
  id: "t1", negociacaoId: "n1", negociacaoNome: "Negociação",
  tipo: "ligacao", assunto: "Ligar", data: HOJE, hora: "", notas: "",
  responsavel: "ana@gta.com", responsavelNome: "Ana",
  concluida: false, concluidaEm: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

describe("cobrancasDoDia — tarefas vencidas", () => {
  it("a de ontem cobra; a de HOJE não — ainda dá tempo de fazer", () => {
    const c = cobrancasDoDia([], [tar({ id: "a", data: "2026-08-09" }), tar({ id: "b", data: HOJE })], HOJE);
    expect(c).toHaveLength(1);
    expect(c[0].vencidas.map((t) => t.id)).toEqual(["a"]);
  });

  it("concluída não cobra, por mais antiga que seja", () => {
    expect(cobrancasDoDia([], [tar({ data: "2026-01-01", concluida: true })], HOJE)).toEqual([]);
  });

  it("a mais antiga vem primeiro — é a que mais esfriou", () => {
    const c = cobrancasDoDia([], [
      tar({ id: "nova", data: "2026-08-09" }),
      tar({ id: "velha", data: "2026-07-02" }),
    ], HOJE);
    expect(c[0].vencidas.map((t) => t.id)).toEqual(["velha", "nova"]);
  });
});

describe("cobrancasDoDia — negociações sem próximo passo", () => {
  it("em aberto e sem tarefa pendente entra na cobrança", () => {
    const c = cobrancasDoDia([neg({ id: "sozinha", nome: "Sozinha" })], [], HOJE);
    expect(c[0].semProximoPasso.map((n) => n.id)).toEqual(["sozinha"]);
  });

  it("com tarefa pendente NÃO entra — mesmo que a tarefa seja lá na frente", () => {
    const c = cobrancasDoDia([neg({ id: "n1" })], [tar({ negociacaoId: "n1", data: "2026-12-01" })], HOJE);
    expect(c).toEqual([]);
  });

  it("tarefa CONCLUÍDA não conta como próximo passo — o passo já foi dado", () => {
    const c = cobrancasDoDia([neg({ id: "n1" })], [tar({ negociacaoId: "n1", concluida: true })], HOJE);
    expect(c[0].semProximoPasso.map((n) => n.id)).toEqual(["n1"]);
  });

  it("pausada fica de fora: pausar é dizer 'não mexa agora'", () => {
    expect(cobrancasDoDia([neg({ situacao: "pausada" })], [], HOJE)).toEqual([]);
  });

  it("ganha e perdida também ficam de fora", () => {
    expect(cobrancasDoDia([neg({ situacao: "ganha" }), neg({ id: "x", situacao: "perdida" })], [], HOJE)).toEqual([]);
  });

  it("mais parada primeiro", () => {
    const c = cobrancasDoDia([
      neg({ id: "recente", atualizadoEm: "2026-08-09T00:00:00.000Z" }),
      neg({ id: "parada", atualizadoEm: "2026-06-01T00:00:00.000Z" }),
    ], [], HOJE);
    expect(c[0].semProximoPasso.map((n) => n.id)).toEqual(["parada", "recente"]);
  });
});

describe("cobrancasDoDia — um recado por pessoa", () => {
  it("agrupa por responsável, sem duplicar por e-mail com caixa diferente", () => {
    const c = cobrancasDoDia(
      [neg({ id: "n1", responsavel: "ana@gta.com" }), neg({ id: "n2", responsavel: "Ana@GTA.com" })],
      // A tarefa é de OUTRA negociação: se apontasse para n1, ela seria o
      // próximo passo de n1 e a cobrança cairia para uma só — que é o
      // comportamento certo, mas não é o que este caso quer medir.
      [tar({ id: "t", negociacaoId: "antiga", data: "2026-08-01", responsavel: "ana@gta.com" })],
      HOJE,
    );
    expect(c).toHaveLength(1);
    expect(c[0].semProximoPasso).toHaveLength(2);
    expect(c[0].vencidas).toHaveLength(1);
  });

  it("quem não tem nada a fazer não recebe nada", () => {
    const c = cobrancasDoDia(
      [neg({ id: "n1", responsavel: "ana@gta.com" })],
      [tar({ negociacaoId: "n1", data: "2026-12-01", responsavel: "beto@gta.com", responsavelNome: "Beto" })],
      HOJE,
    );
    expect(c.map((x) => x.email)).toEqual([]);
  });

  it("sem responsável, cai em quem criou — a negociação não fica órfã da cobrança", () => {
    const c = cobrancasDoDia([neg({ responsavel: "", criadoPor: "chefe@gta.com" })], [], HOJE);
    expect(c[0].email).toBe("chefe@gta.com");
  });
});

describe("textoDaCobranca", () => {
  it("uma tarefa só: diz qual é", () => {
    const c = cobrancasDoDia([], [tar({ data: "2026-08-01", assunto: "Enviar proposta", negociacaoNome: "Subestação" })], HOJE);
    const t = textoDaCobranca(c[0]);
    expect(t.titulo).toBe("Você tem 1 tarefa atrasada");
    expect(t.mensagem).toContain("Enviar proposta");
    expect(t.mensagem).toContain("Subestação");
  });

  it("várias: conta e mostra a mais antiga com a data", () => {
    const c = cobrancasDoDia([], [
      tar({ id: "a", data: "2026-08-01", assunto: "Primeira" }),
      tar({ id: "b", data: "2026-08-05" }),
    ], HOJE);
    const t = textoDaCobranca(c[0]);
    expect(t.titulo).toBe("Você tem 2 tarefas atrasadas");
    expect(t.mensagem).toContain("01/08");
    expect(t.mensagem).toContain("Primeira");
  });

  it("os dois sinais juntos ganham um título que cobre ambos", () => {
    const c = cobrancasDoDia([neg({ id: "n9", nome: "Parada" })], [tar({ negociacaoId: "outra", data: "2026-08-01" })], HOJE);
    const t = textoDaCobranca(c[0]);
    expect(t.titulo).toBe("Seu comercial precisa de atenção");
    expect(t.mensagem).toContain("atrasada");
    expect(t.mensagem).toContain("sem próximo passo");
  });

  it("lista até duas negociações e resume o resto", () => {
    const c = cobrancasDoDia(
      [neg({ id: "a", nome: "A" }), neg({ id: "b", nome: "B" }), neg({ id: "c", nome: "C" })],
      [], HOJE,
    );
    expect(textoDaCobranca(c[0]).mensagem).toContain("e mais 1");
  });
});
