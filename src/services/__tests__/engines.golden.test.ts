import { describe, expect, it } from "vitest";

import { precoSpda } from "../spda/pricing";
import { SPDA_PARAMS_DEFAULT } from "../spda/params";
import { precoRedeMt } from "../rede-mt/pricing";
import { REDEMT_PARAMS_DEFAULT } from "../rede-mt/params";
import { precoQgbt } from "../qgbt/pricing";
import { QGBT_PARAMS_DEFAULT } from "../qgbt/params";
import { precoExecSE } from "../execucao-subestacao/pricing";
import { EXECSE_PARAMS_DEFAULT } from "../execucao-subestacao/params";
import { dimensionarSE, precoProjeto } from "../subestacao/sizing";
import { SUBESTACAO_PARAMS_DEFAULT } from "../subestacao/params";
import { dimensionarEV, gerarBomEV, precoEV } from "../carregador/engine";
import { CARREGADOR_PARAMS_DEFAULT } from "../carregador/params";
import { dimensionar, kwpTotal } from "../solar/sizing";
import { simularGeracao } from "../solar/generation";
import { precificar, PRICING_DEFAULTS } from "../solar/pricing";
import { simularEconomia } from "../solar/economia";
import { dimensionarMicro, normalizarPotenciaMicro, sugerirMicroinversor } from "../solar/micro";

/**
 * GOLDEN TESTS dos engines de preço — congelam os números que os configuradores
 * produzem HOJE (params default + inputs representativos). Se um snapshot mudar,
 * uma proposta comercial passaria a sair com preço/margem/payback diferente:
 * confirme a intenção (mudança de tabela/fórmula) antes de atualizar com `-u`.
 */

// Arredonda a 4 casas só para estabilizar o snapshot (ruído de float).
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
const digest = (o: object) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === "number" ? r4(v) : v]),
  );

describe("SPDA — risco por bloco + projeto por m² (piso mínimo)", () => {
  it("job típico (3 blocos, 2.500 m²)", () => {
    const r = precoSpda({ nBlocos: 3, areaM2: 2500, custoLogistico: 800 }, SPDA_PARAMS_DEFAULT);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "aplicouPiso": false,
        "custoLogistico": 800,
        "design": 12450,
        "impostos": 1867.5,
        "lucro": 9782.5,
        "margem": 0.7857,
        "projeto": 7500,
        "projetoCalc": 7500,
        "risco": 4950,
      }
    `);
  });

  it("job pequeno aplica o piso mínimo", () => {
    const r = precoSpda({ nBlocos: 1, areaM2: 100, custoLogistico: 0 }, SPDA_PARAMS_DEFAULT);
    expect(r.aplicouPiso).toBe(true);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "aplicouPiso": true,
        "custoLogistico": 0,
        "design": 2500,
        "impostos": 375,
        "lucro": 2125,
        "margem": 0.85,
        "projeto": 850,
        "projetoCalc": 300,
        "risco": 1650,
      }
    `);
  });
});

describe("Rede MT/BT — projeto (NF por dentro) + execução (NF por fora)", () => {
  it("projeto + execução", () => {
    const r = precoRedeMt({ custoProjeto: 20_000, custoExecucao: 50_000 }, REDEMT_PARAMS_DEFAULT);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "custoExecucao": 50000,
        "custoProjeto": 20000,
        "fatorKExecucao": 1.7,
        "fatorKProjeto": 1.889,
        "faturamentoExecucao": 85000,
        "faturamentoProjeto": 44450,
        "faturamentoTotal": 129450,
        "impostosExecucao": 5100,
        "impostosProjeto": 6667.5,
        "lucroExecucao": 29900,
        "lucroProjeto": 17782.5,
        "margemExecucao": 0.3518,
        "margemProjeto": 0.4001,
      }
    `);
  });

  it("só projeto (execução zerada não fatura)", () => {
    const r = precoRedeMt({ custoProjeto: 12_000, custoExecucao: 0 }, REDEMT_PARAMS_DEFAULT);
    expect(r.faturamentoExecucao).toBe(0);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "custoExecucao": 0,
        "custoProjeto": 12000,
        "fatorKExecucao": 1.7,
        "fatorKProjeto": 1.889,
        "faturamentoExecucao": 0,
        "faturamentoProjeto": 26670,
        "faturamentoTotal": 26670,
        "impostosExecucao": 0,
        "impostosProjeto": 4000.5,
        "lucroExecucao": 0,
        "lucroProjeto": 10669.5,
        "margemExecucao": 0,
        "margemProjeto": 0.4001,
      }
    `);
  });
});

