import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Simulação de um ciclo comercial inteiro, pelas ROTAS de verdade.
 *
 * Os testes de unidade cobrem as peças (máquina, agregações, repartição de
 * preço). Este cobre o que só aparece quando elas trabalham juntas: as regras
 * que moram nos handlers — etapa tem que pertencer ao funil, perda exige
 * motivo, negociação fechada não aceita tarefa, excluir negociação leva as
 * tarefas junto — e o histórico que cada ação deixa.
 *
 * ## Por que `chdir`
 *
 * Sem `POSTGRES_URL`, os stores gravam em `data/` relativo ao `cwd`. Rodar a
 * simulação sobre um diretório temporário evita encostar nos dados de
 * desenvolvimento de quem roda os testes — e deixa cada execução partir do zero,
 * que é o que faz a semeadura do funil padrão ser exercitada de fato.
 *
 * A sessão é o único ponto fingido: `getCurrentUser` lê cookie, que não existe
 * fora de uma requisição HTTP. Todo o resto é o código que roda em produção.
 */

const ANA = { email: "ana@gta.com", name: "Ana Vendedora" };
const BETO = { email: "beto@gta.com", name: "Beto Vendedor" };

/** Quem está logado. O mock lê esta variável a cada chamada. */
let usuarioAtual = ANA;

/** Ligado/desligado pelos testes de permissão no fim do arquivo. */
let podeConfigurar = true;

vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => usuarioAtual,
  getSessionUser: async () => usuarioAtual,
  requirePageUser: async () => usuarioAtual,
}));
vi.mock("@/lib/rbac/resolve", () => ({
  temPermissao: async (_u: unknown, chave: string) => (chave === "crm.configurar" ? podeConfigurar : true),
  permissoesDoUsuario: async () => new Set<string>(),
}));

// Os módulos de rota são importados DEPOIS do mock (vi.mock é içado, mas o
// import dinâmico deixa a ordem explícita para quem lê).
type Rotas = {
  funis: typeof import("@/app/api/crm/funis/route");
  funilId: typeof import("@/app/api/crm/funis/[id]/route");
  negociacoes: typeof import("@/app/api/crm/negociacoes/route");
  negociacaoId: typeof import("@/app/api/crm/negociacoes/[id]/route");
  transicao: typeof import("@/app/api/crm/negociacoes/[id]/transicao/route");
  anotacoes: typeof import("@/app/api/crm/negociacoes/[id]/anotacoes/route");
  contatos: typeof import("@/app/api/crm/contatos/route");
  fontes: typeof import("@/app/api/crm/fontes/route");
  motivos: typeof import("@/app/api/crm/motivos-perda/route");
  produtos: typeof import("@/app/api/crm/produtos/route");
  tarefas: typeof import("@/app/api/crm/tarefas/route");
  concluir: typeof import("@/app/api/crm/tarefas/[id]/concluir/route");
};
let r: Rotas;

let cwdOriginal: string;
let tmp: string;

/** `POST`/`PATCH` com corpo JSON, como o `fetch` das telas monta. */
const req = (corpo: unknown, metodo = "POST") =>
  new Request("http://localhost/api/crm", { method: metodo, body: JSON.stringify(corpo) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const corpoDe = async (res: Response) => res.json() as Promise<Record<string, never>>;

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crm-fluxo-"));
  process.chdir(tmp);

  r = {
    funis: await import("@/app/api/crm/funis/route"),
    funilId: await import("@/app/api/crm/funis/[id]/route"),
    negociacoes: await import("@/app/api/crm/negociacoes/route"),
    negociacaoId: await import("@/app/api/crm/negociacoes/[id]/route"),
    transicao: await import("@/app/api/crm/negociacoes/[id]/transicao/route"),
    anotacoes: await import("@/app/api/crm/negociacoes/[id]/anotacoes/route"),
    contatos: await import("@/app/api/crm/contatos/route"),
    fontes: await import("@/app/api/crm/fontes/route"),
    motivos: await import("@/app/api/crm/motivos-perda/route"),
    produtos: await import("@/app/api/crm/produtos/route"),
    tarefas: await import("@/app/api/crm/tarefas/route"),
    concluir: await import("@/app/api/crm/tarefas/[id]/concluir/route"),
  };
});

