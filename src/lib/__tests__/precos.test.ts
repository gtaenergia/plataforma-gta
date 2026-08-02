import { describe, expect, it } from "vitest";
import { gerarCsv, lerCsv } from "@/lib/precos/csv";
import { CATALOGO_PADRAO, indicePorId, mesclarCatalogo, pendentesEntre, precisaRevisao, DIAS_PARA_REVISAO } from "@/lib/precos/catalogo";
import { dimensionarEV, gerarBomEV } from "@/services/carregador/engine";

describe("catálogo de preços", () => {
  it("todo id é único — é a chave que amarra planilha e cálculo", () => {
    const ids = CATALOGO_PADRAO.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nenhum item nasce sem preço ou sem unidade", () => {
    for (const i of CATALOGO_PADRAO) {
      expect(i.preco).toBeGreaterThan(0);
      expect(i.unidade.trim()).not.toBe("");
      expect(i.descricao.trim()).not.toBe("");
    }
  });

  it("o salvo vence no preço; a estrutura continua vindo do código", () => {
    const alvo = CATALOGO_PADRAO[0];
    const r = mesclarCatalogo([{ id: alvo.id, preco: 999 }]);
    const item = r.find((i) => i.id === alvo.id)!;
    expect(item.preco).toBe(999);
    expect(item.descricao).toBe(alvo.descricao);
    expect(r).toHaveLength(CATALOGO_PADRAO.length);
  });

  it("id salvo que não existe mais no código é descartado", () => {
    const r = mesclarCatalogo([{ id: "carregador.item.extinto", preco: 50 }]);
    expect(r.some((i) => i.id === "carregador.item.extinto")).toBe(false);
  });

  it("preço salvo inválido cai no padrão em vez de contaminar o cálculo", () => {
    const alvo = CATALOGO_PADRAO[0];
    for (const ruim of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const item = mesclarCatalogo([{ id: alvo.id, preco: ruim }]).find((i) => i.id === alvo.id)!;
      expect(item.preco).toBe(alvo.preco);
    }
  });

  it("a revisão vence pela idade", () => {
    const dia = 86_400_000;
    expect(precisaRevisao(new Date(Date.now() - (DIAS_PARA_REVISAO + 1) * dia).toISOString())).toBe(true);
    expect(precisaRevisao(new Date().toISOString())).toBe(false);
  });
});

describe("planilha de revisão — ida e volta", () => {
  it("o que sai volta igual", () => {
    const csv = gerarCsv(CATALOGO_PADRAO.slice(0, 5));
    // Simula o preenchimento da coluna PRECO_NOVO.
    const linhas = csv.trim().split("\r\n");
    const preenchido = [linhas[0], ...linhas.slice(1).map((l) => l.replace(/""$/, '"123,45"'))].join("\r\n");
    const r = lerCsv(preenchido);
    expect(r.precos).toHaveLength(5);
    expect(r.precos[0].preco).toBe(123.45);
    expect(r.problemas).toEqual([]);
  });

  it("linha em branco é ignorada de propósito, não é erro", () => {
    const r = lerCsv(gerarCsv(CATALOGO_PADRAO.slice(0, 3)));
    expect(r.precos).toHaveLength(0);
    expect(r.emBranco).toBe(3);
    expect(r.problemas).toEqual([]);
  });

  it("aceita os dois formatos de número", () => {
    const csv = 'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n"a";"x";"y";"un";"1,00";"1.234,56"\n"b";"x";"y";"un";"1,00";"78.90"\n"c";"x";"y";"un";"1,00";"R$ 12,00"';
    const r = lerCsv(csv);
    expect(r.precos).toEqual([
      { id: "a", preco: 1234.56 },
      { id: "b", preco: 78.9 },
      { id: "c", preco: 12 },
    ]);
  });

  it("valor inválido vira problema apontando a linha", () => {
    const csv = 'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n"a";"x";"y";"un";"1,00";"abc"\n"b";"x";"y";"un";"1,00";"-5"';
    const r = lerCsv(csv);
    expect(r.precos).toEqual([]);
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas[0].linha).toBe(2);
    expect(r.problemas[1].motivo).toMatch(/negativo/i);
  });

  it("a planilha pode ser reordenada — quem manda é o id", () => {
    const csv = 'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n"z";"x";"y";"un";"1,00";"9,99"\n"a";"x";"y";"un";"1,00";"1,11"';
    expect(lerCsv(csv).precos).toEqual([{ id: "z", preco: 9.99 }, { id: "a", preco: 1.11 }]);
  });

  it("colar só os dados, sem cabeçalho, também funciona", () => {
    const r = lerCsv('"carregador.dps";"x";"y";"un";"60,00";"75,00"');
    expect(r.precos).toEqual([{ id: "carregador.dps", preco: 75 }]);
  });
});

