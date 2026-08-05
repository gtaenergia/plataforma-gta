import { describe, expect, it } from "vitest";
import {
  aplicarMarkup,
  calcularComposicaoTotal,
  custoDaEquipe,
} from "@/lib/mao-de-obra/motor";
import type { Funcao, LinhaEquipe, LinhaMaoDeObra } from "@/lib/mao-de-obra/types";

/** Os valores das fotos: quanto custa a hora de cada um para a GTA. */
const PESSOAS: Record<string, number> = {
  "tito@gtaenergia.com": 36.61,
  "gabriel@gtaenergia.com": 30.3,
  "paulovitor@gtaenergia.com": 22.72,
  "matheus@gtaenergia.com": 13.44,
  "marcela@gtaenergia.com": 13.44,
  "estagiario@gtaenergia.com": 0, // cadastrado, mas sem valor
};

const FUNCOES: Funcao[] = [
  { id: "eletricista", nome: "Eletricista", custoHora: 45 },
  { id: "ajudante", nome: "Ajudante", custoHora: 25 },
];

const eq = (email: string, horas: number): LinhaEquipe => ({ email, horas });
const mo = (funcaoId: string, pessoas: number, horas: number): LinhaMaoDeObra => ({ funcaoId, pessoas, horas });
const reais = (cent: number) => (cent / 100).toFixed(2);

describe("a folha do dono, agora como custo INTERNO", () => {
  it("reproduz os quatro números escritos à mão", () => {
    // "60 dias, ou seja 44 dias úteis. Eu gastaria 1 h/dia, Matheus 4,8 h/dia."
    // Para custo o que vale é o total: 44 × 1 e 44 × 4,8.
    const c = calcularComposicaoTotal(
      { interna: [eq("gabriel@gtaenergia.com", 44), eq("matheus@gtaenergia.com", 44 * 4.8)] },
      { funcoes: FUNCOES, pessoas: PESSOAS },
      { imposto: 0.15, margem: 0.35 },
    );
    expect(reais(c.custoAdministrativoCent)).toBe("4171.73"); // folha: 4.171,72
    expect(reais(c.precoCent)).toBe("8343.46"); // folha: 8.343,45
    expect(reais(c.impostoCent)).toBe("1251.52"); // folha: 1.251,51
    expect(reais(c.lucroCent)).toBe("2920.21"); // folha: 2.920,22
    expect(c.markup).toBeCloseTo(2, 6);
    // O centavo de diferença é arredondamento de quem fez à mão.
  });

  it("44 dias × 4,8 h/dia dá o mesmo que 211,2 h", () => {
    // É por isto que o campo guarda o TOTAL: a divisão diária é conceito de
    // prazo, não de custo.
    const porDia = calcularComposicaoTotal(
      { interna: [eq("matheus@gtaenergia.com", 44 * 4.8)] },
      { funcoes: [], pessoas: PESSOAS },
      { imposto: 0.15, margem: 0.35 },
    );
    const total = calcularComposicaoTotal(
      { interna: [eq("matheus@gtaenergia.com", 211.2)] },
      { funcoes: [], pessoas: PESSOAS },
      { imposto: 0.15, margem: 0.35 },
    );
    expect(total.precoCent).toBe(porDia.precoCent);
  });
});

describe("as duas fontes juntas", () => {
  const entrada = {
    interna: [eq("gabriel@gtaenergia.com", 10)],
    terceirizada: [mo("eletricista", 1, 20)],
  };

  it("o detalhamento fecha com o total", () => {
    // É o que a ficha do orçamento grava separado; se não fechar, o dono soma
    // as duas colunas e não bate com o custo.
    const c = calcularComposicaoTotal(entrada, { funcoes: FUNCOES, pessoas: PESSOAS }, { imposto: 0.07, margem: 0.3 });
    expect(c.custoAdministrativoCent + c.custoTerceirizadoCent).toBe(c.custoCent);
    expect(reais(c.custoAdministrativoCent)).toBe("303.00"); // 10 h × 30,30
    expect(reais(c.custoTerceirizadoCent)).toBe("900.00"); // 20 h × 45
  });

  it("o markup incide sobre a SOMA, não sobre cada uma", () => {
    const c = calcularComposicaoTotal(entrada, { funcoes: FUNCOES, pessoas: PESSOAS }, { imposto: 0.07, margem: 0.3 });
    // 1.203,00 / 0,63
    expect(reais(c.precoCent)).toBe("1909.52");
  });

  it("a identidade continua exata com as duas fontes", () => {
    let semente = 11;
    const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    const emails = Object.keys(PESSOAS);
    for (let i = 0; i < 400; i++) {
      const c = calcularComposicaoTotal(
        {
          interna: Array.from({ length: Math.floor(rnd() * 3) }, () =>
            eq(emails[Math.floor(rnd() * emails.length)], Math.round(rnd() * 2000) / 10),
          ),
          terceirizada: Array.from({ length: Math.floor(rnd() * 3) }, () =>
            mo(rnd() > 0.5 ? "eletricista" : "ajudante", 1 + Math.floor(rnd() * 3), Math.round(rnd() * 400) / 10),
          ),
        },
        { funcoes: FUNCOES, pessoas: PESSOAS },
        { imposto: Math.round(rnd() * 40) / 100, margem: Math.round(rnd() * 50) / 100 },
      );
      if (c.impedimento) continue;
      expect(c.custoCent + c.impostoCent + c.lucroCent, `rodada ${i}`).toBe(c.precoCent);
      expect(c.custoAdministrativoCent + c.custoTerceirizadoCent, `rodada ${i}`).toBe(c.custoCent);
    }
  });
});

