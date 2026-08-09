import { describe, expect, it } from "vitest";
import {
  camposFaltando,
  criarCampoSchema,
  mensagemDeFaltantes,
  preenchido,
  sanearValores,
  type CampoPersonalizado,
} from "@/lib/crm/campos";

const campo = (sobre: Partial<CampoPersonalizado>): CampoPersonalizado => ({
  id: "c1",
  rotulo: "Potência (kVA)",
  tipo: "numero",
  opcoes: [],
  obrigatorio: false,
  obrigatorioNaEtapaId: "",
  ajuda: "",
  ordem: 0,
  arquivado: false,
  criadoEm: "2026-08-01T00:00:00.000Z",
  atualizadoEm: "2026-08-01T00:00:00.000Z",
  ...sobre,
});

describe("preenchido", () => {
  it("zero conta como resposta — é um número, não ausência", () => {
    expect(preenchido("0")).toBe(true);
  });

  it("vazio, só espaço e lista vazia não contam", () => {
    expect(preenchido("")).toBe(false);
    expect(preenchido("   ")).toBe(false);
    expect(preenchido([])).toBe(false);
    expect(preenchido(undefined)).toBe(false);
  });
});

describe("camposFaltando", () => {
  it("obrigatório sempre cobra, em qualquer etapa", () => {
    const c = campo({ obrigatorio: true });
    expect(camposFaltando([c], {}, "qualquer")).toHaveLength(1);
    expect(camposFaltando([c], { c1: "500" }, "qualquer")).toHaveLength(0);
  });

  it("obrigatório por etapa cobra SÓ ao entrar naquela etapa", () => {
    const c = campo({ id: "dist", rotulo: "Distribuidora", tipo: "texto", obrigatorioNaEtapaId: "etapa-proposta" });
    expect(camposFaltando([c], {}, "etapa-contato")).toHaveLength(0);
    expect(camposFaltando([c], {}, "etapa-proposta")).toHaveLength(1);
    expect(camposFaltando([c], { dist: "Equatorial GO" }, "etapa-proposta")).toHaveLength(0);
  });

  it("campo arquivado nunca trava — aposentar não pode parar negociação", () => {
    const c = campo({ obrigatorio: true, arquivado: true });
    expect(camposFaltando([c], {}, "x")).toHaveLength(0);
  });

  it("cobra vários de uma vez, na ordem em que foram passados", () => {
    const faltam = camposFaltando(
      [campo({ id: "a", rotulo: "A", obrigatorio: true }), campo({ id: "b", rotulo: "B", obrigatorio: true })],
      { a: "ok" },
      "x",
    );
    expect(faltam.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("mensagemDeFaltantes", () => {
  it("nomeia o campo, e diz para onde não dá para ir", () => {
    const m = mensagemDeFaltantes([campo({ rotulo: "Distribuidora" })], "Proposta enviada");
    expect(m).toBe("Preencha o campo “Distribuidora” para avançar até Proposta enviada.");
  });

  it("plural e sem etapa", () => {
    const m = mensagemDeFaltantes([campo({ rotulo: "A" }), campo({ rotulo: "B" })]);
    expect(m).toBe("Preencha os campos “A”, “B”.");
  });
});

describe("sanearValores", () => {
  const opcao = campo({ id: "tensao", tipo: "opcao", opcoes: ["13,8 kV", "34,5 kV"] });
  const multi = campo({ id: "servicos", tipo: "multipla", opcoes: ["Projeto", "Execução"] });
  const livre = campo({ id: "uc", tipo: "texto" });

  it("descarta chave que não é campo — payload não incha o jsonb", () => {
    expect(sanearValores([livre], { uc: "123", inventado: "x" })).toEqual({ uc: "123" });
  });

  it("opção fora da lista é recusada — inclusive uma removida da configuração", () => {
    expect(sanearValores([opcao], { tensao: "69 kV" })).toEqual({});
    expect(sanearValores([opcao], { tensao: "13,8 kV" })).toEqual({ tensao: "13,8 kV" });
  });

  it("múltipla aceita só as válidas, e um valor solto vira lista", () => {
    expect(sanearValores([multi], { servicos: ["Projeto", "Inventado"] })).toEqual({ servicos: ["Projeto"] });
    expect(sanearValores([multi], { servicos: "Execução" })).toEqual({ servicos: ["Execução"] });
    expect(sanearValores([multi], { servicos: ["Nada"] })).toEqual({});
  });

  it("texto é aparado e limitado; vazio não é gravado", () => {
    expect(sanearValores([livre], { uc: "  123  " })).toEqual({ uc: "123" });
    expect(sanearValores([livre], { uc: "   " })).toEqual({});
    expect((sanearValores([livre], { uc: "x".repeat(900) }).uc as string).length).toBe(500);
  });

  it("entrada torta não derruba nada", () => {
    expect(sanearValores([livre], null)).toEqual({});
    expect(sanearValores([livre], "texto")).toEqual({});
  });
});

describe("criarCampoSchema", () => {
  it("escolha sem opções é recusada — o campo ficaria impossível de preencher", () => {
    const r = criarCampoSchema.safeParse({ rotulo: "Tensão", tipo: "opcao", opcoes: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.opcoes?.[0]).toMatch(/ao menos uma opção/);
  });

  it("texto e número não exigem opções", () => {
    expect(criarCampoSchema.safeParse({ rotulo: "UC", tipo: "texto" }).success).toBe(true);
    expect(criarCampoSchema.safeParse({ rotulo: "Potência", tipo: "numero" }).success).toBe(true);
  });

  it("rótulo é obrigatório", () => {
    expect(criarCampoSchema.safeParse({ rotulo: "  ", tipo: "texto" }).success).toBe(false);
  });
});
