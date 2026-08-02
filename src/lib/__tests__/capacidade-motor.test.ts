import { describe, expect, it } from "vitest";
import {
  agruparPorResponsavel,
  avisosDeCapacidade,
  capacidadeDe,
  chaveCategoria,
  compararCandidatos,
  entraNaFila,
  estimativaDaTarefa,
  folgaNaJanela,
  ordenarFila,
  proporPrazo,
  simularFila,
  sugerirResponsaveis,
  type TarefaCapacidade,
} from "@/lib/capacidade/motor";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade } from "@/lib/capacidade/types";
import { fimJanelaCurta, fimJanelaLonga } from "@/lib/capacidade/datas";

/**
 * 2026-08-03 é uma SEGUNDA-FEIRA. Todas as asserções de data partem daí — o
 * motor nunca lê o relógio, então o resultado é o mesmo em qualquer máquina e
 * em qualquer dia.
 */
const SEGUNDA = "2026-08-03";

const config = (over: Partial<ConfigCapacidade> = {}): ConfigCapacidade => ({
  ...CONFIG_CAPACIDADE_PADRAO,
  ...over,
});

const tarefa = (o: Partial<TarefaCapacidade> & { id: string }): TarefaCapacidade => ({
  responsavel: "ana@gta.com",
  status: "afazer",
  categoria: "",
  estimativaMin: 0,
  ...o,
});

const janelas = (hoje: string) => ({ fimSemana: fimJanelaCurta(hoje), fimMes: fimJanelaLonga(hoje) });

describe("normalização de categoria", () => {
  it("acento, caixa e espaço não criam categorias diferentes", () => {
    const esperado = "orcamentos";
    for (const s of ["Orçamentos", "orcamentos", "  ORÇAMENTOS  ", "Orçamentos"]) {
      expect(chaveCategoria(s)).toBe(esperado);
    }
  });

  it("espaço interno duplicado colapsa", () => {
    expect(chaveCategoria("Projeto   Elétrico")).toBe("projeto eletrico");
  });

  it("a estimativa é encontrada mesmo com a categoria escrita de outro jeito", () => {
    const c = config({ estimativas: { orcamentos: 180 } });
    expect(estimativaDaTarefa({ categoria: "ORÇAMENTOS", estimativaMin: 0 }, c).minutos).toBe(180);
  });
});

describe("de onde vem a estimativa", () => {
  const c = config({ estimativas: { projetos: 600 }, estimativaPadraoMin: 120 });

  it("a da tarefa vence a da categoria", () => {
    expect(estimativaDaTarefa({ categoria: "Projetos", estimativaMin: 90 }, c)).toEqual({
      minutos: 90,
      origem: "tarefa",
    });
  });

  it("sem a da tarefa, usa a da categoria", () => {
    expect(estimativaDaTarefa({ categoria: "Projetos", estimativaMin: 0 }, c)).toEqual({
      minutos: 600,
      origem: "categoria",
    });
  });

  it("categoria desconhecida cai no padrão", () => {
    expect(estimativaDaTarefa({ categoria: "Visita técnica", estimativaMin: 0 }, c)).toEqual({
      minutos: 120,
      origem: "padrao",
    });
  });

  it("estimativa zero significa NÃO INFORMADO, nunca 'não dá trabalho'", () => {
    // Se zero fosse aceito como duração, a tarefa entraria na fila sem ocupar
    // ninguém e a entrega proposta seria hoje.
    const semPadrao = config({ estimativas: {}, estimativaPadraoMin: 0 });
    expect(estimativaDaTarefa({ categoria: "", estimativaMin: 0 }, semPadrao)).toEqual({
      minutos: 0,
      origem: "ausente",
    });
  });
});

describe("jornada da pessoa", () => {
  it("sem ajuste, herda o padrão da equipe", () => {
    const r = capacidadeDe(config(), "ana@gta.com");
    expect(r).toMatchObject({ minutosPorDia: 480, diasUteis: [1, 2, 3, 4, 5], origem: "padrao" });
  });

  it("ajuste PARCIAL sobrescreve só o campo informado", () => {
    const c = config({ pessoas: { "ana@gta.com": { minutosPorDia: 240 } } });
    const r = capacidadeDe(c, "ana@gta.com");
    expect(r.minutosPorDia).toBe(240);
    expect(r.diasUteis).toEqual([1, 2, 3, 4, 5]);
    expect(r.atrasoInicioMin).toBe(240);
    expect(r.origem).toBe("pessoa");
  });

  it("e-mail que não está no mapa não quebra nada", () => {
    // O mapa pode divergir da lista de usuários (alguém removido, e-mail
    // trocado). Entrada órfã fica inerte; ausência vira padrão.
    const c = config({ pessoas: { "quemsaiu@gta.com": { minutosPorDia: 60 } } });
    expect(capacidadeDe(c, "novo@gta.com").minutosPorDia).toBe(480);
  });
});