afterAll(() => {
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("CRM — ciclo comercial completo pelas rotas", () => {
  // O estado vai passando de teste para teste, na ordem: é uma narrativa, não
  // casos independentes. Vitest roda `it` em ordem dentro do describe.
  const ids = {
    funil: "",
    etapas: [] as { id: string; nome: string }[],
    fonteIndicacao: "",
    motivoPreco: "",
    produtoProjeto: "",
    contatoJoao: "",
    ganha: "",
    perdida: "",
    aberta: "",
    pausada: "",
    tarefa: "",
  };

  it("conta nova nasce com o funil padrão de 5 etapas", async () => {
    const d = await corpoDe(await r.funis.GET());
    const funis = d.funis as unknown as { id: string; nome: string; etapas: { id: string; nome: string }[] }[];
    expect(funis).toHaveLength(1);
    expect(funis[0].etapas.map((e) => e.nome)).toEqual([
      "Sem contato", "Contato feito", "Proposta enviada", "Negociação", "Fechamento",
    ]);
    ids.funil = funis[0].id;
    ids.etapas = funis[0].etapas;
  });

  it("os catálogos também nascem semeados, e só uma vez", async () => {
    const f1 = await corpoDe(await r.fontes.GET());
    const f2 = await corpoDe(await r.fontes.GET());
    expect((f1.fontes as unknown as unknown[]).length).toBe(5);
    // A segunda visita não pode semear de novo — seria catálogo duplicado.
    expect((f2.fontes as unknown as unknown[]).length).toBe(5);

    const m = await corpoDe(await r.motivos.GET());
    const motivos = m.motivos as unknown as { id: string; nome: string }[];
    expect(motivos.map((x) => x.nome)).toContain("Preço");
    ids.motivoPreco = motivos.find((x) => x.nome === "Preço")!.id;
    ids.fonteIndicacao = (f1.fontes as unknown as { id: string; nome: string }[]).find((x) => x.nome === "Indicação")!.id;
  });

  it("cadastra produto e contato", async () => {
    const p = await corpoDe(await r.produtos.POST(req({ nome: "Projeto de subestação", precoBase: 12000 })));
    ids.produtoProjeto = (p.produto as unknown as { id: string }).id;

    const c = await corpoDe(await r.contatos.POST(req({ nome: "João Pereira", cargo: "Gerente", empresaNome: "Fazenda Rio Doce" })));
    ids.contatoJoao = (c.contato as unknown as { id: string }).id;
    expect((c.contato as unknown as { criadoPor: string }).criadoPor).toBe(ANA.email);
  });

  it("recusa negociação com etapa que não pertence ao funil", async () => {
    const res = await r.negociacoes.POST(req({
      nome: "Fraude de etapa", funilId: ids.funil, etapaId: "etapa-de-outro-funil",
    }));
    expect(res.status).toBe(422);
    expect((await corpoDe(res)).error).toMatch(/Etapa não pertence/);
  });

  it("cria quatro negociações e já registra o histórico", async () => {
    const criar = async (nome: string, extra: Record<string, unknown> = {}) => {
      const res = await r.negociacoes.POST(req({
        nome, funilId: ids.funil, etapaId: ids.etapas[0].id, valor: 10000,
        empresaNome: "Fazenda Rio Doce", fonteId: ids.fonteIndicacao, fonteNome: "Indicação",
        ...extra,
      }));
      expect(res.status).toBe(201);
      return (await corpoDe(res)).negociacao as unknown as { id: string; anotacoes: unknown[]; responsavel: string };
    };

    const g = await criar("Subestação — Fazenda Rio Doce", { valor: 50000 });
    ids.ganha = g.id;
    // Sem responsável informado, quem cria assume — regra do RD.
    expect(g.responsavel).toBe(ANA.email);
    expect(g.anotacoes).toHaveLength(1);

    ids.perdida = (await criar("SPDA — Galpão Industrial", { valor: 8000 })).id;
    ids.aberta = (await criar("Rede MT — Condomínio", { valor: 30000 })).id;
    ids.pausada = (await criar("Limpeza — Usina", { valor: 4000 })).id;
  });

  it("avançar de etapa entra no histórico com origem e destino", async () => {
    const res = await r.negociacaoId.PATCH(req({ etapaId: ids.etapas[2].id }, "PATCH"), ctx(ids.ganha));
    const n = (await corpoDe(res)).negociacao as unknown as { etapaId: string; nome: string; valor: number; anotacoes: { texto: string }[] };
    expect(n.etapaId).toBe(ids.etapas[2].id);
    // O PATCH parcial não pode apagar o resto — é o arrasto do quadro.
    expect(n.nome).toBe("Subestação — Fazenda Rio Doce");
    expect(n.valor).toBe(50000);
    expect(n.anotacoes.at(-1)!.texto).toBe('Movida de "Sem contato" para "Proposta enviada".');
  });

  it("produtos vinculados passam a mandar no valor", async () => {
    const res = await r.negociacaoId.PATCH(req({
      produtos: [{
        produtoId: ids.produtoProjeto, nome: "Projeto de subestação", preco: 12000,
        quantidade: 2, desconto: 10, tipoDesconto: "percentual", recorrencia: "unico",
      }],
      contatoIds: [ids.contatoJoao],
    }, "PATCH"), ctx(ids.ganha));
    const n = (await corpoDe(res)).negociacao as unknown as { produtos: unknown[]; contatoIds: string[] };
    expect(n.produtos).toHaveLength(1);
    expect(n.contatoIds).toEqual([ids.contatoJoao]);
  });

  it("anotação é acrescentada, nunca substituída", async () => {
    const antes = ((await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.ganha)))).negociacao as unknown as { anotacoes: unknown[] }).anotacoes.length;
    usuarioAtual = BETO;
    const res = await r.anotacoes.POST(req({ texto: "Cliente pediu revisão do prazo." }), ctx(ids.ganha));
    expect(res.status).toBe(201);
    const n = (await corpoDe(res)).negociacao as unknown as { anotacoes: { texto: string; autorNome: string; tipo: string }[] };
    expect(n.anotacoes).toHaveLength(antes + 1);
    expect(n.anotacoes.at(-1)).toMatchObject({ tipo: "nota", autorNome: BETO.name });
    usuarioAtual = ANA;
  });

  it("agenda tarefa, conclui, e as duas coisas entram no histórico", async () => {
    const res = await r.tarefas.POST(req({
      negociacaoId: ids.ganha, tipo: "ligacao", assunto: "Confirmar prazo", data: "2026-08-20", hora: "10:00",
    }));
    expect(res.status).toBe(201);
    const t = (await corpoDe(res)).tarefa as unknown as { id: string; negociacaoNome: string; concluida: boolean };
    ids.tarefa = t.id;
    expect(t.negociacaoNome).toBe("Subestação — Fazenda Rio Doce");
    expect(t.concluida).toBe(false);

    await r.concluir.POST(req({ concluida: true }), ctx(ids.tarefa));
    const n = (await corpoDe(await r.negociacaoId.GET(req({}), ctx(ids.ganha)))).negociacao as unknown as { anotacoes: { texto: string }[] };
    const textos = n.anotacoes.map((a) => a.texto);
    expect(textos.some((x) => x.startsWith("Tarefa agendada"))).toBe(true);
    expect(textos.some((x) => x.startsWith("Tarefa concluída"))).toBe(true);
  });

  it("perder exige motivo — e o motivo tem que existir", async () => {
    const semMotivo = await r.transicao.POST(req({ acao: "perder" }), ctx(ids.perdida));
    expect(semMotivo.status).toBe(422);
    expect((await corpoDe(semMotivo)).error).toMatch(/motivo da perda/i);

    const motivoTorto = await r.transicao.POST(req({ acao: "perder", motivoPerdaId: "nao-existe" }), ctx(ids.perdida));
    expect(motivoTorto.status).toBe(422);

    const ok = await r.transicao.POST(req({ acao: "perder", motivoPerdaId: ids.motivoPreco }), ctx(ids.perdida));
    const n = (await corpoDe(ok)).negociacao as unknown as { situacao: string; motivoPerdaNome: string; fechadoEm: string; anotacoes: { texto: string }[] };
    expect(n.situacao).toBe("perdida");
    expect(n.motivoPerdaNome).toBe("Preço");
    expect(n.fechadoEm).not.toBe("");
    expect(n.anotacoes.at(-1)!.texto).toBe("Marcada como perdida — motivo: Preço.");
  });

  it("a máquina barra o caminho impossível", async () => {
    const res = await r.transicao.POST(req({ acao: "perder", motivoPerdaId: ids.motivoPreco }), ctx(ids.perdida));
    expect(res.status).toBe(409);
    expect((await corpoDe(res)).error).toMatch(/indisponível/);
  });

  it("negociação fechada não aceita tarefa nova", async () => {
    const res = await r.tarefas.POST(req({
      negociacaoId: ids.perdida, tipo: "ligacao", assunto: "Insistir", data: "2026-08-21",
    }));
    expect(res.status).toBe(409);
    expect((await corpoDe(res)).error).toMatch(/já foi fechada/);
  });

  it("reabrir devolve ao funil e limpa o fechamento, sem apagar o histórico", async () => {
    const res = await r.transicao.POST(req({ acao: "reabrir" }), ctx(ids.perdida));
    const n = (await corpoDe(res)).negociacao as unknown as { situacao: string; motivoPerdaNome: string; fechadoEm: string; anotacoes: { texto: string }[] };
    expect(n.situacao).toBe("aberta");
    expect(n.motivoPerdaNome).toBe("");
    expect(n.fechadoEm).toBe("");
    // A perda anterior continua contada.
    expect(n.anotacoes.some((a) => a.texto.includes("perdida — motivo: Preço"))).toBe(true);

    // E volta a aceitar tarefa.
    const t = await r.tarefas.POST(req({ negociacaoId: ids.perdida, tipo: "email", assunto: "Retomar", data: "2026-08-22" }));
    expect(t.status).toBe(201);

    // Perde de novo, para o cenário dos relatórios.
    await r.transicao.POST(req({ acao: "perder", motivoPerdaId: ids.motivoPreco }), ctx(ids.perdida));
  });

  it("ganhar e pausar completam o quadro", async () => {
    const g = await r.transicao.POST(req({ acao: "ganhar" }), ctx(ids.ganha));
    expect(((await corpoDe(g)).negociacao as unknown as { situacao: string }).situacao).toBe("ganha");

    const p = await r.transicao.POST(req({ acao: "pausar" }), ctx(ids.pausada));
    expect(((await corpoDe(p)).negociacao as unknown as { situacao: string }).situacao).toBe("pausada");
  });

  it("etapa com negociação não pode ser removida do funil", async () => {
    const res = await r.funilId.PATCH(req({ etapas: [{ id: ids.etapas[0].id, nome: "Sem contato" }] }, "PATCH"), ctx(ids.funil));
    expect(res.status).toBe(409);
    expect((await corpoDe(res)).error).toMatch(/tem negociações/);
  });

  it("funil com negociação não pode ser excluído", async () => {
    const res = await r.funilId.DELETE(req({}, "DELETE"), ctx(ids.funil));
    expect(res.status).toBe(409);
  });

  it("os relatórios enxergam exatamente o que aconteceu", async () => {
    const { conversoes, pipelinePorEtapa, porFonte, porResponsavel, porProduto } = await import("@/lib/crm/relatorios");
    const negs = (await corpoDe(await r.negociacoes.GET())).negociacoes as unknown as import("@/lib/crm/types").Negociacao[];
    const funil = ((await corpoDe(await r.funis.GET())).funis as unknown as import("@/lib/crm/types").Funil[])[0];
    const filtro = { periodo: { inicio: "", fim: "" }, funilId: "", responsavel: "" };
    // Período aberto não casa com `noPeriodo`, que exige data; uso o dia de hoje.
    const hoje = new Date().toISOString().slice(0, 10);
    const doDia = { periodo: { inicio: hoje, fim: hoje }, funilId: "", responsavel: "" };

    expect(negs).toHaveLength(4);

    const c = conversoes(negs, doDia);
    expect(c.criadas).toBe(4);
    expect(c.ganhas).toBe(1);
    expect(c.perdidas).toBe(1);
    // 2 × 12.000 menos 10% = 21.600 — o valor vem dos produtos, não do campo livre.
    expect(c.valorGanho).toBe(21600);
    expect(c.taxa).toBe(0.5);
    expect(c.motivos).toEqual([{ nome: "Preço", quantidade: 1 }]);

    // No quadro só ficam as duas em jogo (aberta + pausada).
    const pipe = pipelinePorEtapa(negs, funil);
    expect(pipe.reduce((s, l) => s + l.quantidade, 0)).toBe(2);
    expect(pipe.reduce((s, l) => s + l.valor, 0)).toBe(34000);

    expect(porFonte(negs, doDia)[0]).toMatchObject({ chave: "Indicação", criadas: 4, ganhas: 1 });
    expect(porResponsavel(negs, doDia)[0]).toMatchObject({ responsavel: ANA.name, ganhas: 1, valorGanho: 21600, ticketMedio: 21600 });
    expect(porProduto(negs, doDia)).toEqual([{ nome: "Projeto de subestação", quantidade: 2, valor: 21600, emGanhas: 2 }]);

    // Filtro por responsável isola de verdade.
    expect(conversoes(negs, { ...doDia, responsavel: BETO.email }).criadas).toBe(0);
    expect(filtro.funilId).toBe("");
  });

  it("excluir a negociação leva as tarefas dela junto", async () => {
    // Duas até aqui: "Confirmar prazo" na ganha e "Retomar" na reaberta.
    const antes = (await corpoDe(await r.tarefas.GET(new Request("http://localhost/api/crm/tarefas")))).tarefas as unknown as unknown[];
    expect(antes).toHaveLength(2);

    const res = await r.negociacaoId.DELETE(req({}, "DELETE"), ctx(ids.ganha));
    expect(res.status).toBe(200);

    const depois = (await corpoDe(await r.tarefas.GET(new Request("http://localhost/api/crm/tarefas")))).tarefas as unknown as { negociacaoId: string }[];
    expect(depois).toHaveLength(1);
    expect(depois.every((t) => t.negociacaoId !== ids.ganha)).toBe(true);
  });

  it("sem `crm.configurar`, o catálogo e o funil ficam trancados — mas o dia a dia segue", async () => {
    podeConfigurar = false;
    try {
      // Mexer no processo da empresa é decisão de gestor.
      expect((await r.produtos.POST(req({ nome: "Produto novo" }))).status).toBe(403);
      expect((await r.fontes.POST(req({ nome: "Fonte nova" }))).status).toBe(403);
      expect((await r.motivos.POST(req({ nome: "Motivo novo" }))).status).toBe(403);
      expect((await r.funis.POST(req({ nome: "Funil novo", etapas: [{ nome: "A" }] }))).status).toBe(403);
      expect((await r.funilId.DELETE(req({}, "DELETE"), ctx(ids.funil))).status).toBe(403);

      // O trabalho do vendedor NÃO depende dessa permissão: ler e negociar
      // seguem abertos, senão a trava viraria obstáculo em vez de proteção.
      expect((await r.negociacoes.GET()).status).toBe(200);
      expect((await r.fontes.GET()).status).toBe(200);
      const criar = await r.negociacoes.POST(req({ nome: "Sem ser gestor", funilId: ids.funil, etapaId: ids.etapas[0].id }));
      expect(criar.status).toBe(201);
    } finally {
      podeConfigurar = true;
    }
  });

  it("só o dono (ou um administrador) exclui a negociação — o histórico vai junto", async () => {
    const dela = (await corpoDe(await r.negociacoes.POST(req({
      nome: "Da Ana", funilId: ids.funil, etapaId: ids.etapas[0].id,
    })))).negociacao as unknown as { id: string };

    // Beto tenta apagar a negociação de Ana, sem ser admin.
    const salvo = usuarioAtual;
    usuarioAtual = { ...BETO, role: "member" } as unknown as typeof ANA;
    const negado = await r.negociacaoId.DELETE(req({}, "DELETE"), ctx(dela.id));
    expect(negado.status).toBe(403);
    expect((await corpoDe(negado)).error).toMatch(/responsável/i);

    // A dona apaga.
    usuarioAtual = salvo;
    expect((await r.negociacaoId.DELETE(req({}, "DELETE"), ctx(dela.id))).status).toBe(200);
  });

  it("sem sessão, nada passa", async () => {
    const salvo = usuarioAtual;
    usuarioAtual = null as unknown as typeof ANA;
    expect((await r.negociacoes.GET()).status).toBe(401);
    expect((await r.tarefas.POST(req({ negociacaoId: "x", tipo: "ligacao", assunto: "a", data: "2026-01-01" }))).status).toBe(401);
    expect((await r.funis.GET()).status).toBe(401);
    usuarioAtual = salvo;
  });
});
