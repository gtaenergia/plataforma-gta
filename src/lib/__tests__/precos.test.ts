import { describe, expect, it } from "vitest";
import { CABECALHO, gerarCsv, lerCsv } from "@/lib/precos/csv";

/** O separador da planilha; nenhuma descrição do catálogo o contém. */
const SEP_TESTE = ";";
import {
  CATALOGO_PADRAO,
  DIAS_PARA_REVISAO,
  diasRestantes,
  indicePorId,
  mesclarCatalogo,
  pendentesEntre,
  precisaRevisao,
} from "@/lib/precos/catalogo";
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

  it("id salvo que não existe mais no código, e sem descrição, é descartado", () => {
    const r = mesclarCatalogo([{ id: "item.extinto", preco: 50 }]);
    expect(r.some((i) => i.id === "item.extinto")).toBe(false);
  });

  it("nenhum id de fábrica carrega prefixo de serviço", () => {
    // O prefixo dizia a quem o material pertencia, e a resposta é "a ninguém":
    // o mesmo cabo entra num carregador e numa proposta de mão de obra.
    for (const i of CATALOGO_PADRAO) expect(i.id).not.toMatch(/^carregador\./);
  });

  it("revisão gravada com o id antigo continua valendo", () => {
    /*
     * A migração silenciosa que este teste existe para impedir: os ids já
     * foram `carregador.<material>`, e `mesclarCatalogo` casa POR ID. Sem a
     * tradução, TODA revisão de preço feita antes da mudança deixaria de casar
     * e a lista voltaria ao padrão de fábrica — sem erro, sem aviso, com a
     * proposta saindo mais barata do que devia.
     */
    const alvo = CATALOGO_PADRAO.find((i) => i.id === "cabo.10")!;
    const item = mesclarCatalogo([{ id: "cabo.10", preco: 99 }]).find((i) => i.id === "cabo.10")!;
    expect(item.preco).toBe(99);
    expect(item.descricao).toBe(alvo.descricao);
  });

  it("preço salvo inválido cai no padrão em vez de contaminar o cálculo", () => {
    const alvo = CATALOGO_PADRAO[0];
    for (const ruim of [Number.NaN, -5, Number.POSITIVE_INFINITY]) {
      const item = mesclarCatalogo([{ id: alvo.id, preco: ruim }]).find((i) => i.id === alvo.id)!;
      expect(item.preco).toBe(alvo.preco);
    }
  });

  /**
   * O prazo é o MESMO para todo material; o relógio é que é individual.
   *
   * Cada item conta a partir da própria revisão, então atualizar um reinicia
   * só o dele — é o que mantém o preço justo sem obrigar a revisar a lista
   * inteira de uma vez.
   */
  describe("validade", () => {
    const dia = 86_400_000;
    const ha = (d: number) => new Date(Date.now() - d * dia).toISOString();

    it("são três meses para todos", () => {
      expect(DIAS_PARA_REVISAO).toBe(90);
    });

    it("vence pela idade do próprio preço", () => {
      expect(precisaRevisao(ha(DIAS_PARA_REVISAO + 1))).toBe(true);
      expect(precisaRevisao(ha(DIAS_PARA_REVISAO - 1))).toBe(false);
      expect(precisaRevisao(ha(0))).toBe(false);
    });

    it("a tela mostra quanto FALTA, não quanto passou", () => {
      expect(diasRestantes(ha(0))).toBe(DIAS_PARA_REVISAO);
      expect(diasRestantes(ha(30))).toBe(DIAS_PARA_REVISAO - 30);
    });

    it("vencido devolve negativo, que é o tamanho do atraso", () => {
      expect(diasRestantes(ha(DIAS_PARA_REVISAO + 12))).toBe(-12);
    });

    it("data ilegível conta como vencida, nunca como nova", () => {
      expect(precisaRevisao("não é data")).toBe(true);
      expect(diasRestantes("não é data")).toBeLessThan(0);
    });

    it("revisar um material reinicia só o relógio dele", () => {
      const [revisado, esquecido] = CATALOGO_PADRAO;
      const itens = mesclarCatalogo([
        { id: revisado.id, preco: 10, atualizadoEm: ha(0) },
        { id: esquecido.id, preco: 20, atualizadoEm: ha(DIAS_PARA_REVISAO + 30) },
      ]);
      const de = (id: string) => itens.find((i) => i.id === id)!.atualizadoEm;
      expect(precisaRevisao(de(revisado.id))).toBe(false);
      expect(precisaRevisao(de(esquecido.id))).toBe(true);
    });
  });

  /**
   * Excluir vale para QUALQUER material — todos são tratados igual.
   *
   * Para os que o código define, apagar o registro não basta: a definição
   * segue no `CATALOGO_PADRAO` e o item voltaria na leitura seguinte. Daí a
   * lápide.
   */
  describe("exclusão", () => {
    it("material do código sai da lista quando enterrado", () => {
      const alvo = CATALOGO_PADRAO[0];
      const r = mesclarCatalogo([], undefined, [alvo.id]);
      expect(r.some((i) => i.id === alvo.id)).toBe(false);
      expect(r).toHaveLength(CATALOGO_PADRAO.length - 1);
    });

    it("a lápide entende o id no formato antigo", () => {
      const r = mesclarCatalogo([], undefined, ["carregador.cabo.10"]);
      expect(r.some((i) => i.id === "cabo.10")).toBe(false);
    });

    it("material da equipe também sai", () => {
      const salvo = [{ id: "luva-de-raspa", preco: 12, descricao: "Luva de raspa", categoria: "EPI", unidade: "par" }];
      expect(mesclarCatalogo(salvo).some((i) => i.id === "luva-de-raspa")).toBe(true);
      expect(mesclarCatalogo(salvo, undefined, ["luva-de-raspa"]).some((i) => i.id === "luva-de-raspa")).toBe(false);
    });
  });
});