describe("a fila", () => {
  const cap = capacidadeDe(config(), "ana@gta.com");

  it("uma tarefa de meio dia cabe hoje", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [{ tarefaId: "a", minutos: 240 }],
    });
    expect(f.itens[0]).toMatchObject({ inicio: SEGUNDA, fim: SEGUNDA });
    expect(f.porDia).toEqual({ [SEGUNDA]: 240 });
    expect(f.livreEm).toBe(SEGUNDA);
  });

  it("o que não cabe transborda para o dia seguinte", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [{ tarefaId: "a", minutos: 600 }],
    });
    expect(f.itens[0]).toMatchObject({ inicio: SEGUNDA, fim: "2026-08-04" });
    expect(f.porDia).toEqual({ "2026-08-03": 480, "2026-08-04": 120 });
  });

  it("a fila pula o fim de semana", () => {
    // 5 dias úteis de trabalho entrando na segunda terminam na sexta.
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [{ tarefaId: "a", minutos: 480 * 6 }],
    });
    expect(f.itens[0].fim).toBe("2026-08-10"); // segunda seguinte, não sábado
    expect(Object.keys(f.porDia)).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10",
    ]);
  });

  it("invariante: a soma dos dias é igual ao total", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [
        { tarefaId: "a", minutos: 300 },
        { tarefaId: "b", minutos: 700 },
        { tarefaId: "c", minutos: 45 },
      ],
    });
    const somaDias = Object.values(f.porDia).reduce((s, v) => s + v, 0);
    expect(somaDias).toBe(f.totalMin);
    expect(f.totalMin).toBe(1045);
  });

  it("uma tarefa começa exatamente onde a anterior terminou", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [
        { tarefaId: "a", minutos: 480 },
        { tarefaId: "b", minutos: 480 },
      ],
    });
    // A primeira enche a segunda inteira; a segunda vai para terça, não fica
    // espremida no fim de um dia já cheio.
    expect(f.itens[0].fim).toBe("2026-08-03");
    expect(f.itens[1].inicio).toBe("2026-08-04");
  });

  it("horas já apontadas descontam do que falta", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [{ tarefaId: "a", minutos: 600 }],
      realizadoPorTarefa: { a: 500 },
    });
    expect(f.totalMin).toBe(100);
    expect(f.itens[0].fim).toBe(SEGUNDA);
  });

  it("apontado maior que a estimativa não vira crédito negativo", () => {
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [
        { tarefaId: "a", minutos: 60 },
        { tarefaId: "b", minutos: 120 },
      ],
      realizadoPorTarefa: { a: 5000 },
    });
    expect(f.totalMin).toBe(120);
  });

  it("pessoa sem jornada tem fila vazia, não fila infinita", () => {
    const semJornada = capacidadeDe(config({ pessoas: { x: { minutosPorDia: 0 } } }), "x");
    const f = simularFila({
      hoje: SEGUNDA,
      capacidade: semJornada,
      config: config(),
      entradas: [{ tarefaId: "a", minutos: 480 }],
    });
    expect(f).toMatchObject({ totalMin: 0, livreEm: null, truncada: false });
  });

  it("a ordem da fila é o prazo, com desempate estável", () => {
    const r = ordenarFila([
      tarefa({ id: "c" }),
      tarefa({ id: "a", prazoOperacional: "2026-08-20" }),
      tarefa({ id: "b", prazoOperacional: "2026-08-05" }),
      tarefa({ id: "d", prazo: "2026-08-05" }),
    ]).map((t) => t.id);
    expect(r).toEqual(["b", "d", "a", "c"]);
  });

  it("só entram na fila os status abertos", () => {
    expect(["afazer", "andamento", "atraso"].every(entraNaFila)).toBe(true);
    expect(entraNaFila("concluida")).toBe(false);
    // Contínua sem fim travaria a fila para sempre.
    expect(entraNaFila("continuo")).toBe(false);
  });
});

