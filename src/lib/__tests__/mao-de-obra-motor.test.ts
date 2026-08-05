import { describe, expect, it } from "vitest";
import { calcularComposicao, divisorDe, markupDe } from "@/lib/mao-de-obra/motor";
import type { ConfigMaoDeObra, LinhaMaoDeObra } from "@/lib/mao-de-obra/types";

const FUNCOES: Pick<ConfigMaoDeObra, "funcoes"> = {
  funcoes: [
    { id: "eletricista", nome: "Eletricista", custoHora: 45 },
    { id: "ajudante", nome: "Ajudante", custoHora: 25 },
    { id: "sem-custo", nome: "Encarregado", custoHora: 0 },
  ],
};

const linha = (funcaoId: string, pessoas: number, horas: number): LinhaMaoDeObra => ({
  funcaoId,
  pessoas,
  horas,
});

const reais = (cent: number) => (cent / 100).toFixed(2);

describe("o exemplo do áudio", () => {
  it("20 h de eletricista, imposto 7%, margem 30%", () => {
    // "vai gastar 20 horas (…) o markup da GTA é tanto, a margem de lucro tem
    // que ser 30, o imposto 7, e automaticamente."
    const c = calcularComposicao([linha("eletricista", 1, 20)], FUNCOES, {
      imposto: 0.07,
      margem: 0.3,
    });
    expect(reais(c.custoCent)).toBe("900.00");
    expect(reais(c.precoCent)).toBe("1428.57");
    expect(reais(c.impostoCent)).toBe("100.00");
    expect(reais(c.lucroCent)).toBe("428.57");
    expect(c.markup).toBeCloseTo(1.5873, 4);
    expect(c.impedimento).toBeUndefined();
  });

  it("duas pessoas × 10 h dá o mesmo que uma × 20 h", () => {
    // "então vai ser três pessoa… duas pessoas trabalhando 10 horas."
    const uma = calcularComposicao([linha("eletricista", 1, 20)], FUNCOES, { imposto: 0.07, margem: 0.3 });
    const duas = calcularComposicao([linha("eletricista", 2, 10)], FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(duas.precoCent).toBe(uma.precoCent);
  });
});

describe("a conta escrita à mão pelo dono", () => {
  it("custo 4.171,72 com imposto 15% e margem 35% dá markup 2", () => {
    // A folha traz `CMV / (1 − Imp + MC)`, com sinal de MAIS. Ao pé da letra o
    // divisor seria 1,20 e o preço 3.476,44 — número que contradiz os outros
    // quatro da mesma página. Este teste trava a leitura correta.
    const config = { funcoes: [{ id: "x", nome: "X", custoHora: 4171.72 }] };
    const c = calcularComposicao([linha("x", 1, 1)], config, { imposto: 0.15, margem: 0.35 });

    expect(divisorDe(0.15, 0.35)).toBeCloseTo(0.5, 10);
    expect(c.markup).toBeCloseTo(2, 6);
    // A folha escreve 8.343,45; a conta exata sobre 4.171,72 dá 8.343,44. O
    // centavo é arredondamento de quem fez à mão, não erro da fórmula.
    expect(reais(c.precoCent)).toBe("8343.44");
    expect(reais(c.impostoCent)).toBe("1251.52");
    expect(reais(c.lucroCent)).toBe("2920.20");
  });

  it("a leitura literal da fórmula daria outro preço", () => {
    // Guarda explícita: se alguém "corrigir" o motor para seguir o `+` da
    // folha, este teste cai.
    const literal = 4171.72 / (1 - 0.15 + 0.35);
    expect(literal).toBeCloseTo(3476.43, 2);
    expect(literal).not.toBeCloseTo(8343.44, 2);
  });
});

describe("a identidade que não pode quebrar", () => {
  it("custo + imposto + lucro === preço, sempre, em centavos", () => {
    // É o que pega erro de arredondamento. Se o lucro fosse calculado como
    // `preço × margem` em vez de resto, isto falharia de vez em quando.
    let semente = 7;
    const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 500; i++) {
      const imposto = Math.round(rnd() * 40) / 100;
      const margem = Math.round(rnd() * 50) / 100;
      const linhas = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () =>
        linha(rnd() > 0.5 ? "eletricista" : "ajudante", 1 + Math.floor(rnd() * 4), Math.round(rnd() * 400) / 10),
      );
      const c = calcularComposicao(linhas, FUNCOES, { imposto, margem });
      if (c.impedimento) continue;
      expect(c.custoCent + c.impostoCent + c.lucroCent, `rodada ${i}`).toBe(c.precoCent);
    }
  });

  it("a soma das linhas fecha com o custo total", () => {
    // A tela mostra o valor de cada linha; quem confere soma o que está vendo.
    const linhas = [linha("eletricista", 2, 7.5), linha("ajudante", 3, 4.25), linha("eletricista", 1, 0.7)];
    const c = calcularComposicao(linhas, FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(c.linhas.reduce((s, l) => s + l.custoCent, 0)).toBe(c.custoCent);
  });
});

