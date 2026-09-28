import { describe, expect, it } from "vitest";
import {
  montarHistorico,
  nomeComparavel,
  propostasDoCliente,
  resumoHistorico,
  type OrcamentoResumo,
  type PropostaResumo,
  type RegistroHistorico,
} from "@/lib/crm/historico";
import type { Negociacao } from "@/lib/crm/types";

const FAZENDA = { id: "c1", nome: "Fazenda Rio Doce" };

const prop = (sobre: Partial<PropostaResumo>): PropostaResumo => ({
  id: "p1", serviceKey: "spda", rotuloServico: "SPDA e Gerenciamento de Risco", cliente: "Fazenda Rio Doce",
  referencia: "GTA-2026-FAZENDARIODOCE-SPDA-001", status: "gerada", criadoEm: "2026-03-10T12:00:00.000Z",
  dataEmissao: "2026-03-12", valorDocumento: 0, negociacaoId: "",
  ...sobre,
});

const reg = (sobre: Partial<RegistroHistorico>): RegistroHistorico => ({
  id: "r1", clienteId: "c1", clienteNome: "Fazenda Rio Doce", propostaId: "", titulo: "", natureza: "",
  valor: null, solicitadoEm: "", apresentadoEm: "", resultado: "", decididoEm: "", movimento: "",
  observacoes: "", negociacaoId: "", criadoPor: "ana@gta.com", criadoEm: "", atualizadoEm: "",
  ...sobre,
});

const neg = (sobre: Partial<Negociacao>): Negociacao => ({
  id: "n1", nome: "SPDA — Galpão", funilId: "f", etapaId: "e", valor: 0,
  empresaId: "c1", empresaNome: "Fazenda Rio Doce", contatoIds: [],
  responsavel: "ana@gta.com", responsavelNome: "Ana", fonteId: "", fonteNome: "", situacao: "aberta",
  motivoPerdaId: "", motivoPerdaNome: "", previsao: "", qualificacao: 0,
  produtos: [], campos: {}, anotacoes: [], fechadoEm: "", fechadoPor: "",
  criadoPor: "ana@gta.com", criadoEm: "", atualizadoEm: "",
  ...sobre,
});

const historico = (e: {
  propostas?: PropostaResumo[];
  orcamentos?: OrcamentoResumo[];
  negociacoes?: Negociacao[];
  registros?: RegistroHistorico[];
}) =>
  montarHistorico({
    cliente: FAZENDA,
    propostas: e.propostas ?? [],
    orcamentos: e.orcamentos ?? [],
    negociacoes: e.negociacoes ?? [],
    registros: e.registros ?? [],
  });

describe("nomeComparavel", () => {
  it("ignora acento, caixa e espaço sobrando", () => {
    expect(nomeComparavel("  Fazenda   RIO Doçe ")).toBe(nomeComparavel("fazenda rio doce"));
  });
});

describe("propostasDoCliente", () => {
  it("casa pelo nome digitado no configurador, do jeito que vier escrito", () => {
    const r = propostasDoCliente(FAZENDA, [prop({ cliente: "FAZENDA RIO DÔCE" }), prop({ id: "p2", cliente: "Outro" })], [], []);
    expect(r.map((p) => p.id)).toEqual(["p1"]);
  });

  it("a negociação que pediu a proposta vence o nome digitado", () => {
    // O técnico escreveu "Galpão Rio Doce", mas o pedido veio da negociação da Fazenda.
    const r = propostasDoCliente(FAZENDA, [prop({ cliente: "Galpão Rio Doce", negociacaoId: "n1" })], [], [neg({})]);
    expect(r).toHaveLength(1);
  });

  it("negociação de OUTRO cliente tira a proposta daqui, mesmo com nome igual", () => {
    const r = propostasDoCliente(FAZENDA, [prop({ negociacaoId: "n1" })], [], [neg({ empresaId: "c9", empresaNome: "Outro" })]);
    expect(r).toHaveLength(0);
  });

  it("o vínculo feito à mão manda — inclusive para tirar", () => {
    const deOutro = propostasDoCliente(FAZENDA, [prop({})], [reg({ propostaId: "p1", clienteId: "c9" })], []);
    expect(deOutro).toHaveLength(0);
    const trazida = propostasDoCliente(FAZENDA, [prop({ cliente: "Faz. R. Doce" })], [reg({ propostaId: "p1" })], []);
    expect(trazida).toHaveLength(1);
  });
});

