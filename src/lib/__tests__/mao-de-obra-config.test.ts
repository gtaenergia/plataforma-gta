import { describe, expect, it } from "vitest";
import { normalizarConfig } from "@/lib/mao-de-obra/config";
import { CONFIG_MAO_DE_OBRA_PADRAO } from "@/lib/mao-de-obra/types";

describe("normalizarConfig", () => {
  it("devolve o padrão quando não há nada salvo", () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_MAO_DE_OBRA_PADRAO);
    expect(normalizarConfig(undefined)).toEqual(CONFIG_MAO_DE_OBRA_PADRAO);
  });

  it("não derruba a tela com configuração corrompida", () => {
    // Um JSON estranho no banco não pode impedir a equipe de orçar. Cai no
    // padrão, que a tela já sabe sinalizar como "sem custo cadastrado".
    const lixo = { funcoes: "isto não é uma lista", impostoPadrao: "abc" } as never;
    expect(normalizarConfig(lixo)).toEqual(CONFIG_MAO_DE_OBRA_PADRAO);
  });

  it("descarta id repetido", () => {
    // Dois ids iguais fazem o Map do motor guardar só o último, e a linha do
    // orçamento passa a apontar em silêncio para o custo errado.
    const c = normalizarConfig({
      funcoes: [
        { id: "a", nome: "Eletricista", custoHora: 45 },
        { id: "a", nome: "Ajudante", custoHora: 25 },
        { id: "b", nome: "Técnico", custoHora: 60 },
      ],
      impostoPadrao: 0.07,
      margemPadrao: 0.3,
    });
    expect(c.funcoes.map((f) => f.id)).toEqual(["a", "b"]);
    // Fica o PRIMEIRO: quem já usou esse id no orçamento apontava para ele.
    expect(c.funcoes[0].nome).toBe("Eletricista");
  });

  it("preenche o que faltar sem apagar o que veio", () => {
    const c = normalizarConfig({ impostoPadrao: 0.15 });
    expect(c.impostoPadrao).toBe(0.15);
    expect(c.margemPadrao).toBe(CONFIG_MAO_DE_OBRA_PADRAO.margemPadrao);
    expect(c.funcoes.length).toBeGreaterThan(0);
  });

  it("recusa percentual fora da faixa caindo no padrão", () => {
    // 1,5 seria 150% — divisor negativo e preço negativo lá na frente.
    expect(normalizarConfig({ impostoPadrao: 1.5 })).toEqual(CONFIG_MAO_DE_OBRA_PADRAO);
    expect(normalizarConfig({ margemPadrao: -0.2 })).toEqual(CONFIG_MAO_DE_OBRA_PADRAO);
  });
});

describe("padrões de fábrica", () => {
  it("as funções nascem SEM custo", () => {
    // Número inventado aqui viraria preço enviado a cliente sem ninguém ter
    // conferido. Zero é honesto e a tela cobra o preenchimento.
    for (const f of CONFIG_MAO_DE_OBRA_PADRAO.funcoes) {
      expect(f.custoHora, f.nome).toBe(0);
    }
  });

  it("imposto e margem NÃO nascem em zero", () => {
    // Zero aqui não seria "falta cadastrar": seria vender pelo custo, sem
    // imposto e sem lucro — plausível demais para alguém notar.
    expect(CONFIG_MAO_DE_OBRA_PADRAO.impostoPadrao).toBeGreaterThan(0);
    expect(CONFIG_MAO_DE_OBRA_PADRAO.margemPadrao).toBeGreaterThan(0);
  });

  it("os padrões deixam um divisor válido", () => {
    const { impostoPadrao, margemPadrao } = CONFIG_MAO_DE_OBRA_PADRAO;
    expect(impostoPadrao + margemPadrao).toBeLessThan(1);
  });

  it("nenhum id repetido de fábrica", () => {
    const ids = CONFIG_MAO_DE_OBRA_PADRAO.funcoes.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