describe("o prazo proposto", () => {
  it("CASO CANÔNICO: 10 h de trabalho, 8 h/dia, fila vazia, 4 h para olhar, numa segunda", () => {
    // 4 h de espera (em paralelo com a fila, que está vazia) + 10 h de trabalho
    // = 14 h. A 8 h/dia são 1,75 dias: começa segunda, termina TERÇA.
    const p = proporPrazo({
      hoje: SEGUNDA,
      capacidade: capacidadeDe(config(), "ana@gta.com"),
      config: config(),
      entradas: [],
      trabalhoMin: 600,
    });
    expect(p.data).toBe("2026-08-04");
    expect(p.diasUteis).toBe(2);
    expect(p).toMatchObject({ esperaOlharMin: 240, esperaFilaMin: 0, trabalhoMin: 600 });
  });

  it("a espera para olhar a plataforma corre EM PARALELO com a fila", () => {
    const cap = capacidadeDe(config(), "ana@gta.com");
    const base = { hoje: SEGUNDA, capacidade: cap, config: config(), trabalhoMin: 480 };

    // Fila de 8 h (um dia). Se a espera fosse somada, seriam 8 + 4 + 8 = 20 h
    // (3 dias). Como corre junto, são max(4, 8) + 8 = 16 h (2 dias).
    const comFila = proporPrazo({ ...base, entradas: [{ tarefaId: "x", minutos: 480 }] });
    expect(comFila.diasUteis).toBe(2);
    expect(comFila.data).toBe("2026-08-04");
  });

  it("a fila longa empurra a entrega", () => {
    const cap = capacidadeDe(config(), "ana@gta.com");
    const p = proporPrazo({
      hoje: SEGUNDA,
      capacidade: cap,
      config: config(),
      entradas: [{ tarefaId: "x", minutos: 480 * 5 }], // uma semana cheia
      trabalhoMin: 480,
    });
    // 5 dias de fila + 1 de trabalho = sexta seguinte não; termina na segunda.
    expect(p.data).toBe("2026-08-10");
    expect(p.diasUteis).toBe(6);
  });

  it("o feriado empurra a data sem mudar o esforço", () => {
    const c = config({ feriados: ["2026-08-04"] });
    const p = proporPrazo({
      hoje: SEGUNDA,
      capacidade: capacidadeDe(c, "ana@gta.com"),
      config: c,
      entradas: [],
      trabalhoMin: 600,
    });
    // Mesmos 2 dias úteis, mas a terça é feriado: cai na quarta.
    expect(p.diasUteis).toBe(2);
    expect(p.data).toBe("2026-08-05");
  });

  it("sem estimativa não inventa prazo", () => {
    const p = proporPrazo({
      hoje: SEGUNDA,
      capacidade: capacidadeDe(config(), "ana@gta.com"),
      config: config(),
      entradas: [],
      trabalhoMin: 0,
    });
    expect(p).toMatchObject({ data: null, impedimento: "sem_estimativa" });
  });

  it("sem jornada não propõe prazo", () => {
    const c = config({ pessoas: { "x@gta.com": { minutosPorDia: 0 } } });
    const p = proporPrazo({
      hoje: SEGUNDA,
      capacidade: capacidadeDe(c, "x@gta.com"),
      config: c,
      entradas: [],
      trabalhoMin: 600,
    });
    expect(p).toMatchObject({ data: null, impedimento: "sem_capacidade" });
  });

  it("quem trabalha sábado entrega antes", () => {
    const c = config({ pessoas: { "sab@gta.com": { diasUteis: [1, 2, 3, 4, 5, 6] } } });
    const seisDias = { entradas: [], trabalhoMin: 480 * 5 + 240, hoje: SEGUNDA, config: c };
    const comSabado = proporPrazo({ ...seisDias, capacidade: capacidadeDe(c, "sab@gta.com") });
    const semSabado = proporPrazo({ ...seisDias, capacidade: capacidadeDe(c, "seg@gta.com") });
    expect(comSabado.data).toBe("2026-08-08"); // sábado
    expect(semSabado.data).toBe("2026-08-10"); // segunda
  });
});