describe("montarHistorico — o que vem sozinho", () => {
  it("serviço, referência, datas e a natureza sugerida pelo serviço", () => {
    const [l] = historico({ propostas: [prop({})] });
    expect(l).toMatchObject({
      origem: "proposta",
      titulo: "SPDA e Gerenciamento de Risco",
      natureza: "projeto",
      naturezaAutomatica: true,
      solicitadoEm: "2026-03-10",
      propostaEm: "2026-03-12",
      resultado: "em_aberto",
      registroId: "",
    });
  });

  it("proposta antiga cadastrada hoje: o pedido é da data dela, não de hoje", () => {
    const [l] = historico({ propostas: [prop({ criadoEm: "2026-09-28T12:00:00.000Z", dataEmissao: "2026-03-12" })] });
    expect(l.solicitadoEm).toBe("2026-03-12");
    expect(l.automatico.solicitadoEm).toBe("2026-03-12");
  });

  it("serviço ambíguo não ganha natureza chutada", () => {
    const [l] = historico({ propostas: [prop({ serviceKey: "rede-mt" })] });
    expect(l.natureza).toBe("");
  });

  it("o valor da esteira vence o do documento; sem esteira, vale o do documento", () => {
    const [comEsteira] = historico({
      propostas: [prop({ valorDocumento: 10000 })],
      orcamentos: [{ propostaId: "p1", valor: 12000, estacao: "aprovado" }],
    });
    expect(comEsteira).toMatchObject({ valor: 12000, valorAutomatico: true, estacaoOrcamento: "aprovado" });
    const [soDocumento] = historico({ propostas: [prop({ valorDocumento: 10000 })] });
    expect(soDocumento.valor).toBe(10000);
  });

  it("negociação ganha fecha o pedido sozinha, com a data do fechamento", () => {
    const [l] = historico({
      propostas: [prop({ negociacaoId: "n1" })],
      negociacoes: [neg({ situacao: "ganha", fechadoEm: "2026-04-02T15:00:00.000Z" })],
    });
    expect(l).toMatchObject({ resultado: "fechado", resultadoAutomatico: true, decididoEm: "2026-04-02" });
  });
});

describe("montarHistorico — o que o comercial escreve", () => {
  it("o registro vence o automático, campo a campo", () => {
    const [l] = historico({
      propostas: [prop({ valorDocumento: 10000 })],
      registros: [reg({
        propostaId: "p1", natureza: "execucao", valor: 9500, apresentadoEm: "2026-03-15",
        resultado: "fechado", decididoEm: "2026-03-20", movimento: "cross_sell", observacoes: "Fechou com desconto.",
      })],
    });
    expect(l).toMatchObject({
      natureza: "execucao", naturezaAutomatica: false,
      valor: 9500, valorAutomatico: false,
      apresentadoEm: "2026-03-15", resultado: "fechado", resultadoAutomatico: false, decididoEm: "2026-03-20",
      movimento: "cross_sell", observacoes: "Fechou com desconto.",
    });
    // O automático continua disponível para o formulário mostrar.
    expect(l.automatico).toMatchObject({ natureza: "projeto", valor: 10000 });
  });

  it("campo vazio no registro continua automático — o resultado acompanha a negociação", () => {
    const [l] = historico({
      propostas: [prop({ negociacaoId: "n1" })],
      negociacoes: [neg({ situacao: "perdida", fechadoEm: "2026-05-01T00:00:00.000Z" })],
      registros: [reg({ propostaId: "p1", apresentadoEm: "2026-04-20" })],
    });
    expect(l).toMatchObject({ resultado: "nao_fechado", resultadoAutomatico: true, apresentadoEm: "2026-04-20" });
  });

  it("pedido avulso entra com o que foi escrito, e só no cliente dele", () => {
    const linhas = historico({
      registros: [
        reg({ id: "a1", titulo: "Consultoria tarifária", natureza: "consultoria", valor: 3000, solicitadoEm: "2025-11-05" }),
        reg({ id: "a2", clienteId: "c9", titulo: "De outro cliente" }),
      ],
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ origem: "avulso", titulo: "Consultoria tarifária", valor: 3000, resultado: "em_aberto" });
  });

  it("mais recente primeiro; sem data, no fim", () => {
    const linhas = historico({
      propostas: [prop({ id: "p-mar", criadoEm: "2026-03-10T00:00:00.000Z" })],
      registros: [
        reg({ id: "a-nov", titulo: "Antigo", solicitadoEm: "2025-11-05" }),
        reg({ id: "a-sem", titulo: "Sem data" }),
        reg({ id: "a-jun", titulo: "Recente", solicitadoEm: "2026-06-01" }),
      ],
    });
    expect(linhas.map((l) => l.chave)).toEqual(["r:a-jun", "p:p-mar", "r:a-nov", "r:a-sem"]);
  });
});

describe("resumoHistorico", () => {
  it("conta pedidos, fechados com o valor, não fechados, e desde quando é cliente", () => {
    const linhas = historico({
      propostas: [prop({ valorDocumento: 10000 })],
      registros: [
        reg({ id: "a1", titulo: "A", solicitadoEm: "2025-11-05", resultado: "fechado", valor: 3000 }),
        reg({ id: "a2", titulo: "B", solicitadoEm: "2026-01-10", resultado: "nao_fechado" }),
        reg({ propostaId: "p1", resultado: "fechado" }),
      ],
    });
    expect(resumoHistorico(linhas)).toEqual({
      pedidos: 3, fechados: 2, valorFechado: 13000, naoFechados: 1, emAberto: 0, desde: "2025-11-05",
    });
  });
});
