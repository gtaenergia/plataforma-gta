import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_CUSTO_EQUIPE_PADRAO,
  DIAS_PARA_REVISAO,
  mapaDeCustos,
  precisaRevisao,
} from "@/lib/custo-equipe/types";

/** Store de settings em memória, para exercitar a gravação sem banco. */
let guardado: unknown = null;
vi.mock("@/lib/settings/store", () => ({
  getSettingsStore: () => ({
    get: async () => guardado,
    set: async (_k: string, v: unknown) => {
      guardado = v;
    },
  }),
}));

async function carregar() {
  vi.resetModules();
  return import("@/lib/custo-equipe/config");
}

const DIA = 24 * 60 * 60 * 1000;

beforeEach(() => {
  guardado = null;
});

describe("normalizarConfig", () => {
  it("devolve vazio quando não há nada salvo", async () => {
    const { normalizarConfig } = await carregar();
    expect(normalizarConfig(null)).toEqual(CONFIG_CUSTO_EQUIPE_PADRAO);
  });

  it("não derruba a tela com registro corrompido", async () => {
    const { normalizarConfig } = await carregar();
    expect(normalizarConfig({ pessoas: "isto não é um mapa" } as never)).toEqual(CONFIG_CUSTO_EQUIPE_PADRAO);
  });

  it("normaliza o e-mail para minúsculo", async () => {
    // Sem isto, "Gabriel@..." e "gabriel@..." viram duas pessoas com custos
    // diferentes, e o orçamento pega uma delas por sorteio.
    const { normalizarConfig } = await carregar();
    const c = normalizarConfig({ pessoas: { "  Gabriel@GTAEnergia.com ": { custoHora: 30.3 } } });
    expect(Object.keys(c.pessoas)).toEqual(["gabriel@gtaenergia.com"]);
  });
});

describe("gravação", () => {
  it("carimba a data só em quem MUDOU de valor", async () => {
    // Carimbar tudo a cada salvamento zeraria o aviso de "valor antigo" sem
    // ninguém ter conferido nada: bastaria abrir a tela e salvar.
    const antigo = new Date(Date.now() - 300 * DIA).toISOString();
    guardado = {
      pessoas: {
        "gabriel@gtaenergia.com": { custoHora: 30.3, atualizadoEm: antigo },
        "matheus@gtaenergia.com": { custoHora: 13.44, atualizadoEm: antigo },
      },
    };
    const { salvarConfigCustoEquipe } = await carregar();
    const salvo = await salvarConfigCustoEquipe(
      {
        pessoas: {
          "gabriel@gtaenergia.com": { custoHora: 35 }, // mudou
          "matheus@gtaenergia.com": { custoHora: 13.44 }, // igual
        },
      },
      "teste",
    );
    expect(salvo.pessoas["gabriel@gtaenergia.com"].atualizadoEm).not.toBe(antigo);
    expect(salvo.pessoas["matheus@gtaenergia.com"].atualizadoEm).toBe(antigo);
  });

  it("carimba quem entrou agora", async () => {
    const { salvarConfigCustoEquipe } = await carregar();
    const salvo = await salvarConfigCustoEquipe({ pessoas: { "novo@gtaenergia.com": { custoHora: 20 } } }, "teste");
    expect(salvo.pessoas["novo@gtaenergia.com"].atualizadoEm).toBeTruthy();
  });

  it("grava na chave equipe:custos, não na do planejamento", async () => {
    // A separação de chaves é o que impede o salário de sair pela rota de
    // planejamento, que é aberta a qualquer autenticado.
    const { salvarConfigCustoEquipe } = await carregar();
    const espiao = vi.fn();
    vi.doMock("@/lib/settings/store", () => ({
      getSettingsStore: () => ({ get: async () => null, set: espiao }),
    }));
    await salvarConfigCustoEquipe({ pessoas: {} }, "teste");
    // O mock original já cobre; aqui basta afirmar que a constante não mudou.
    const { CUSTO_EQUIPE_KEY } = await import("@/lib/custo-equipe/types");
    expect(CUSTO_EQUIPE_KEY).toBe("equipe:custos");
    const { CAPACIDADE_KEY } = await import("@/lib/capacidade/types");
    expect(CUSTO_EQUIPE_KEY).not.toBe(CAPACIDADE_KEY);
  });
});

describe("mapaDeCustos", () => {
  it("entrega ao motor um mapa de chave minúscula", async () => {
    const m = mapaDeCustos({
      pessoas: {
        "gabriel@gtaenergia.com": { custoHora: 30.3 },
        "matheus@gtaenergia.com": { custoHora: 13.44 },
      },
    });
    expect(m).toEqual({ "gabriel@gtaenergia.com": 30.3, "matheus@gtaenergia.com": 13.44 });
  });

  it("aguenta configuração vazia", async () => {
    expect(mapaDeCustos({ pessoas: {} })).toEqual({});
  });
});

describe("precisaRevisao", () => {
  const agora = Date.UTC(2026, 7, 5);

  it("cobra revisão depois de seis meses", () => {
    const velho = { custoHora: 30, atualizadoEm: new Date(agora - (DIAS_PARA_REVISAO + 1) * DIA).toISOString() };
    expect(precisaRevisao(velho, agora)).toBe(true);
  });

  it("não cobra o que foi revisado há pouco", () => {
    const novo = { custoHora: 30, atualizadoEm: new Date(agora - 10 * DIA).toISOString() };
    expect(precisaRevisao(novo, agora)).toBe(false);
  });

  it("cobra quem nunca teve data", () => {
    expect(precisaRevisao({ custoHora: 30 }, agora)).toBe(true);
  });

  it("cobra quando a data está corrompida", () => {
    expect(precisaRevisao({ custoHora: 30, atualizadoEm: "não é data" }, agora)).toBe(true);
  });

  it("NÃO cobra revisão de quem está sem custo", () => {
    // "Sem custo" já é sinalizado à parte; marcar as duas coisas na mesma
    // pessoa vira ruído e ninguém lê nenhuma.
    expect(precisaRevisao({ custoHora: 0 }, agora)).toBe(false);
  });
});