describe("cada caso vai ser um caso", () => {
  it("só custo administrativo", () => {
    const c = calcularComposicaoTotal(
      { interna: [eq("tito@gtaenergia.com", 8)] },
      { funcoes: FUNCOES, pessoas: PESSOAS },
      { imposto: 0.07, margem: 0.3 },
    );
    expect(c.custoTerceirizadoCent).toBe(0);
    expect(reais(c.custoAdministrativoCent)).toBe("292.88");
  });

  it("só terceirização", () => {
    const c = calcularComposicaoTotal(
      { terceirizada: [mo("ajudante", 2, 8)] },
      { funcoes: FUNCOES, pessoas: PESSOAS },
      { imposto: 0.07, margem: 0.3 },
    );
    expect(c.custoAdministrativoCent).toBe(0);
    expect(reais(c.custoTerceirizadoCent)).toBe("400.00");
  });

  it("nenhuma das duas devolve zeros, sem quebrar", () => {
    const c = calcularComposicaoTotal({}, { funcoes: FUNCOES, pessoas: PESSOAS }, { imposto: 0.07, margem: 0.3 });
    expect(c.custoCent).toBe(0);
    expect(c.precoCent).toBe(0);
    expect(c.markup).toBe(0);
    expect(c.impedimento).toBeUndefined();
  });
});

describe("custoDaEquipe", () => {
  it("marca incompleta a pessoa sem custo cadastrado", () => {
    const r = custoDaEquipe([eq("estagiario@gtaenergia.com", 40)], PESSOAS);
    expect(r.incompleta).toBe(true);
    expect(r.custoCent).toBe(0);
  });

  it("marca incompleta quem nem está no cadastro", () => {
    const r = custoDaEquipe([eq("ninguem@gtaenergia.com", 10)], PESSOAS);
    expect(r.incompleta).toBe(true);
  });

  it("horas zeradas não viram pendência", () => {
    // Quem digitou 0 quis 0 — cobrar preenchimento aqui seria ruído.
    const r = custoDaEquipe([eq("estagiario@gtaenergia.com", 0)], PESSOAS);
    expect(r.incompleta).toBe(false);
  });

  it("não se perde com maiúsculas no e-mail", () => {
    // O e-mail chega de um select, de um jsonb antigo ou digitado — a chave do
    // cadastro é minúscula.
    const r = custoDaEquipe([eq("Gabriel@GTAEnergia.com", 10)], PESSOAS);
    expect(reais(r.custoCent)).toBe("303.00");
  });

  it("absorve número inválido", () => {
    const r = custoDaEquipe(
      [
        { email: "gabriel@gtaenergia.com", horas: Number.NaN },
        { email: "gabriel@gtaenergia.com", horas: -8 },
        { email: "gabriel@gtaenergia.com", horas: Number.POSITIVE_INFINITY },
      ],
      PESSOAS,
    );
    expect(Number.isFinite(r.custoCent)).toBe(true);
    expect(r.custoCent).toBe(0);
  });
});

describe("aplicarMarkup", () => {
  it("recusa divisor zero ou negativo", () => {
    for (const [imp, mg] of [
      [0.6, 0.4],
      [0.7, 0.5],
    ]) {
      const p = aplicarMarkup(100000, { imposto: imp, margem: mg });
      expect(p.impedimento, `${imp}/${mg}`).toBe("divisor_invalido");
      expect(p.precoCent).toBe(0);
    }
  });

  it("o lucro é o resto, e a identidade fecha", () => {
    // 1234,56 é o tipo de número que expõe erro de arredondamento.
    const p = aplicarMarkup(123456, { imposto: 0.0702, margem: 0.3 });
    expect(123456 + p.impostoCent + p.lucroCent).toBe(p.precoCent);
  });

  it("custo zero não vira markup infinito", () => {
    const p = aplicarMarkup(0, { imposto: 0.07, margem: 0.3 });
    expect(p.markup).toBe(0);
    expect(p.precoCent).toBe(0);
  });
});