describe("casos-limite", () => {
  it("recusa quando imposto + margem chega a 100%", () => {
    // Divisor zero: não é preço alto, é conta sem solução.
    const c = calcularComposicao([linha("eletricista", 1, 10)], FUNCOES, { imposto: 0.6, margem: 0.4 });
    expect(c.impedimento).toBe("divisor_invalido");
    expect(c.precoCent).toBe(0);
    expect(c.custoCent).toBe(45000); // o custo continua sendo informado
  });

  it("recusa quando imposto + margem passa de 100%", () => {
    // Sem a guarda o divisor fica negativo e o preço sai NEGATIVO.
    const c = calcularComposicao([linha("eletricista", 1, 10)], FUNCOES, { imposto: 0.7, margem: 0.5 });
    expect(c.impedimento).toBe("divisor_invalido");
    expect(c.precoCent).toBeGreaterThanOrEqual(0);
  });

  it("marca incompleta a função cadastrada sem custo", () => {
    // Zero é um número plausível: sem a marca, o orçamento sairia barato e
    // ninguém perceberia.
    const c = calcularComposicao([linha("sem-custo", 2, 8)], FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(c.incompleta).toBe(true);
    expect(c.custoCent).toBe(0);
  });

  it("marca incompleta a função que sumiu do catálogo", () => {
    const c = calcularComposicao([linha("apagada", 1, 8)], FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(c.linhas[0].funcao).toBeUndefined();
    expect(c.incompleta).toBe(true);
  });

  it("linha com horas zeradas não vira pendência", () => {
    // Quem digitou 0 quis 0 — cobrar preenchimento aqui seria ruído.
    const c = calcularComposicao([linha("sem-custo", 1, 0)], FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(c.incompleta).toBe(false);
  });

  it("sem linhas devolve zeros, sem dividir por zero", () => {
    const c = calcularComposicao([], FUNCOES, { imposto: 0.07, margem: 0.3 });
    expect(c.custoCent).toBe(0);
    expect(c.precoCent).toBe(0);
    expect(c.markup).toBe(0);
    expect(c.impedimento).toBeUndefined();
  });

  it("absorve número inválido vindo do formulário", () => {
    const sujo = [
      { funcaoId: "eletricista", pessoas: Number.NaN, horas: 10 },
      { funcaoId: "eletricista", pessoas: 1, horas: Number.POSITIVE_INFINITY },
      { funcaoId: "eletricista", pessoas: -5, horas: -3 },
    ];
    const c = calcularComposicao(sujo, FUNCOES, { imposto: 0.07, margem: 0.3 });
    for (const v of [c.custoCent, c.precoCent, c.impostoCent, c.lucroCent, c.markup]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("nenhum campo do retorno é NaN ou Infinity", () => {
    const c = calcularComposicao([linha("eletricista", 3, 12.5)], FUNCOES, { imposto: 0.0702, margem: 0.3 });
    for (const v of [c.custoCent, c.impostoCent, c.lucroCent, c.precoCent, c.markup]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const l of c.linhas) {
      expect(Number.isFinite(l.custoCent)).toBe(true);
      expect(Number.isFinite(l.horasTotais)).toBe(true);
    }
  });

  it("é determinístico", () => {
    const linhas = [linha("eletricista", 2, 9), linha("ajudante", 1, 6)];
    const a = calcularComposicao(linhas, FUNCOES, { imposto: 0.0702, margem: 0.3 });
    const b = calcularComposicao(linhas, FUNCOES, { imposto: 0.0702, margem: 0.3 });
    expect(b).toEqual(a);
  });
});

describe("markupDe", () => {
  it("é o inverso do divisor", () => {
    expect(markupDe(0.15, 0.35)).toBeCloseTo(2, 6); // a folha do dono
    expect(markupDe(0.07, 0.3)).toBeCloseTo(1.5873, 4); // o exemplo do áudio
    expect(markupDe(0.0702, 0.3)).toBeCloseTo(1.5878, 4); // o padrão da plataforma
    expect(markupDe(0.0702, 0.35)).toBeCloseTo(1.7247, 4); // 7,02% com a margem de 35%
  });

  it("devolve 0 em vez de Infinity quando não há divisor", () => {
    expect(markupDe(0.5, 0.5)).toBe(0);
    expect(markupDe(0.9, 0.9)).toBe(0);
  });
});