describe("planilha de materiais — ida e volta", () => {
  /**
   * Preenche a coluna PRECO_NOVO das linhas de dados, poupando o exemplo.
   *
   * Por POSIÇÃO, e não por regex no fim da linha: PRECO_NOVO deixou de ser a
   * última coluna quando VALIDADE_DIAS entrou, e o ajudante passou a preencher
   * a coluna errada em silêncio.
   */
  const iPrecoNovo = CABECALHO.indexOf("PRECO_NOVO");
  const preencher = (csv: string, valor = "123,45") => {
    const linhas = csv.trim().split("\r\n");
    const dados = linhas.slice(1, -1).map((l) => {
      const col = l.split(SEP_TESTE);
      col[iPrecoNovo] = `"${valor}"`;
      return col.join(SEP_TESTE);
    });
    return [linhas[0], ...dados, linhas[linhas.length - 1]].join("\r\n");
  };

  it("o que sai volta igual", () => {
    const r = lerCsv(preencher(gerarCsv(CATALOGO_PADRAO.slice(0, 5))));
    expect(r.precos).toHaveLength(5);
    expect(r.precos[0].preco).toBe(123.45);
    expect(r.problemas).toEqual([]);
  });

  it("linha em branco é ignorada de propósito, não é erro", () => {
    const r = lerCsv(gerarCsv(CATALOGO_PADRAO.slice(0, 3)));
    expect(r.precos).toHaveLength(0);
    // 3 itens + a linha de exemplo, que também sai sem preço.
    expect(r.emBranco).toBe(4);
    expect(r.problemas).toEqual([]);
  });

  it("a planilha ensina a acrescentar material, e o exemplo não vira item", () => {
    const csv = gerarCsv(CATALOGO_PADRAO.slice(0, 2));
    expect(csv).toMatch(/id em branco cria material novo/);
    expect(lerCsv(csv).problemas).toEqual([]);
  });

  it("aceita os dois formatos de número", () => {
    const csv = 'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n"a";"x";"y";"un";"1,00";"1.234,56"\n"b";"x";"y";"un";"1,00";"78.90"\n"c";"x";"y";"un";"1,00";"R$ 12,00"';
    expect(lerCsv(csv).precos.map((p) => [p.id, p.preco])).toEqual([
      ["a", 1234.56],
      ["b", 78.9],
      ["c", 12],
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
    expect(lerCsv(csv).precos.map((p) => [p.id, p.preco])).toEqual([["z", 9.99], ["a", 1.11]]);
  });

  it("colar só os dados, sem cabeçalho, também funciona", () => {
    const r = lerCsv('"dps";"x";"y";"un";"60,00";"75,00"');
    expect(r.precos.map((p) => [p.id, p.preco])).toEqual([["dps", 75]]);
  });

  // ---------------------------------------------- acrescentar material novo

  it("linha com id em branco e descrição preenchida vira material novo", () => {
    // Aspas dentro de campo se DOBRAM no CSV — é assim que o Excel escreve
    // a polegada, e a leitura precisa devolver uma só.
    const csv =
      'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n' +
      '"";"Ferramentas";"Disco de corte 4.1/2""";"un";"";"18,90"';
    const [linha] = lerCsv(csv).precos;
    expect(linha.id).toBeUndefined();
    expect(linha.descricao).toBe('Disco de corte 4.1/2"');
    expect(linha.categoria).toBe("Ferramentas");
    expect(linha.preco).toBe(18.9);
  });

  it("a polegada sobrevive à ida e volta pela planilha", () => {
    // `Luva galvanizada 1"` termina em aspa, e o CSV a escreve dobrada. Uma
    // limpeza a mais na leitura comia essa aspa e a descrição voltava truncada.
    const luva = CATALOGO_PADRAO.find((i) => i.descricao.endsWith('"'))!;
    const [linha] = lerCsv(preencher(gerarCsv([luva]))).precos;
    expect(linha.descricao).toBe(luva.descricao);
  });

  it("linha sem id E sem descrição não tem o que gravar", () => {
    const csv = 'id;categoria;descricao;unidade;preco_atual;PRECO_NOVO\n"";"x";"";"un";"";"10,00"';
    const r = lerCsv(csv);
    expect(r.precos).toEqual([]);
    expect(r.problemas[0].motivo).toMatch(/sem id e sem descri/i);
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
    const depois = gerarBomEV(s, 20, 1, { ...idx, "cabo.10": idx["cabo.10"] * 2 }).custoMateriais;
    expect(depois).toBeGreaterThan(antes);
  });

  it("o DPS revisado aparece na linha do DPS", () => {
    const idx = { ...indicePorId(CATALOGO_PADRAO), "dps": 111 };
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
    expect(pendentes.some((p) => p.id === "cabo.70")).toBe(false);
  });

  it("revisar UM material tira só ele do aviso — o carimbo é por item", () => {
    const comUmRevisado = tudoVencido.map((c) =>
      c.id === "dps" ? { ...c, atualizadoEm: hoje } : c,
    );
    const antes = pendentesEntre(tudoVencido, idsUsados).length;
    const depois = pendentesEntre(comUmRevisado, idsUsados);
    expect(depois.length).toBe(antes - 1);
    expect(depois.some((p) => p.id === "dps")).toBe(false);
  });

  it("conferência recente não gera aviso nenhum", () => {
    expect(pendentesEntre(CATALOGO_PADRAO, idsUsados)).toEqual([]);
  });

  it("com tudo revisado, não sobra aviso", () => {
    expect(pendentesEntre(CATALOGO_PADRAO.map((c) => ({ ...c, atualizadoEm: hoje })), idsUsados)).toEqual([]);
  });
});
