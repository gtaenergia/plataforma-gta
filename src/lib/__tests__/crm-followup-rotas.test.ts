import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Follow-ups pelas ROTAS de verdade: agendar no cliente (sem negociação),
 * concluir registrando quem fez, a repetição gerando a próxima, o desfazer, e
 * o que acontece quando a negociação fecha no meio de uma série.
 *
 * Mesmo arranjo do `crm-fluxo.test.ts`: `chdir` para um diretório temporário
 * (os stores gravam em `data/`) e só a sessão fingida.
 */

const ANA = { email: "ana@gta.com", name: "Ana Vendedora", role: "admin" };
const BETO = { email: "beto@gta.com", name: "Beto Vendedor" };

let usuarioAtual: typeof ANA | null = ANA;

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => usuarioAtual,
  getSessionUser: async () => usuarioAtual,
  requirePageUser: async () => usuarioAtual,
}));
vi.mock("@/lib/rbac/resolve", () => ({
  temPermissao: async () => true,
  permissoesDoUsuario: async () => new Set<string>(),
}));

type Rotas = {
  funis: typeof import("@/app/api/crm/funis/route");
  negociacoes: typeof import("@/app/api/crm/negociacoes/route");
  negociacaoId: typeof import("@/app/api/crm/negociacoes/[id]/route");
  transicao: typeof import("@/app/api/crm/negociacoes/[id]/transicao/route");
  tarefas: typeof import("@/app/api/crm/tarefas/route");
  tarefaId: typeof import("@/app/api/crm/tarefas/[id]/route");
  concluir: typeof import("@/app/api/crm/tarefas/[id]/concluir/route");
};
let r: Rotas;
let cwdOriginal: string;
let tmp: string;
let clienteId = "";