describe("ocupação da janela", () => {
  const cap = capacidadeDe(config(), "ana@gta.com");
  const c = config();

  it("semana cheia é 100%", () => {
    const f = folgaNaJanela({ capacidade: cap, config: c, de: SEGUNDA, ate: "2026-08-09", pendenteMin: 480 * 5 });
    expect(f).toEqual({ capacidadeMin: 2400, comprometidoMin: 2400, folgaMin: 0, ocupacaoPct: 100 });
  });

  it("a ocupação PASSA de 100% quando não cabe", () => {
    // É o ponto da medida. Se a conta fosse "o que a fila coloca dentro da
    // janela", nunca passaria de 100%, porque a fila não aloca mais que a
    // capacidade do dia — e quem tem 60 h para uma semana de 40 h apareceria
    // igual a quem tem exatamente 40 h.
    const f = folgaNaJanela({ capacidade: cap, config: c, de: SEGUNDA, ate: "2026-08-09", pendenteMin: 480 * 7 });
    expect(f.ocupacaoPct).toBeCloseTo(140, 5);
    expect(f.folgaMin).toBe(-960);
  });

  it("a janela encurta conforme a semana passa", () => {
    // Na quinta sobram 2 dias úteis, não 5.
    const f = folgaNaJanela({ capacidade: cap, config: c, de: "2026-08-06", ate: "2026-08-09", pendenteMin: 0 });
    expect(f.capacidadeMin).toBe(960);
  });

  it("capacidade zero devolve null, nunca NaN nem Infinity", () => {
    const semJornada = capacidadeDe(config({ pessoas: { x: { minutosPorDia: 0 } } }), "x");
    const f = folgaNaJanela({ capacidade: semJornada, config: c, de: SEGUNDA, ate: "2026-08-09", pendenteMin: 300 });
    expect(f.ocupacaoPct).toBe(null);
    expect(Number.isNaN(f.ocupacaoPct as unknown as number)).toBe(false);
  });

  it("janela sem nenhum dia útil também devolve null", () => {
    // Sábado a domingo para quem trabalha seg-sex.
    const f = folgaNaJanela({ capacidade: cap, config: c, de: "2026-08-08", ate: "2026-08-09", pendenteMin: 300 });
    expect(f.capacidadeMin).toBe(0);
    expect(f.ocupacaoPct).toBe(null);
  });
});

