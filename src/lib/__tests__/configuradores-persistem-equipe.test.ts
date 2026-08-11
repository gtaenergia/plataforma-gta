import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Todo configurador que grava a equipe tem que saber repor.
 *
 * Gravar e não repor é a assimetria que passa despercebida: salvar funciona,
 * a tela some, e o defeito só aparece quando alguém REABRE a proposta — e aí
 * o custo volta zerado. Nos serviços de Fator K isso derruba o preço sugerido
 * junto.
 *
 * O erro não é hipotético: ao ligar os quatro últimos serviços, um deles
 * (projeto de subestação) saiu daqui gravando e não repondo. Nenhum teste
 * pegou, nenhum tipo reclamou — só a conferência linha a linha.
 *
 * O teste lê o FONTE porque é isso que se quer garantir: não existe caminho de
 * execução para exercitar nove configuradores React sem montar nove telas.
 */

/** Apontam as DUAS frentes: quem executa o projeto e quem elaborou a proposta. */
const DUAS_FRENTES = [
  "src/components/solar/SolarConfigurator.tsx",
  "src/components/carregador/CarregadorConfigurator.tsx",
  "src/components/qgbt/QgbtConfigurator.tsx",
  "src/components/rede-mt/RedeMtConfigurator.tsx",
  "src/components/execucao-subestacao/ExecucaoSubestacaoConfigurator.tsx",
  "src/components/spda/SpdaConfigurator.tsx",
  "src/components/subestacao/SubestacaoConfigurator.tsx",
  "src/components/projeto-bt/ProjetoBtConfigurator.tsx",
  "src/components/ServicoSimplesConfigurator.tsx",
];

/**
 * Aponta SÓ a elaboração.
 *
 * Mão de obra é o caso em que a "equipe responsável" não cabe: a equipe desta
 * proposta é a que se VENDE — funções × horas × R$/h, com seção própria e
 * preço. Reaproveitar o cartão de quem executa duplicaria o mesmo custo.
 */
const SO_ELABORACAO = ["src/components/mao-de-obra/MaoDeObraConfigurator.tsx"];

describe("persistência da equipe nos configuradores", () => {
  it.each(DUAS_FRENTES)("%s grava as duas frentes e repõe as duas", (arquivo) => {
    const src = readFileSync(arquivo, "utf8");

    // Grava
    expect(src, "não grava a equipe do projeto").toContain("equipeGta: equipe.serializar()");
    expect(src, "não grava a equipe do orçamento").toContain("equipeOrcamento: equipeOrc.serializar()");

    // Repõe — a metade que é fácil esquecer
    expect(src, "grava mas não repõe a equipe do projeto").toContain("equipe.restaurar(");
    expect(src, "grava mas não repõe a equipe do orçamento").toContain("equipeOrc.restaurar(");
  });

  it.each(SO_ELABORACAO)("%s grava a elaboração e repõe", (arquivo) => {
    const src = readFileSync(arquivo, "utf8");
    expect(src, "não grava o custo de elaboração").toContain("equipeOrcamento: equipeOrc.serializar()");
    expect(src, "grava mas não repõe o custo de elaboração").toContain("equipeOrc.restaurar(");
  });

  it("nenhum configurador ficou de fora das listas", () => {
    // Uma tela nova com `useEquipeResponsavel` precisa entrar numa das duas —
    // senão ela nasce sem cobertura e o defeito volta pela porta dos fundos.
    const { globSync } = require("node:fs") as typeof import("node:fs");
    const todos = globSync("src/components/**/*Configurator.tsx").map((f: string) => f.replace(/\\/g, "/"));
    const comEquipe = todos.filter((f: string) => readFileSync(f, "utf8").includes("useEquipeResponsavel"));
    const listados = new Set([...DUAS_FRENTES, ...SO_ELABORACAO]);
    expect(comEquipe.filter((f: string) => !listados.has(f))).toEqual([]);
  });
});