const req = (corpo: unknown, metodo = "POST") =>
  new Request("http://localhost/api/crm", { method: metodo, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpoDe = async (res: Response) => res.json() as Promise<any>;
const todas = async () =>
  (await corpoDe(await r.tarefas.GET(new Request("http://localhost/api/crm/tarefas")))).tarefas as {
    id: string; concluida: boolean; data: string; clienteId: string; negociacaoId: string;
  }[];

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crm-followup-"));
  process.chdir(tmp);

  r = {
    funis: await import("@/app/api/crm/funis/route"),
    negociacoes: await import("@/app/api/crm/negociacoes/route"),
    negociacaoId: await import("@/app/api/crm/negociacoes/[id]/route"),
    transicao: await import("@/app/api/crm/negociacoes/[id]/transicao/route"),
    tarefas: await import("@/app/api/crm/tarefas/route"),
    tarefaId: await import("@/app/api/crm/tarefas/[id]/route"),
    concluir: await import("@/app/api/crm/tarefas/[id]/concluir/route"),
  };

  const { getClienteStore } = await import("@/lib/clientes/store");
  const cliente = await getClienteStore().create({
    nome: "Fazenda Rio Doce", tipoPessoa: "PJ", documento: "", contatoNome: "João", telefone: "(62) 99999-0000",
    email: "", cep: "", logradouro: "", numero: "", bairro: "", cidade: "Goiânia", uf: "GO", segmento: "Rural",
    observacoes: "", criadoPor: ANA.email,
  });
  clienteId = cliente.id;

  // Beto existe no cadastro: é de lá que vem o nome de quem fez o contato.
  const { users } = await import("@/lib/users/store");
  await (await users()).create({
    email: BETO.email, name: BETO.name, passwordHash: "x", role: "member", comercial: true,
    mustChangePassword: false, active: true,
  });

  // O cálculo da próxima ocorrência usa o dia de hoje; fixá-lo mantém o
  // teste de pé em qualquer data em que rodar.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Follow-up direto no cliente", () => {
  const ids = { trimestral: "", proxima: "" };

  it("agenda sem negociação, com repetição, e já para outra pessoa", async () => {
    const res = await r.tarefas.POST(req({
      clienteId, tipo: "whatsapp", assunto: "Retorno trimestral", data: "2026-10-29",
      repetirCada: 3, repetirUnidade: "meses", responsavel: BETO.email, responsavelNome: BETO.name,
    }));
    expect(res.status).toBe(201);
    const t = (await corpoDe(res)).tarefa;
    expect(t).toMatchObject({ negociacaoId: "", clienteId, clienteNome: "Fazenda Rio Doce", repetirCada: 3, repetirUnidade: "meses" });
    ids.trimestral = t.id;

    // Quem recebe o compromisso é avisado.
    const { getNotificacaoStore } = await import("@/lib/notificacoes/store");
    const avisos = await getNotificacaoStore().listPara(BETO.email);
    expect(avisos[0]).toMatchObject({ tipo: "crm_tarefa", link: `/crm/clientes/${clienteId}` });
  });

  it("sem cliente nem negociação, recusa dizendo o que falta", async () => {
    const res = await r.tarefas.POST(req({ tipo: "ligacao", assunto: "Solto", data: "2026-11-01" }));
    expect(res.status).toBe(422);
    expect(JSON.stringify(await corpoDe(res))).toContain("Escolha o cliente");
  });

  it("cliente que não existe no cadastro é recusado", async () => {
    const res = await r.tarefas.POST(req({ clienteId: "nao-existe", tipo: "ligacao", assunto: "X", data: "2026-11-01" }));
    expect(res.status).toBe(422);
    expect((await corpoDe(res)).error).toMatch(/Cliente não encontrado/);
  });

  it("repetição sem unidade é recusada — não diria quando volta", async () => {
    const res = await r.tarefas.POST(req({ clienteId, tipo: "ligacao", assunto: "X", data: "2026-11-01", repetirCada: 2 }));
    expect(res.status).toBe(422);
  });

  it("concluir registra quem fez e o comentário, e a repetição agenda a próxima", async () => {
    const res = await r.concluir.POST(
      req({ concluida: true, feitoPor: BETO.email, comentario: "Pediu orçamento de SPDA para o galpão novo." }),
      ctx(ids.trimestral),
    );
    expect(res.status).toBe(200);
    const { tarefa, proxima } = await corpoDe(res);
    expect(tarefa).toMatchObject({
      concluida: true, concluidaPor: BETO.email, concluidaPorNome: BETO.name,
      comentario: "Pediu orçamento de SPDA para o galpão novo.",
    });
    // 29/10 + 3 meses, contado da data agendada (hoje é 30/10).
    expect(proxima).toMatchObject({ data: "2027-01-29", clienteId, repetirCada: 3, responsavel: BETO.email, concluida: false });
    expect(tarefa.proximaId).toBe(proxima.id);
    ids.proxima = proxima.id;
  });

  it("reabrir desfaz a conclusão E apaga a próxima que ela gerou", async () => {
    const res = await r.concluir.POST(req({ concluida: false }), ctx(ids.trimestral));
    const { tarefa } = await corpoDe(res);
    expect(tarefa).toMatchObject({ concluida: false, concluidaPor: "", comentario: "", proximaId: "" });
    expect((await todas()).some((t) => t.id === ids.proxima)).toBe(false);
  });

  it("concluir com próxima data vazia encerra: nenhuma nova nasce", async () => {
    const antes = (await todas()).length;
    const res = await r.concluir.POST(req({ concluida: true, proximaData: "" }), ctx(ids.trimestral));
    const { tarefa, proxima } = await corpoDe(res);
    expect(tarefa.concluida).toBe(true);
    expect(tarefa.concluidaPorNome).toBe(ANA.name);
    expect(proxima).toBeNull();
    expect((await todas()).length).toBe(antes);
  });

  it("próxima já mexida por alguém sobrevive ao reabrir, e não duplica ao concluir de novo", async () => {
    const t = (await corpoDe(await r.tarefas.POST(req({
      clienteId, tipo: "ligacao", assunto: "Semanal", data: "2026-10-26", repetirCada: 1, repetirUnidade: "semanas",
    })))).tarefa;
    const { proxima } = await corpoDe(await r.concluir.POST(req({ concluida: true }), ctx(t.id)));
    expect(proxima.data).toBe("2026-11-02");

    // Alguém adia a próxima: agora ela é compromisso de alguém. O relógio anda
    // uma hora — com ele parado, "criada" e "mexida" teriam o mesmo carimbo.
    vi.setSystemTime(new Date("2026-10-30T16:00:00Z"));
    await r.tarefaId.PATCH(req({ data: "2026-11-03" }, "PATCH"), ctx(proxima.id));

    await r.concluir.POST(req({ concluida: false }), ctx(t.id));
    expect((await todas()).some((x) => x.id === proxima.id)).toBe(true);

    const pendentesAntes = (await todas()).filter((x) => !x.concluida).length;
    const segunda = await corpoDe(await r.concluir.POST(req({ concluida: true }), ctx(t.id)));
    expect(segunda.proxima).toBeNull();
    expect(segunda.tarefa.proximaId).toBe(proxima.id);
    expect((await todas()).filter((x) => !x.concluida).length).toBe(pendentesAntes - 1);
  });

  it("delegar pela edição troca o nome pelo do cadastro e avisa quem recebe", async () => {
    const t = (await corpoDe(await r.tarefas.POST(req({ clienteId, tipo: "email", assunto: "Enviar catálogo", data: "2026-11-05" })))).tarefa;
    const res = await r.tarefaId.PATCH(req({ responsavel: BETO.email }, "PATCH"), ctx(t.id));
    expect((await corpoDe(res)).tarefa).toMatchObject({ responsavel: BETO.email, responsavelNome: BETO.name });

    const { getNotificacaoStore } = await import("@/lib/notificacoes/store");
    const avisos = await getNotificacaoStore().listPara(BETO.email);
    expect(avisos[0].mensagem).toContain("passou para você");
  });

  it("zerar a repetição pela edição limpa a unidade junto", async () => {
    const t = (await corpoDe(await r.tarefas.POST(req({
      clienteId, tipo: "ligacao", assunto: "Mensal", data: "2026-11-10", repetirCada: 1, repetirUnidade: "meses",
    })))).tarefa;
    const res = await r.tarefaId.PATCH(req({ repetirCada: 0 }, "PATCH"), ctx(t.id));
    expect((await corpoDe(res)).tarefa).toMatchObject({ repetirCada: 0, repetirUnidade: "" });
  });
});

