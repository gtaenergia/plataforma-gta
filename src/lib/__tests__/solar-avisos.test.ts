import { describe, expect, it } from "vitest";
import { avaliarSistema, LIMITE_MICROGERACAO_KW } from "@/services/solar/avisos";
import { dimensionar, overloadReal, potenciaCaTotal } from "@/services/solar/sizing";

const HSP = Array(12).fill(5.2);
const base = { consumoMedio: 800, disponibilidade: 100, tipoConexao: "tri" as const, kwpTotal: 10, potenciaInversor: 8.7, overload: 0.15 };
const titulos = (avisos: { titulo: string }[]) => avisos.map((a) => a.titulo);

describe("dimensionar — nunca devolve valores negativos", () => {
  const dim = (consumoMes: number, tipoConexao: "mono" | "bi" | "tri" = "tri") =>
    dimensionar({ consumo: Array(12).fill(consumoMes), tipoConexao, hsp: HSP, potenciaPainel: 700, eficiencia: 0.75, overloadDesejado: 0.15 });

  it("consumo abaixo da disponibilidade zera em vez de negativar", () => {
    // Antes: kWp = −0,20 e placas = 0 apareciam na tela.
    const r = dim(80, "tri");
    expect(r.kwpNecessaria).toBe(0);
    expect(r.nPlacasSugerido).toBe(0);
    expect(r.inversorSugerido).toBe(0);
  });

  it("formulário recém-aberto (tudo zero) não mostra −1 placas", () => {
    const r = dim(0);
    expect(r.kwpNecessaria).toBe(0);
    expect(r.nPlacasSugerido).toBe(0);
  });

  it("HSP zerado não vira Infinity nem NaN", () => {
    const r = dimensionar({ consumo: Array(12).fill(800), tipoConexao: "tri", hsp: Array(12).fill(0), potenciaPainel: 700, eficiencia: 0.75, overloadDesejado: 0.15 });
    expect(Number.isFinite(r.kwpNecessaria)).toBe(true);
    expect(r.kwpNecessaria).toBe(0);
  });

  it("consumo normal continua calculando igual", () => {
    const r = dim(800);
    expect(r.kwpNecessaria).toBeGreaterThan(6);
    expect(r.nPlacasSugerido).toBeGreaterThan(8);
  });
});