describe("QGBT — custo × Fator K", () => {
  it("2 quadros de R$ 18.000", () => {
    const r = precoQgbt({ custoUnitario: 18_000, qtdQuadros: 2 }, QGBT_PARAMS_DEFAULT);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "custo": 36000,
        "custoUnitario": 18000,
        "fatorK": 1.55,
        "faturamento": 55800,
        "impostos": 8370,
        "lucro": 11430,
        "margem": 0.2048,
        "qtdQuadros": 2,
      }
    `);
  });
});

describe("Execução de Subestação — custo × Fator K", () => {
  it("materiais + mão de obra + projeto/outros", () => {
    const r = precoExecSE(
      { custoMateriais: 30_000, custoMaoObra: 20_000, custoProjetoOutros: 5_000 },
      EXECSE_PARAMS_DEFAULT,
    );
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "custo": 55000,
        "custoMaoObra": 20000,
        "custoMateriais": 30000,
        "custoProjetoOutros": 5000,
        "fatorK": 1.7,
        "faturamento": 93500,
        "impostos": 5610,
        "lucro": 32890,
        "margem": 0.3518,
      }
    `);
  });
});

describe("Subestação — dimensionamento NT.002 + preço do projeto", () => {
  it("modo carga: 200 kW / FD 0,8 / FP 0,92 → SE aérea", () => {
    const s = dimensionarSE({
      modo: "carga",
      cargaKw: 200,
      fatorDemanda: 0.8,
      fatorPotencia: 0.92,
      tensaoMt: 13.8,
      tensaoBt: 380,
      tipoSE: "Aérea",
    });
    expect(digest(s)).toMatchInlineSnapshot(`
      {
        "aproveitamento": 0.7729,
        "atendimento": "Aérea",
        "aviso": "",
        "bancoCapacitor": 7.5,
        "condutorMt": "25 mm² XLPE 15/25 kV",
        "correntePrimaria": 9.4133,
        "correnteSecundaria": 341.8521,
        "demandaKva": 173.913,
        "disjuntorBt": 400,
        "elo": "15K",
        "poste": "800 daN / 11 m",
        "trafoKva": 225,
      }
    `);
  });

  it("modo demanda: 500 kVA → abrigada", () => {
    const s = dimensionarSE({ modo: "demanda", demandaKva: 500, tensaoMt: 13.8, tensaoBt: 380, tipoSE: "Abrigada" });
    expect(digest(s)).toMatchInlineSnapshot(`
      {
        "aproveitamento": 1,
        "atendimento": "Abrigada",
        "aviso": "",
        "bancoCapacitor": 12.5,
        "condutorMt": "25 mm² XLPE 15/25 kV",
        "correntePrimaria": 20.9185,
        "correnteSecundaria": 759.6714,
        "demandaKva": 500,
        "disjuntorBt": 800,
        "elo": "40K",
        "poste": "—",
        "trafoKva": 500,
      }
    `);
  });

  it("preço do projeto (aérea 225 kVA, defaults)", () => {
    const r = precoProjeto(SUBESTACAO_PARAMS_DEFAULT, "Aérea", 225);
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "custo": 4175,
        "horas": 24.5,
        "margem": 0.5,
        "precoTotal": 6250,
        "precoUnitario": 6250,
      }
    `);
  });
});

describe("Carregador EV — NBR 5410/17019: sizing → BOM → preço", () => {
  it("wallbox 7,4 kW mono, 25 m, sem RDC-DD (DR Tipo B)", () => {
    const s = dimensionarEV({ potenciaKw: 7.4, fase: "mono", distanciaM: 25, protecaoCcIntegrada: false });
    const bom = gerarBomEV(s, 25, 1);
    const preco = precoEV(bom.custoMateriais, 1, CARREGADOR_PARAMS_DEFAULT);
    expect({
      sizing: digest(s),
      itens: bom.itens.length,
      custoMateriais: r4(bom.custoMateriais),
      preco: digest(preco),
    }).toMatchInlineSnapshot(`
      {
        "custoMateriais": 3108.3,
        "itens": 16,
        "preco": {
          "custoGeral": 3908.3,
          "custoMateriais": 3108.3,
          "fatorK": 1.65,
          "impostos": 452.145,
          "lucro": 2089.555,
          "maoObra": 800,
          "margem": 0.324,
          "preco": 6450,
        },
        "sizing": {
          "correnteNominal": 33.6364,
          "correnteProjeto": 42.0455,
          "disjuntorA": 40,
          "drTipo": "B",
          "eletroduto": "1"",
          "nCondutores": 3,
          "nDps": 2,
          "polos": 2,
          "quedaPct": 0.0137,
          "secaoMm2": 10,
          "tensao": 220,
        },
      }
    `);
  });

  it("22 kW tri, 40 m, com RDC-DD (DR Tipo A)", () => {
    const s = dimensionarEV({ potenciaKw: 22, fase: "tri", distanciaM: 40, protecaoCcIntegrada: true });
    const bom = gerarBomEV(s, 40, 2);
    const preco = precoEV(bom.custoMateriais, 2, CARREGADOR_PARAMS_DEFAULT);
    expect({
      sizing: digest(s),
      custoMateriais: r4(bom.custoMateriais),
      preco: digest(preco),
    }).toMatchInlineSnapshot(`
      {
        "custoMateriais": 5889,
        "preco": {
          "custoGeral": 7489,
          "custoMateriais": 5889,
          "fatorK": 1.65,
          "impostos": 866.436,
          "lucro": 4004.564,
          "maoObra": 1600,
          "margem": 0.324,
          "preco": 12360,
        },
        "sizing": {
          "correnteNominal": 33.4255,
          "correnteProjeto": 41.7819,
          "disjuntorA": 40,
          "drTipo": "A",
          "eletroduto": "1"",
          "nCondutores": 5,
          "nDps": 4,
          "polos": 4,
          "quedaPct": 0.0126,
          "secaoMm2": 10,
          "tensao": 380,
        },
      }
    `);
  });
});

describe("Solar — cadeia completa: sizing → geração → preço → economia/payback", () => {
  // Perfil representativo: consumo 800 kWh/mês, trifásico, HSP típico de GO.
  const consumo = Array(12).fill(800);
  const hsp = [5.53, 5.63, 5.41, 5.31, 5.05, 4.83, 5.02, 5.63, 5.6, 5.61, 5.37, 5.51];

  const siz = dimensionar({
    consumo,
    tipoConexao: "tri",
    hsp,
    potenciaPainel: 570,
    eficiencia: 0.75,
    overloadDesejado: 0.15,
  });
  const kwp = kwpTotal(siz.nPlacasSugerido, 570);
  const ger = simularGeracao(hsp, kwp, 0.75, consumo);
  const preco = precificar({ ...PRICING_DEFAULTS, kit: 20_000, nPaineis: siz.nPlacasSugerido, kwpTotal: kwp });
  const eco = simularEconomia({
    consumo,
    geracaoMensal: ger.linhas.map((l) => l.energia),
    disponibilidade: siz.disponibilidade,
    tarifaEnergia: 0.99,
    fioB: 0.25,
    simultaneidade: 0.7,
    fioBPctAtual: 0.7,
    iluminacao: 40,
    investimento: preco.valorTotal,
  });

  it("dimensionamento", () => {
    expect(digest(siz)).toMatchInlineSnapshot(`
      {
        "consumoMedio": 800,
        "disponibilidade": 100,
        "hspMedia": 5.375,
        "inversorSugerido": 5.7881,
        "kwpNecessaria": 6.6563,
        "nPlacasSugerido": 12,
      }
    `);
  });

  it("geração anual", () => {
    expect({ totalEnergia: r4(ger.totalEnergia), totalConsumo: r4(ger.totalConsumo), meses: ger.linhas.length }).toMatchInlineSnapshot(`
      {
        "meses": 12,
        "totalConsumo": 9600,
        "totalEnergia": 10062.495,
      }
    `);
  });

  it("precificação (kit R$ 20.000, fator 1,575)", () => {
    expect({
      valorTotal: r4(preco.valorTotal),
      servicos: r4(preco.servicos),
      custoTotal: r4(preco.custos.total),
      lucro: r4(preco.lucro),
      margem: r4(preco.margem),
      lucroLiquido: r4(preco.lucroLiquido),
      margemLiquida: r4(preco.margemLiquida),
    }).toMatchInlineSnapshot(`
      {
        "custoTotal": 4093.15,
        "lucro": 7406.85,
        "lucroLiquido": 6831.85,
        "margem": 0.6441,
        "margemLiquida": 0.5941,
        "servicos": 11500,
        "valorTotal": 31500,
      }
    `);
  });

  it("economia e payback (25 anos, Lei 14.300)", () => {
    expect({
      economiaAno1: r4(eco.economiaAno1),
      economiaMensalMedia: r4(eco.economiaMensalMedia),
      gastoSemSolarAno1: r4(eco.gastoSemSolarAno1),
      gastoComSolarAno1: r4(eco.gastoComSolarAno1),
      paybackAnos: r4(eco.paybackAnos),
      paybackMeses: eco.paybackMeses,
      economiaHorizonte: r4(eco.economiaHorizonte),
      saldoFinal: r4(eco.saldo[eco.saldo.length - 1]),
      anos: eco.economiaPorAno.length,
    }).toMatchInlineSnapshot(`
      {
        "anos": 25,
        "economiaAno1": 8316,
        "economiaHorizonte": 817854.1463,
        "economiaMensalMedia": 693,
        "gastoComSolarAno1": 1668,
        "gastoSemSolarAno1": 9984,
        "paybackAnos": 3.359,
        "paybackMeses": 40,
        "saldoFinal": 786354.1463,
      }
    `);
  });
});

describe("Solar — dimensionamento com microinversores", () => {
  it("sugestão para 7,00 kWp com overload alvo 15%", () => {
    expect(sugerirMicroinversor(7, 0.15)).toMatchInlineSnapshot(`6`);
  });

  it("sugestão para sistema grande (35 kWp) cai na maior unidade", () => {
    expect(sugerirMicroinversor(35, 0.15)).toMatchInlineSnapshot(`25`);
  });

  it("normaliza uma potência fora do catálogo para a mais próxima", () => {
    expect(normalizarPotenciaMicro(6.4)).toMatchInlineSnapshot(`6.6`);
  });

  it("10 painéis de 700 Wp com micro de 3 kW", () => {
    const r = dimensionarMicro({ nPaineis: 10, potenciaPainelW: 700, potenciaKw: 3, overloadDesejado: 0.15 });
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "divisaoDesigual": false,
        "microsComModuloExtra": 0,
        "microsPorRamal": 1,
        "modulosPorMicro": 5,
        "overload": 0.1667,
        "potenciaCaTotalKw": 6,
        "potenciaKw": 3,
        "qtdMicros": 2,
        "ramais": 2,
      }
    `);
  });

  it("divisão desigual dos painéis entre as unidades", () => {
    const r = dimensionarMicro({ nPaineis: 11, potenciaPainelW: 700, potenciaKw: 3, overloadDesejado: 0.15 });
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "divisaoDesigual": true,
        "microsComModuloExtra": 1,
        "microsPorRamal": 1,
        "modulosPorMicro": 5,
        "overload": 0.2833,
        "potenciaCaTotalKw": 6,
        "potenciaKw": 3,
        "qtdMicros": 2,
        "ramais": 2,
      }
    `);
  });

  it("unidade grande (25 kW) num sistema de 40 painéis", () => {
    const r = dimensionarMicro({ nPaineis: 40, potenciaPainelW: 700, potenciaKw: 25, overloadDesejado: 0.15 });
    expect(digest(r)).toMatchInlineSnapshot(`
      {
        "divisaoDesigual": false,
        "microsComModuloExtra": 0,
        "microsPorRamal": 1,
        "modulosPorMicro": 40,
        "overload": 0.12,
        "potenciaCaTotalKw": 25,
        "potenciaKw": 25,
        "qtdMicros": 1,
        "ramais": 1,
      }
    `);
  });
});