describe("os preços revisados chegam ao orçamento", () => {
  const s = dimensionarEV({ potenciaKw: 7.4, fase: "mono", distanciaM: 20 });

  it("sem registro, o motor usa o padrão de fábrica", () => {
    const padrao = gerarBomEV(s, 20, 1).custoMateriais;
    const comIndice = gerarBomEV(s, 20, 1, indicePorId(CATALOGO_PADRAO)).custoMateriais;
    expect(comIndice).toBeCloseTo(padrao, 2);
  });

  it("dobrar o preço do cabo encarece a lista", () => {
    const idx = indicePorId(CATALOGO_PADRAO);
    const antes = gerarBomEV(s, 20, 1, idx).custoMateriais;
    const depois = gerarBomEV(s, 20, 1, { ...idx, "carregador.cabo.10": idx["carregador.cabo.10"] * 2 }).custoMateriais;
    expect(depois).toBeGreaterThan(antes);
  });

  it("o DPS revisado aparece na linha do DPS", () => {
    const idx = { ...indicePorId(CATALOGO_PADRAO), "carregador.dps": 111 };
    const item = gerarBomEV(s, 20, 1, idx).itens.find((i) => /DPS/.test(i.descricao))!;
    expect(item.precoUnit).toBe(111);
  });
});

describe("aviso por proposta — só o que a lista usa", () => {
  const s = dimensionarEV({ potenciaKw: 7.4, fase: "mono", distanciaM: 20 });
  const bom = gerarBomEV(s, 20, 1, indicePorId(CATALOGO_PADRAO));
  const idsUsados = bom.itens.map((i) => i.precoId).filter((x): x is string => Boolean(x));

  it("cada linha da lista sabe de qual preço veio", () => {
    expect(idsUsados.length).toBe(bom.itens.length);
    for (const id of idsUsados) {
      expect(CATALOGO_PADRAO.some((c) => c.id === id)).toBe(true);
    }
  });

  it("uma proposta usa uma fração do catálogo — é o motivo do aviso ser filtrado", () => {
    expect(new Set(idsUsados).size).toBeLessThan(CATALOGO_PADRAO.length / 2);
  });

  // Datas explícitas: o teste não pode depender de a conferência de fábrica
  // estar velha ou nova no dia em que roda.
  const vencido = new Date(Date.now() - (DIAS_PARA_REVISAO + 30) * 86_400_000).toISOString();
  const hoje = new Date().toISOString();
  const tudoVencido = CATALOGO_PADRAO.map((c) => ({ ...c, atualizadoEm: vencido }));

  it("material fora da lista não entra no aviso, mesmo vencido", () => {
    const pendentes = pendentesEntre(tudoVencido, idsUsados);
    expect(pendentes.length).toBe(new Set(idsUsados).size);
    // O cabo de 70 mm² não entra num 7,4 kW mono.
    expect(pendentes.some((p) => p.id === "carregador.cabo.70")).toBe(false);
  });

  it("revisar UM material tira só ele do aviso — o carimbo é por item", () => {
    const comUmRevisado = tudoVencido.map((c) =>
      c.id === "carregador.dps" ? { ...c, atualizadoEm: hoje } : c,
    );
    const antes = pendentesEntre(tudoVencido, idsUsados).length;
    const depois = pendentesEntre(comUmRevisado, idsUsados);
    expect(depois.length).toBe(antes - 1);
    expect(depois.some((p) => p.id === "carregador.dps")).toBe(false);
  });

  it("conferência recente não gera aviso nenhum", () => {
    expect(pendentesEntre(CATALOGO_PADRAO, idsUsados)).toEqual([]);
  });

  it("com tudo revisado, não sobra aviso", () => {
    expect(pendentesEntre(CATALOGO_PADRAO.map((c) => ({ ...c, atualizadoEm: hoje })), idsUsados)).toEqual([]);
  });
});