describe("Follow-up preso a uma negociação", () => {
  let funilId = "";
  let etapas: { id: string; nome: string }[] = [];

  it("negociação de outro cliente é recusada", async () => {
    const funis = (await corpoDe(await r.funis.GET())).funis;
    funilId = funis[0].id;
    etapas = funis[0].etapas;
    const n = (await corpoDe(await r.negociacoes.POST(req({
      nome: "De outro", funilId, etapaId: etapas[0].id, empresaId: "outro-cliente", empresaNome: "Outro",
    })))).negociacao;
    const res = await r.tarefas.POST(req({ negociacaoId: n.id, clienteId, tipo: "ligacao", assunto: "X", data: "2026-11-01" }));
    expect(res.status).toBe(422);
    expect((await corpoDe(res)).error).toMatch(/outro cliente/);
  });

  it("ganhar a negociação no meio da série: o próximo contato segue, preso só ao cliente", async () => {
    const n = (await corpoDe(await r.negociacoes.POST(req({
      nome: "SPDA — Galpão", funilId, etapaId: etapas[0].id, empresaId: clienteId, empresaNome: "Fazenda Rio Doce",
    })))).negociacao;
    const t = (await corpoDe(await r.tarefas.POST(req({
      negociacaoId: n.id, tipo: "ligacao", assunto: "Acompanhar", data: "2026-10-30", repetirCada: 2, repetirUnidade: "semanas",
    })))).tarefa;
    // O cliente vem da negociação, sem precisar ser informado.
    expect(t.clienteId).toBe(clienteId);

    await r.transicao.POST(req({ acao: "ganhar" }), ctx(n.id));
    const { tarefa, proxima } = await corpoDe(await r.concluir.POST(
      req({ concluida: true, comentario: "Fechou! Contrato assinado." }),
      ctx(t.id),
    ));
    expect(tarefa.concluida).toBe(true);
    expect(proxima).toMatchObject({ negociacaoId: "", clienteId, data: "2026-11-13" });

    // O histórico da negociação guarda o comentário e a próxima data.
    const hist = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(n.id)))).negociacao.anotacoes as { texto: string }[];
    const registro = hist.map((a) => a.texto).find((x) => x.startsWith("Tarefa concluída"))!;
    expect(registro).toContain("Fechou! Contrato assinado.");
    expect(registro).toContain("Próximo contato: 13/11/2026");
  });

  it("encerrar a repetição na conclusão deixa a próxima avulsa", async () => {
    const t = (await corpoDe(await r.tarefas.POST(req({
      clienteId, tipo: "visita", assunto: "Vistoria", data: "2026-10-30", repetirCada: 1, repetirUnidade: "meses",
    })))).tarefa;
    const { proxima } = await corpoDe(await r.concluir.POST(
      req({ concluida: true, proximaData: "2026-12-15", encerrarRepeticao: true }),
      ctx(t.id),
    ));
    expect(proxima).toMatchObject({ data: "2026-12-15", repetirCada: 0, repetirUnidade: "" });
  });
});