describe("sugestão de responsável", () => {
  const pessoas = [
    { email: "ana@gta.com", nome: "Ana" },
    { email: "bruno@gta.com", nome: "Bruno" },
    { email: "carla@gta.com", nome: "Carla" },
  ];
  const base = {
    hoje: SEGUNDA,
    config: config({ estimativas: { orcamentos: 240 } }),
    pessoas,
    trabalhoMin: 240,
    ...janelas(SEGUNDA),
  };

  it("com todo mundo livre, sugere na ordem alfabética (empate estável)", () => {
    const r = sugerirResponsaveis({ ...base, tarefas: [] });
    expect(r.map((c) => c.nome)).toEqual(["Ana", "Bruno", "Carla"]);
    // Rodar de novo com a lista embaralhada devolve a mesma ordem.
    const outra = sugerirResponsaveis({ ...base, pessoas: [...pessoas].reverse(), tarefas: [] });
    expect(outra.map((c) => c.nome)).toEqual(["Ana", "Bruno", "Carla"]);
  });

  it("quem tem menos trabalho vem primeiro", () => {
    const tarefas = [
      tarefa({ id: "1", responsavel: "ana@gta.com", estimativaMin: 480 * 3 }),
      tarefa({ id: "2", responsavel: "bruno@gta.com", estimativaMin: 480 }),
    ];
    const r = sugerirResponsaveis({ ...base, tarefas });
    expect(r[0].nome).toBe("Carla"); // sem nada na fila
    expect(r.map((c) => c.nome).indexOf("Bruno")).toBeLessThan(r.map((c) => c.nome).indexOf("Ana"));
  });

  it("a ordem é a data de entrega, não a folga em minutos", () => {
    // A armadilha: Ana tem jornada de 8 h e 1.100 min de fila; Diego tem
    // jornada de 4 h e nada na fila. Ana termina a semana com MAIS minutos
    // livres (1.300 contra 1.200) — ordenar por folga a escolheria. Só que
    // Diego entrega na terça e Ana na quarta, então Diego é quem serve.
    const c = config({
      pessoas: {
        "ana@gta.com": { minutosPorDia: 480 },
        "diego@gta.com": { minutosPorDia: 240 },
      },
    });
    const r = sugerirResponsaveis({
      ...base,
      config: c,
      pessoas: [
        { email: "ana@gta.com", nome: "Ana" },
        { email: "diego@gta.com", nome: "Diego" },
      ],
      trabalhoMin: 180,
      tarefas: [tarefa({ id: "1", responsavel: "ana@gta.com", estimativaMin: 1100 })],
    });
    const ana = r.find((x) => x.nome === "Ana")!;
    const diego = r.find((x) => x.nome === "Diego")!;

    expect(ana.semana.folgaMin).toBeGreaterThan(diego.semana.folgaMin);
    expect(diego.prazo.data).toBe("2026-08-04");
    expect(ana.prazo.data).toBe("2026-08-05");
    expect(r[0].nome).toBe("Diego");
  });

  it("quem está sem jornada vai para o fim, com o motivo", () => {
    const c = config({ pessoas: { "carla@gta.com": { minutosPorDia: 0 } } });
    const r = sugerirResponsaveis({ ...base, config: c, tarefas: [] });
    expect(r[r.length - 1].nome).toBe("Carla");
    expect(r[r.length - 1].prazo.impedimento).toBe("sem_capacidade");
  });

  it("tarefa concluída não pesa; contínua é contada à parte", () => {
    const tarefas = [
      tarefa({ id: "1", responsavel: "ana@gta.com", status: "concluida", estimativaMin: 480 * 5 }),
      tarefa({ id: "2", responsavel: "ana@gta.com", status: "continuo", estimativaMin: 480 * 5 }),
    ];
    const ana = sugerirResponsaveis({ ...base, tarefas }).find((c) => c.nome === "Ana")!;
    expect(ana.semana.comprometidoMin).toBe(0);
    expect(ana.continuas).toBe(1);
  });

  it("ao re-sugerir para uma tarefa existente, ela não conta contra ninguém", () => {
    const tarefas = [tarefa({ id: "alvo", responsavel: "ana@gta.com", estimativaMin: 480 * 4 })];
    const semIgnorar = sugerirResponsaveis({ ...base, tarefas }).find((c) => c.nome === "Ana")!;
    const ignorando = sugerirResponsaveis({ ...base, tarefas, ignorarTarefaId: "alvo" }).find(
      (c) => c.nome === "Ana",
    )!;
    expect(semIgnorar.semana.comprometidoMin).toBe(480 * 4);
    expect(ignorando.semana.comprometidoMin).toBe(0);
  });

  it("a tarefa sem estimativa própria usa a média da categoria", () => {
    const tarefas = [tarefa({ id: "1", responsavel: "ana@gta.com", categoria: "Orçamentos" })];
    const ana = sugerirResponsaveis({ ...base, tarefas }).find((c) => c.nome === "Ana")!;
    expect(ana.semana.comprometidoMin).toBe(240);
  });

  it("nenhum número devolvido é NaN ou Infinity", () => {
    // Um NaN atravessa ordenação, comparação e toFixed sem lançar erro; só
    // aparece na tela, como lixo, depois de ter contaminado a ordem.
    const c = config({ pessoas: { "carla@gta.com": { minutosPorDia: 0, diasUteis: [] } } });
    const r = sugerirResponsaveis({
      ...base,
      config: c,
      tarefas: [tarefa({ id: "1", responsavel: "ana@gta.com", estimativaMin: 99_999 })],
    });
    const finito = (v: unknown): boolean =>
      v === null || typeof v !== "number" || Number.isFinite(v);
    for (const cand of r) {
      for (const bloco of [cand.prazo, cand.semana, cand.mes, { o: cand.ocupacaoComTarefaPct }]) {
        for (const v of Object.values(bloco)) expect(finito(v)).toBe(true);
      }
    }
  });
});