describe("avaliarSistema — travas do projeto real", () => {
  it("sistema saudável não gera aviso", () => {
    expect(avaliarSistema(base)).toEqual([]);
  });

  it("consumo que não paga a disponibilidade", () => {
    const a = avaliarSistema({ ...base, consumoMedio: 90, disponibilidade: 100 });
    expect(titulos(a)).toContain("Consumo abaixo do custo de disponibilidade");
    expect(a[0].nivel).toBe("critico");
  });

  it("consumo exatamente igual à disponibilidade também avisa", () => {
    const a = avaliarSistema({ ...base, consumoMedio: 100, disponibilidade: 100 });
    expect(titulos(a)).toContain("Consumo abaixo do custo de disponibilidade");
  });

  it("acima de 75 kW deixa de ser microgeração", () => {
    const a = avaliarSistema({ ...base, kwpTotal: 100, potenciaInversor: LIMITE_MICROGERACAO_KW + 0.1 });
    const aviso = a.find((x) => x.titulo.includes("minigeração"));
    expect(aviso?.nivel).toBe("critico");
    // precisa lembrar de corrigir o texto da proposta, que é fixo em "microgeração"
    expect(aviso?.detalhe).toContain("microgeração");
  });

  it("arranjo gigante com inversor saturado em 75 kW ainda é pego", () => {
    // O caso real que escapou: 291 kWp recebe sugestão de 75 kW (teto do
    // catálogo), então checar só a potência CA deixava passar.
    const a = avaliarSistema({ ...base, kwpTotal: 291, potenciaInversor: 75, overload: 2.88 });
    expect(titulos(a)).toContain("Passou de microgeração — isto é minigeração");
    expect(titulos(a)).toContain("Arranjo maior que um único inversor");
  });

  it("exatamente 75 kW ainda é microgeração", () => {
    const a = avaliarSistema({ ...base, potenciaInversor: LIMITE_MICROGERACAO_KW });
    expect(titulos(a).some((t) => t.includes("minigeração"))).toBe(false);
  });

  it("monofásico com inversor grande — o caso que a distribuidora reprova", () => {
    const a = avaliarSistema({ ...base, tipoConexao: "mono", kwpTotal: 29, potenciaInversor: 25 });
    expect(titulos(a)).toContain("Potência alta para o tipo de ligação");
  });

  it("overload alto avisa sobre corte de geração", () => {
    expect(titulos(avaliarSistema({ ...base, overload: 0.8 }))).toContain("Overload elevado");
  });

  it("inversor maior que o arranjo avisa sobre custo ocioso", () => {
    const a = avaliarSistema({ ...base, kwpTotal: 5, potenciaInversor: 8, overload: -0.375 });
    expect(titulos(a)).toContain("Inversor superdimensionado");
  });

  it("acumula avisos quando há mais de um problema", () => {
    const a = avaliarSistema({ ...base, tipoConexao: "mono", kwpTotal: 120, potenciaInversor: 100, overload: 0.9 });
    expect(a.length).toBeGreaterThanOrEqual(3);
  });

  it("com a quantidade declarada, para de mandar declarar a quantidade", () => {
    // O aviso pedia "defina a potência e a quantidade à mão" e continuava
    // aparecendo depois disso feito, porque olhava só a potência CC.
    const a = avaliarSistema({ ...base, kwpTotal: 291, potenciaInversor: 300, qtdInversores: 4, overload: -0.03 });
    expect(titulos(a)).not.toContain("Arranjo maior que um único inversor");
  });

  it("um inversor só num arranjo grande continua sendo pego", () => {
    const a = avaliarSistema({ ...base, kwpTotal: 291, potenciaInversor: 75, qtdInversores: 1, overload: 2.88 });
    expect(titulos(a)).toContain("Arranjo maior que um único inversor");
  });
});

/**
 * A quantidade de inversores só chegava à lista de materiais e ao texto do
 * documento: o overload e as travas normativas liam a potência de UMA unidade
 * como se fosse a do sistema inteiro.
 */
describe("potenciaCaTotal — a quantidade entra na conta", () => {
  it("multiplica a potência de cada unidade", () => {
    expect(potenciaCaTotal(75, 2)).toBe(150);
  });

  it("quantidade ausente ou zero conta como uma unidade", () => {
    expect(potenciaCaTotal(75, 0)).toBe(75);
    expect(potenciaCaTotal(75, NaN)).toBe(75);
  });

  it("não aceita potência negativa", () => {
    expect(potenciaCaTotal(-10, 3)).toBe(0);
  });

  it("dois inversores de 75 kW num arranjo de 140 kWp: −7%, não +87%", () => {
    const total = potenciaCaTotal(75, 2);
    expect(overloadReal(140, total)).toBeCloseTo(-0.0667, 4);
    // O número que a tela mostrava antes, calculado contra uma unidade só:
    expect(overloadReal(140, 75)).toBeCloseTo(0.8667, 4);
  });

  it("sem sobrecarga inventada, o aviso de overload não dispara", () => {
    const total = potenciaCaTotal(75, 2);
    const a = avaliarSistema({ ...base, kwpTotal: 140, potenciaInversor: total, qtdInversores: 2, overload: overloadReal(140, total) });
    expect(titulos(a)).not.toContain("Overload elevado");
  });

  it("mas a potência CA total passa a ser vista pela trava de microgeração", () => {
    // 2 × 40 kW = 80 kW: cada unidade cabe no limite, o conjunto não.
    const total = potenciaCaTotal(40, 2);
    const a = avaliarSistema({ ...base, kwpTotal: 90, potenciaInversor: total, qtdInversores: 2, overload: overloadReal(90, total) });
    expect(titulos(a)).toContain("Passou de microgeração — isto é minigeração");
  });
});
