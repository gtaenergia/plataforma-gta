import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Exercita o handler REAL de /api/solar/calcular, sem navegador e sem login,
 * com corpos que o configurador de verdade envia — inclusive os que uma
 * proposta salva antiga pode ter guardado. O objetivo é achar quais entradas
 * fazem o cálculo simplesmente NÃO acontecer (422/500), já que a tela engole
 * o erro em silêncio.
 */
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => ({ email: "teste@gta.com", role: "admin", name: "Teste" }),
}));

let POST: (req: Request) => Promise<Response>;
beforeAll(async () => {
  ({ POST } = await import("@/app/api/solar/calcular/route"));
});

const consumo12 = Array(12).fill(800);
const base = {
  municipio: "GOIANIA - GO",
  consumo: consumo12,
  margemSeguranca: 0,
  tipoConexao: "tri",
  potenciaPainel: 700,
  eficiencia: 0.75,
  overloadDesejado: 0.15,
  nPaineis: 0,
  potenciaInversor: 0,
  qtdInversores: 1,
  tipoInversor: "string",
  microPotenciaKw: 0,
  microQtd: 0,
  tipoTelhado: "Metálico",
};

async function chamar(corpo: unknown) {
  const req = new Request("http://local/api/solar/calcular", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const res = await POST(req);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

describe("payloads reais do configurador", () => {
  it("típico, quantidade 1", async () => {
    const r = await chamar(base);
    expect(r.status, JSON.stringify(r.json?.issues ?? r.json)).toBe(200);
    expect(r.json.potenciaCaTotal).toBeGreaterThan(0);
  });

  it("quantidade 2, potência por unidade", async () => {
    const r = await chamar({ ...base, nPaineis: 200, potenciaInversor: 75, qtdInversores: 2 });
    expect(r.status).toBe(200);
    expect(r.json.potenciaCaTotal).toBe(150);
    expect(r.json.overload).toBeCloseTo(140 / 150 - 1, 4);
  });

  it("proposta salva antiga: qtdInversores 0 é curado para 1, não recusado", async () => {
    // O campo aceitou ficar vazio por muito tempo (vazio virava 0 no salvar).
    // Recusar deixava a proposta reaberta sem cálculo NENHUM, para sempre.
    const r = await chamar({ ...base, qtdInversores: 0 });
    expect(r.status, JSON.stringify(r.json?.issues ?? r.json)).toBe(200);
    expect(r.json.aplicado.qtdInversores).toBe(1);
  });

  it("proposta salva antiga: qtdInversores null também vira 1", async () => {
    const r = await chamar({ ...base, qtdInversores: null });
    expect(r.status, JSON.stringify(r.json?.issues ?? r.json)).toBe(200);
    expect(r.json.aplicado.qtdInversores).toBe(1);
  });

  it("proposta salva sem o campo (anterior à feature)", async () => {
    const { qtdInversores: _q, ...sem } = base;
    const r = await chamar(sem);
    expect(r.status).toBe(200);
  });

  it("microinversor típico", async () => {
    const r = await chamar({ ...base, tipoInversor: "micro" });
    expect(r.status).toBe(200);
  });

  it("potência de painel zerada continua recusada — mas o cliente agora explica", async () => {
    // Curar painel 0 no servidor inventaria engenharia (muda kWp e preço).
    // A recusa fica; quem cura é a reabertura (sanearFormSolar) e a tela avisa.
    const r = await chamar({ ...base, potenciaPainel: 0 });
    expect(r.status).toBe(422);
  });

  it("consumo com strings (proposta salva antiga)", async () => {
    const r = await chamar({ ...base, consumo: consumo12.map(String) });
    expect(r.status).toBe(200);
  });

  it("consumo digitado com vírgula decimal calcula, e certo", async () => {
    // "850,5" derrubava o cálculo inteiro com "Expected number, received nan".
    const r = await chamar({ ...base, consumo: Array(12).fill("850,5") });
    expect(r.status, JSON.stringify(r.json?.issues ?? r.json)).toBe(200);
    expect(r.json.sizing.consumoMedio).toBeCloseTo(850.5, 3);
  });

  it("consumo com ponto de milhar NÃO vira um milésimo", async () => {
    // Number("1.500") = 1,5: o sistema saía dimensionado para 1,5 kWh/mês em
    // vez de 1500 — sem nenhum erro. O pior dos dois defeitos deste campo.
    const r = await chamar({ ...base, consumo: Array(12).fill("1.500") });
    expect(r.status).toBe(200);
    expect(r.json.sizing.consumoMedio).toBeCloseTo(1500, 3);
  });

  it("consumo em moeda completa ('1.234,56') também", async () => {
    const r = await chamar({ ...base, consumo: Array(12).fill("1.234,56") });
    expect(r.status).toBe(200);
    expect(r.json.sizing.consumoMedio).toBeCloseTo(1234.56, 2);
  });

  it("consumo negativo continua recusado", async () => {
    const r = await chamar({ ...base, consumo: ["-500", ...Array(11).fill("800")] });
    expect(r.status).toBe(422);
    expect(r.json.issues.fieldErrors.consumo).toBeDefined();
  });

  it("ano de emissão fora da régua do Fio B é recusado com mensagem de campo", async () => {
    const r = await chamar({ ...base, anoInicial: 2022 });
    expect(r.status).toBe(422);
    expect(r.json.issues.fieldErrors.anoInicial).toBeDefined();
  });

  it("eficiência acima de 1 é recusada com mensagem de campo", async () => {
    const r = await chamar({ ...base, eficiencia: 75 });
    expect(r.status).toBe(422);
    expect(r.json.issues.fieldErrors.eficiencia).toBeDefined();
  });
});

describe("fraseDoErroDeCalculo — a recusa vira frase legível", () => {
  it("traduz o campo e a regra", async () => {
    const { fraseDoErroDeCalculo } = await import("@/services/solar/saneamento");
    expect(fraseDoErroDeCalculo({ issues: { fieldErrors: { potenciaPainel: ["Number must be greater than 0"] } } }))
      .toBe("Potência do painel: precisa ser maior que zero.");
    expect(fraseDoErroDeCalculo({ issues: { fieldErrors: { eficiencia: ["Number must be less than or equal to 1"] } } }))
      .toBe("Eficiência: no máximo 1.");
    expect(fraseDoErroDeCalculo({ error: "Município não encontrado." })).toBe("Município não encontrado.");
    expect(fraseDoErroDeCalculo(null)).toBe("A API recusou os dados do cálculo.");
  });
});

describe("sanearFormSolar — reabertura de proposta antiga", () => {
  it("quantidade 0, null ou quebrada vira 1", async () => {
    const { sanearFormSolar } = await import("@/services/solar/saneamento");
    expect(sanearFormSolar({ qtdInversores: 0, potenciaPainel: 700 }).qtdInversores).toBe(1);
    expect(sanearFormSolar({ qtdInversores: undefined, potenciaPainel: 700 }).qtdInversores).toBe(1);
    expect(sanearFormSolar({ qtdInversores: 2.9, potenciaPainel: 700 }).qtdInversores).toBe(2);
  });

  it("painel zerado volta ao padrão do formulário em branco", async () => {
    const { sanearFormSolar } = await import("@/services/solar/saneamento");
    expect(sanearFormSolar({ qtdInversores: 1, potenciaPainel: 0 }).potenciaPainel).toBe(700);
  });

  it("valores válidos passam intactos", async () => {
    const { sanearFormSolar } = await import("@/services/solar/saneamento");
    const d = sanearFormSolar({ qtdInversores: 3, potenciaPainel: 585 });
    expect(d.qtdInversores).toBe(3);
    expect(d.potenciaPainel).toBe(585);
  });
});