describe("avisos", () => {
  const cand = (over: Record<string, unknown> = {}) =>
    ({
      email: "ana@gta.com",
      nome: "Ana",
      capacidade: capacidadeDe(config(), "ana@gta.com"),
      prazo: { data: "2026-08-06", diasUteis: 4, esperaOlharMin: 240, esperaFilaMin: 0, trabalhoMin: 600 },
      semana: { capacidadeMin: 2400, comprometidoMin: 2400, folgaMin: 0, ocupacaoPct: 100 },
      mes: { capacidadeMin: 9600, comprometidoMin: 2400, folgaMin: 7200, ocupacaoPct: 25 },
      ocupacaoComTarefaPct: 125,
      continuas: 0,
      ...over,
    }) as Parameters<typeof avisosDeCapacidade>[0]["candidato"];

  it("avisa quando a tarefa passa da capacidade", () => {
    const a = avisosDeCapacidade({ candidato: cand(), origemEstimativa: "tarefa", trabalhoMin: 600 });
    expect(a.some((x) => /passa da capacidade/i.test(x.titulo))).toBe(true);
  });

  it("não avisa quando cabe", () => {
    const a = avisosDeCapacidade({
      candidato: cand({ ocupacaoComTarefaPct: 60 }),
      origemEstimativa: "tarefa",
      trabalhoMin: 600,
    });
    expect(a).toEqual([]);
  });

  it("sem estimativa, o aviso é sobre isso e mais nada", () => {
    const a = avisosDeCapacidade({ candidato: cand(), origemEstimativa: "ausente", trabalhoMin: 0 });
    expect(a).toHaveLength(1);
    expect(a[0].titulo).toMatch(/sem estimativa/i);
  });

  it("nenhum aviso é crítico — capacidade não bloqueia a criação", () => {
    const a = avisosDeCapacidade({
      candidato: cand({ continuas: 2 }),
      origemEstimativa: "tarefa",
      trabalhoMin: 600,
    });
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.nivel === "atencao")).toBe(true);
  });
});

describe("escala", () => {
  it("indexa por responsável em uma passagem, ignorando quem não tem dono", () => {
    const r = agruparPorResponsavel([
      tarefa({ id: "1", responsavel: "ana@gta.com" }),
      tarefa({ id: "2", responsavel: "bruno@gta.com" }),
      tarefa({ id: "3", responsavel: "ana@gta.com" }),
      tarefa({ id: "4", responsavel: "" }),
    ]);
    expect(r.get("ana@gta.com")).toHaveLength(2);
    expect(r.get("bruno@gta.com")).toHaveLength(1);
    expect(r.has("")).toBe(false);
    expect(r.get("ninguem@gta.com")).toBeUndefined();
  });

  it("a tarefa ignorada não entra no índice", () => {
    const r = agruparPorResponsavel([tarefa({ id: "alvo", responsavel: "ana@gta.com" })], "alvo");
    expect(r.get("ana@gta.com")).toBeUndefined();
  });

  it("aguenta uma base grande sem degradar", () => {
    // A sugestão recalcula a cada tecla no campo de estimativa. Filtrar a lista
    // inteira dentro do laço de pessoas seria O(pessoas × tarefas) e travaria a
    // digitação numa base madura — daí o índice.
    const pessoas = Array.from({ length: 60 }, (_, i) => ({
      email: `p${i}@gta.com`,
      nome: `Pessoa ${String(i).padStart(2, "0")}`,
    }));
    const tarefas = Array.from({ length: 3000 }, (_, i) =>
      tarefa({ id: `t${i}`, responsavel: `p${i % 60}@gta.com`, estimativaMin: 60 }),
    );

    const inicio = Date.now();
    const r = sugerirResponsaveis({
      hoje: SEGUNDA,
      config: config(),
      pessoas,
      tarefas,
      trabalhoMin: 120,
      ...janelas(SEGUNDA),
    });
    const decorrido = Date.now() - inicio;

    expect(r).toHaveLength(60);
    // Cada pessoa recebeu 50 tarefas de 1 h.
    expect(r[0].semana.comprometidoMin).toBe(3000);
    expect(r.every((c) => c.prazo.data !== null)).toBe(true);
    // Folga grande de propósito: o teste protege contra regressão catastrófica,
    // não mede desempenho absoluto (que varia com a máquina).
    expect(decorrido).toBeLessThan(3000);
  });
});

describe("comparador isolado", () => {
  const c = (nome: string, data: string | null, ocup: number | null) =>
    ({ nome, prazo: { data }, ocupacaoComTarefaPct: ocup }) as Parameters<typeof compararCandidatos>[0];

  it("data antes de ocupação, ocupação antes do nome", () => {
    expect(compararCandidatos(c("B", "2026-08-04", 90), c("A", "2026-08-05", 10))).toBeLessThan(0);
    expect(compararCandidatos(c("B", "2026-08-04", 90), c("A", "2026-08-04", 10))).toBeGreaterThan(0);
    expect(compararCandidatos(c("A", "2026-08-04", 50), c("B", "2026-08-04", 50))).toBeLessThan(0);
  });

  it("quem não tem data vai para o fim", () => {
    expect(compararCandidatos(c("A", null, 0), c("Z", "2026-12-31", 99))).toBeGreaterThan(0);
  });
});
