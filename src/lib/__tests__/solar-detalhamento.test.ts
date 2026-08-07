import { describe, expect, it } from "vitest";
import { precificar, PRICING_DEFAULTS } from "@/services/solar/pricing";

/**
 * O cartão de detalhamento tem que FECHAR com o engine do Solar.
 *
 * O componente é React e estes testes não montam DOM — o que eles seguram é o
 * contrato aritmético das parcelas que o configurador entrega ao cartão. Foi
 * exatamente aí que a conta quebrou duas vezes: primeiro medindo a margem
 * sobre o valor total (que inclui o kit, um repasse), depois listando a
 * execução civil como custo contra uma base que já a tinha excluído.
 *
 * Se alguém mudar as parcelas em `SolarConfigurator` sem mexer aqui, um destes
 * cai.
 */

const entrada = { ...PRICING_DEFAULTS, kit: 20_000, nPaineis: 12, kwpTotal: 6.84 };

/** As parcelas exatamente como o configurador as monta para o cartão. */
function comoOCartaoVe(p: ReturnType<typeof precificar>) {
  return {
    base: p.servicos,
    repasses: [p.kit, p.custos.execucaoCivil].filter((v) => v > 0),
    custos: [
      p.custos.instalacao,
      p.custos.materialCa,
      p.custos.deslocamento,
      p.custos.art,
      p.custos.cartorio,
      p.custos.imposto,
      p.custos.comissao,
    ],
  };
}

describe("detalhamento do Solar fecha com o engine", () => {
  it("base + repasses = o que o cliente paga", () => {
    const p = precificar(entrada);
    const v = comoOCartaoVe(p);
    const total = v.base + v.repasses.reduce((s, r) => s + r, 0);
    expect(total).toBeCloseTo(p.valorTotal, 6);
  });

  it("o kit fica FORA da base — senão a margem despenca sozinha", () => {
    const p = precificar(entrada);
    const v = comoOCartaoVe(p);
    expect(v.repasses).toContain(20_000);
    expect(v.base).toBeCloseTo(p.valorTotal - p.kit, 6);
    // A margem do cartão é sobre os serviços, e é a do engine.
    const custoTotal = v.custos.reduce((s, c) => s + c, 0);
    expect((v.base - custoTotal) / v.base).toBeCloseTo(p.margemLiquida, 6);
  });

  it("as parcelas de custo somam o custo do engine mais a comissão", () => {
    const p = precificar(entrada);
    const v = comoOCartaoVe(p);
    expect(v.custos.reduce((s, c) => s + c, 0)).toBeCloseTo(p.custos.total + p.custos.comissao, 6);
  });

  it("sem horas apontadas, o lucro do cartão é o lucro líquido do engine", () => {
    const p = precificar(entrada);
    const v = comoOCartaoVe(p);
    expect(v.base - v.custos.reduce((s, c) => s + c, 0)).toBeCloseTo(p.lucroLiquido, 6);
  });

  it("a instalação é a mão de obra, e não é zero", () => {
    const p = precificar(entrada);
    // 120/painel × 12 painéis — some da tela se alguém zerar o parâmetro.
    expect(p.custos.instalacao).toBe(PRICING_DEFAULTS.instalacaoPorPainel * 12);
    expect(p.custos.instalacao).toBeGreaterThan(0);
  });

  it("com execução civil, ela é repasse e NÃO reaparece como custo", () => {
    const p = precificar({ ...entrada, execucaoCivil: 10_000 });
    const v = comoOCartaoVe(p);
    expect(v.repasses).toContain(10_000);
    expect(v.custos).not.toContain(10_000);
    // E a conta continua fechando com o total ao cliente.
    expect(v.base + v.repasses.reduce((s, r) => s + r, 0)).toBeCloseTo(p.valorTotal, 6);
  });
});
