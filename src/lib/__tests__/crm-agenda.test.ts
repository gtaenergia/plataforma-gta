import { describe, expect, it } from "vitest";
import { montarAgenda, rotuloDoDia } from "@/lib/crm/agenda";
import type { Cliente } from "@/lib/clientes/types";
import type { Contato, Funil, Negociacao, TarefaCrm } from "@/lib/crm/types";

const HOJE = "2026-10-29"; // quinta-feira

const neg = (sobre: Partial<Negociacao>): Negociacao => ({
  id: "n1", nome: "SPDA — Galpão", funilId: "f1", etapaId: "e2", valor: 0,
  empresaId: "c1", empresaNome: "Fazenda Rio Doce", contatoIds: [],
  responsavel: "ana@gta.com", responsavelNome: "Ana",
  fonteId: "", fonteNome: "", situacao: "aberta",
  motivoPerdaId: "", motivoPerdaNome: "", previsao: "", qualificacao: 0,
  produtos: [], campos: {}, anotacoes: [], fechadoEm: "", fechadoPor: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-10-01T00:00:00.000Z",
  ...sobre,
});

const tar = (sobre: Partial<TarefaCrm>): TarefaCrm => ({
  id: "t1", negociacaoId: "", negociacaoNome: "", clienteId: "c1", clienteNome: "Fazenda Rio Doce",
  tipo: "whatsapp", assunto: "Retorno", data: HOJE, hora: "", notas: "",
  responsavel: "ana@gta.com", responsavelNome: "Ana", repetirCada: 0, repetirUnidade: "",
  concluida: false, concluidaEm: "", concluidaPor: "", concluidaPorNome: "", comentario: "", proximaId: "",
  criadoPor: "ana@gta.com", criadoEm: "2026-08-01T00:00:00.000Z", atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

const cliente = (sobre: Partial<Cliente>): Cliente => ({
  id: "c1", nome: "Fazenda Rio Doce", tipoPessoa: "PJ", documento: "", contatoNome: "João", telefone: "(62) 99999-0000",
  email: "joao@fazenda.com", cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "", segmento: "",
  observacoes: "", criadoPor: "ana@gta.com", criadoEm: "", atualizadoEm: "",
  ...sobre,
});

const contato = (sobre: Partial<Contato>): Contato => ({
  id: "ct1", nome: "Maria", cargo: "Compras", email: "maria@fazenda.com", telefone: "(62) 98888-0000",
  empresaId: "c1", empresaNome: "Fazenda Rio Doce", observacoes: "", criadoPor: "ana@gta.com", criadoEm: "", atualizadoEm: "",
  ...sobre,
});

const FUNIS: Funil[] = [{
  id: "f1", nome: "Padrão", criadoEm: "", atualizadoEm: "",
  etapas: [{ id: "e1", nome: "Sem contato" }, { id: "e2", nome: "Proposta enviada" }],
}];

const base = { negociacoes: [] as Negociacao[], clientes: [cliente({})], contatos: [] as Contato[], funis: FUNIS, hoje: HOJE, dias: 7 };

describe("montarAgenda — os dias", () => {
  it("agrupa por dia, com os atrasados à parte e o resto contado para depois", () => {
    const a = montarAgenda({
      ...base,
      tarefas: [
        tar({ id: "ontem", data: "2026-10-28" }),
        tar({ id: "hoje-a", data: HOJE }),
        tar({ id: "hoje-b", data: HOJE, hora: "09:00" }),
        tar({ id: "amanha", data: "2026-10-30" }),
        tar({ id: "fim-da-janela", data: "2026-11-04" }),
        tar({ id: "fora", data: "2026-11-05" }),
        tar({ id: "feito", data: HOJE, concluida: true }),
      ],
    });
    expect(a.atrasados.map((i) => i.tarefa.id)).toEqual(["ontem"]);
    expect(a.dias.map((d) => d.data)).toEqual([HOJE, "2026-10-30", "2026-11-04"]);
    // Sem hora vem antes de "09:00" na ordenação por texto — fica no topo do dia.
    expect(a.dias[0].itens.map((i) => i.tarefa.id)).toEqual(["hoje-a", "hoje-b"]);
    expect(a.ate).toBe("2026-11-04");
    expect(a.depois).toBe(1);
  });

  it("filtra pelo responsável sem ligar para maiúsculas", () => {
    const a = montarAgenda({
      ...base,
      responsavel: "BETO@gta.com",
      tarefas: [tar({ id: "da-ana" }), tar({ id: "do-beto", responsavel: "beto@gta.com" })],
    });
    expect(a.dias[0].itens.map((i) => i.tarefa.id)).toEqual(["do-beto"]);
  });
});

describe("montarAgenda — o que vem com cada cliente", () => {
  it("conta os follow-ups feitos, diz quem fez o último e traz os comentários", () => {
    const a = montarAgenda({
      ...base,
      tarefas: [
        tar({ id: "agora" }),
        tar({ id: "f1", concluida: true, concluidaEm: "2026-09-01T12:00:00.000Z", concluidaPorNome: "Ana", comentario: "Sem interesse agora." }),
        tar({ id: "f2", concluida: true, concluidaEm: "2026-10-01T12:00:00.000Z", concluidaPorNome: "Beto", comentario: "" }),
        // De outro cliente: não entra na conta.
        tar({ id: "alheio", clienteId: "c9", clienteNome: "Outro", concluida: true, concluidaEm: "2026-10-10T12:00:00.000Z" }),
      ],
    });
    const item = a.dias[0].itens[0];
    expect(item.feitos).toBe(2);
    expect(item.ultimo).toMatchObject({ por: "Beto" });
    // Só os com comentário aparecem em "últimos comentários".
    expect(item.recentes.map((r) => r.comentario)).toEqual(["Sem interesse agora."]);
  });

  it("etapa vem da negociação em andamento do cliente, mesmo no follow-up sem negociação", () => {
    const a = montarAgenda({ ...base, negociacoes: [neg({})], tarefas: [tar({})] });
    expect(a.dias[0].itens[0].etapa).toBe("Proposta enviada");
    expect(a.dias[0].itens[0].negociacao?.id).toBe("n1");
  });

  it("sem negociação em andamento, sem etapa", () => {
    const a = montarAgenda({ ...base, negociacoes: [neg({ situacao: "ganha" })], tarefas: [tar({})] });
    expect(a.dias[0].itens[0]).toMatchObject({ etapa: "", negociacao: null });
  });

  it("contatos: primeiro quem está na negociação, depois o do cadastro, sem repetir a mesma pessoa", () => {
    const a = montarAgenda({
      ...base,
      negociacoes: [neg({ contatoIds: ["ct2"] })],
      contatos: [
        contato({ id: "ct1", nome: "Maria" }),
        contato({ id: "ct2", nome: "Pedro", telefone: "(62) 97777-0000" }),
        // O João do cadastro também existe como contato: é uma pessoa só.
        contato({ id: "ct3", nome: "João", telefone: "(62) 99999-0000", email: "joao@fazenda.com", cargo: "" }),
      ],
      tarefas: [tar({ negociacaoId: "n1" })],
    });
    expect(a.dias[0].itens[0].contatos.map((c) => c.nome)).toEqual(["Pedro", "João", "Maria"]);
  });

  it("cliente renomeado no cadastro aparece com o nome de hoje", () => {
    const a = montarAgenda({ ...base, clientes: [cliente({ nome: "Fazenda Rio Doce S/A" })], tarefas: [tar({})] });
    expect(a.dias[0].itens[0].cliente.nome).toBe("Fazenda Rio Doce S/A");
  });

  it("tarefa antiga, só com negociação, encontra o cliente pela negociação", () => {
    const a = montarAgenda({
      ...base,
      negociacoes: [neg({})],
      tarefas: [tar({ clienteId: "", clienteNome: "", negociacaoId: "n1" })],
    });
    expect(a.dias[0].itens[0].cliente).toEqual({ id: "c1", nome: "Fazenda Rio Doce" });
  });
});

describe("rotuloDoDia", () => {
  it("hoje, amanhã e depois o dia da semana", () => {
    expect(rotuloDoDia(HOJE, HOJE)).toBe("Hoje");
    expect(rotuloDoDia("2026-10-30", HOJE)).toBe("Amanhã");
    expect(rotuloDoDia("2026-10-31", HOJE)).toBe("Sábado");
    expect(rotuloDoDia("2026-11-02", HOJE)).toBe("Segunda-feira");
  });
});
