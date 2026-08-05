import { describe, expect, it } from "vitest";
import { planilhaMaoDeObra } from "@/services/planilha/mao-de-obra";
import { calcularComposicao } from "@/lib/mao-de-obra/motor";

/**
 * A planilha da calculadora de mão de obra.
 *
 * O que importa aqui não é o visual: é que os NÚMEROS pré-calculados batam com
 * o motor da plataforma, e que as células saiam como FÓRMULA. Se saírem como
 * valor fixo, quem receber o arquivo muda a margem e nada acontece — e a
 * planilha deixa de ser uma calculadora para virar um retrato.
 */

const LINHAS = [
  { funcao: "Eletricista", pessoas: 1, horas: 20, custoHora: 45 },
  { funcao: "Ajudante", pessoas: 2, horas: 10, custoHora: 25 },
];

/** Custo esperado: 20 × 45 + 20 × 25 = 900 + 500 = 1.400. */
const CUSTO = 1400;

function celula(wb: ReturnType<typeof planilhaMaoDeObra>, rotulo: string) {
  const ws = wb.getWorksheet("Mão de obra")!;
  let achada: { formula?: string; result?: unknown; valor?: unknown } | null = null;
  ws.eachRow((row) => {
    if (String(row.getCell(1).value ?? "").trim() === rotulo) {
      const v = row.getCell(2).value as { formula?: string; result?: unknown } | number | null;
      achada =
        v && typeof v === "object" && "formula" in v
          ? { formula: v.formula, result: v.result }
          : { valor: v };
    }
  });
  return achada as { formula?: string; result?: unknown; valor?: unknown } | null;
}

describe("planilhaMaoDeObra", () => {
  it("monta a planilha sem quebrar", () => {
    const wb = planilhaMaoDeObra({ cliente: "Bertanzin", linhas: LINHAS, imposto: 0.07, margem: 0.3 });
    expect(wb.getWorksheet("Mão de obra")).toBeTruthy();
  });

  it("o preço sai como FÓRMULA, não como número fixo", () => {
    // É o que faz a planilha ser uma calculadora: quem receber muda a margem e
    // o preço acompanha, sem a plataforma aberta.
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.07, margem: 0.3 });
    const preco = celula(wb, "Preço ao cliente");
    expect(preco?.formula).toBeTruthy();
    expect(preco?.formula).toContain("/"); // custo ÷ divisor
  });

  it("o divisor é fórmula e aponta para as taxas", () => {
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.07, margem: 0.3 });
    const div = celula(wb, "Divisor (1 − imposto − margem)");
    // `1-B..-B..`: os dois sinais de menos são a correção do `+` da folha
    // manuscrita, que daria divisor 1,20 e preço errado.
    expect(div?.formula).toMatch(/^1-B\d+-B\d+$/);
  });

  it("o resultado pré-calculado bate com o motor da plataforma", () => {
    // O `result` é o que aparece antes do Excel recalcular. Se divergir do
    // motor, a tela e a planilha mostrariam preços diferentes para a mesma
    // entrada — e ninguém saberia em qual acreditar.
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.07, margem: 0.3 });
    const doMotor = calcularComposicao(
      [
        { funcaoId: "e", pessoas: 1, horas: 20 },
        { funcaoId: "a", pessoas: 2, horas: 10 },
      ],
      {
        funcoes: [
          { id: "e", nome: "Eletricista", custoHora: 45 },
          { id: "a", nome: "Ajudante", custoHora: 25 },
        ],
      },
      { imposto: 0.07, margem: 0.3 },
    );
    const preco = celula(wb, "Preço ao cliente");
    expect(Number(preco?.result)).toBeCloseTo(doMotor.precoCent / 100, 2);
    expect(doMotor.custoCent / 100).toBe(CUSTO);
  });

  it("o lucro é o resto, como no motor", () => {
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.07, margem: 0.3 });
    const lucro = celula(wb, "Lucro");
    // preço − custo − imposto: as três parcelas fecham o preço sem sobrar
    // centavo de arredondamento.
    expect(lucro?.formula).toContain("-");
    expect(Number(lucro?.result)).toBeGreaterThan(0);
  });

  it("com imposto e margem somando 100%, NÃO finge que há preço", () => {
    /*
     * Antes deste teste a planilha emitia as linhas mesmo assim, e o lucro
     * saía "−R$ 900,00" — coerente com preço zero e completamente sem sentido
     * para quem abre o arquivo. Número sem significado é pior que número
     * ausente: ele parece resposta.
     */
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.6, margem: 0.4 });
    expect(celula(wb, "Preço ao cliente")).toBeNull();
    expect(celula(wb, "Lucro")).toBeNull();
    const aviso = celula(wb, "Sem preço possível");
    expect(String(aviso?.valor)).toContain("100%");
  });

  it("o custo continua na planilha mesmo sem preço", () => {
    // Quem errou a taxa ainda quer ver quanto custa a equipe.
    const wb = planilhaMaoDeObra({ linhas: LINHAS, imposto: 0.6, margem: 0.4 });
    expect(Number(celula(wb, "Custo total da mão de obra")?.result)).toBe(CUSTO);
  });

  it("aguenta entrada vazia", () => {
    const wb = planilhaMaoDeObra({});
    expect(wb.getWorksheet("Mão de obra")).toBeTruthy();
  });
});