describe("Agenda do Início", () => {
  type Item = { cliente: { id: string }; feitos: number; ultimo: { por: string } | null; contatos: { nome: string; telefone: string }[]; tarefa: { responsavel: string } };
  const itensDe = (agenda: { atrasados: Item[]; dias: { itens: Item[] }[] }) => [
    ...agenda.atrasados,
    ...agenda.dias.flatMap((d) => d.itens),
  ];

  it("traz cada compromisso com o contador do cliente, quem fez o último e com quem falar", async () => {
    const rota = await import("@/app/api/crm/agenda/route");
    const d = await corpoDe(await rota.GET(new Request("http://localhost/api/crm/agenda?dias=60")));
    // O dia é o de São Paulo (o relógio fingido está em 30/10, 16h UTC).
    expect(d.hoje).toBe("2026-10-30");
    const daFazenda = itensDe(d.agenda).filter((i) => i.cliente.id === clienteId);
    expect(daFazenda.length).toBeGreaterThan(0);
    // Os contatos concluídos nos testes acima: o contador é do CLIENTE.
    expect(daFazenda[0].feitos).toBeGreaterThanOrEqual(3);
    expect(daFazenda[0].ultimo).not.toBeNull();
    expect(daFazenda[0].contatos[0]).toMatchObject({ nome: "João", telefone: "(62) 99999-0000" });
  });

  it("\"só os meus\" deixa só os compromissos da pessoa", async () => {
    const rota = await import("@/app/api/crm/agenda/route");
    const d = await corpoDe(await rota.GET(new Request(`http://localhost/api/crm/agenda?dias=60&responsavel=${BETO.email}`)));
    const itens = itensDe(d.agenda);
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((i) => i.tarefa.responsavel === BETO.email)).toBe(true);
  });
});

describe("Sem sessão", () => {
  it("nada passa", async () => {
    const salvo = usuarioAtual;
    usuarioAtual = null;
    expect((await r.concluir.POST(req({ concluida: true }), ctx("x"))).status).toBe(401);
    expect((await r.tarefaId.PATCH(req({ data: "2026-11-01" }, "PATCH"), ctx("x"))).status).toBe(401);
    const agenda = await import("@/app/api/crm/agenda/route");
    expect((await agenda.GET(new Request("http://localhost/api/crm/agenda"))).status).toBe(401);
    usuarioAtual = salvo;
  });
});
