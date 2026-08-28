import { describe, expect, it } from "vitest";
import { mapSolar } from "@/services/solar/mapper";
import { precificar, PRICING_DEFAULTS } from "@/services/solar/pricing";
import { parseNumber, formatMoney } from "@/lib/format";
import type { SolarFormData } from "@/services/solar/config";

/**
 * O que o CLIENTE lê no .docx tem de fechar com o que a plataforma cobra.
 *
 * O molde reparte o investimento por quem recebe: só o kit é pago direto ao
 * distribuidor, e todo o resto é pago à GTA. O configurador entregava apenas
 * `servicos` na linha da GTA, e o mapper reconstrói o total somando as duas
 * linhas — então a execução civil sumia do total impresso, enquanto as
 * parcelas da forma de pagamento, calculadas sobre o total cheio, somavam
 * mais do que o total anunciado na mesma página.
 */

const base = {
  subtitulo: "S", clienteNome: "Cliente X", cidadeUf: "Goiânia/GO", objeto: "O",
  referenciaSeq: 1, dataEmissao: "2026-08-27", validadeDias: 20,
  formaPagamento: "50% na assinatura", textoObjetivo: "T",
  potenciaPainel: "700 W", qtdPaineis: "20 unidades", potenciaTotal: "14,00 kWp",
  potenciaInversor: "12 kW", overload: "16,67%", qtdInversores: "1 unidade",
  tipoInversor: "inversor", simulacao: [], textoObservacao: "",
  materiais: [], distribuidor: "weg", kitItens: "K",
  prazoExecucao: "30 dias", textoGarantia: "G",
} as unknown as SolarFormData;

/** A linha da GTA como o configurador a monta: total menos o kit. */
function linhaGta(kit: number, civil: number, fator: number) {
  const p = precificar({ ...PRICING_DEFAULTS, fator, execucaoCivil: civil, kit, nPaineis: 20, kwpTotal: 14 });
  return { pricing: p, valorGta: formatMoney(p.valorTotal - p.kit) };
}

describe("investimento no .docx", () => {
  it("com execução civil, o total impresso é o total cobrado", () => {
    const kit = 18400, civil = 5000, fator = 1.85;
    const { pricing, valorGta } = linhaGta(kit, civil, fator);
    const r = mapSolar({ ...base, valorKit: formatMoney(kit), valorGta });
    const d = r.data as Record<string, string>;
    expect(pricing.valorTotal).toBeCloseTo((kit + civil) * fator, 2);
    expect(parseNumber(d.valorTotal)).toBeCloseTo(pricing.valorTotal, 2);
  });

  it("a soma das duas linhas fecha com o total — nada some no meio", () => {
    const { pricing, valorGta } = linhaGta(18400, 5000, 1.85);
    const r = mapSolar({ ...base, valorKit: formatMoney(18400), valorGta });
    const d = r.data as Record<string, string>;
    expect(parseNumber(d.valorKit) + parseNumber(d.valorGta)).toBeCloseTo(parseNumber(d.valorTotal), 2);
  });

  it("sem execução civil, nada muda em relação ao comportamento antigo", () => {
    const { pricing, valorGta } = linhaGta(18400, 0, 1.85);
    // Sem civil, total − kit é exatamente `servicos`.
    expect(parseNumber(valorGta)).toBeCloseTo(pricing.servicos, 2);
    const r = mapSolar({ ...base, valorKit: formatMoney(18400), valorGta });
    expect(parseNumber((r.data as Record<string, string>).valorTotal)).toBeCloseTo(pricing.valorTotal, 2);
  });

  it("o extenso acompanha o total corrigido", () => {
    const { valorGta } = linhaGta(18400, 5000, 1.85);
    const d = mapSolar({ ...base, valorKit: formatMoney(18400), valorGta }).data as Record<string, string>;
    expect(d.valorTotalExtenso.toLowerCase()).toContain("quarenta e três mil");
  });
});

/**
 * O leitor de número da planilha divergia do que o cálculo usa: um `parseBR`
 * local só tirava o ponto de milhar quando havia vírgula, então "25.000"
 * virava 25 — e a aba Preço é fórmula viva pendurada nessa célula.
 */
describe("leitura do kit para a planilha", () => {
  it("milhar sem centavos não vira unidade", () => {
    expect(parseNumber("25.000")).toBe(25000);
    expect(parseNumber("1.500")).toBe(1500);
  });

  it("formato completo e sem separador continuam valendo", () => {
    expect(parseNumber("18.400,27")).toBeCloseTo(18400.27, 2);
    expect(parseNumber("25000")).toBe(25000);
    expect(parseNumber("")).toBe(0);
  });
});
