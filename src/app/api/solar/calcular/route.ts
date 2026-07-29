import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getMunicipio } from "@/services/solar/municipios";
import { dimensionar, kwpTotal, overloadReal } from "@/services/solar/sizing";
import { sugerirInversorComercial } from "@/services/solar/commercial";
import { dimensionarMicro, normalizarPotenciaMicro, sugerirMicroinversor } from "@/services/solar/micro";
import { simularGeracao } from "@/services/solar/generation";
import { gerarBom } from "@/services/solar/bom";
import { precificar } from "@/services/solar/pricing";
import { getSolarParams } from "@/services/solar/params";
import { DISPONIBILIDADE } from "@/services/solar/sizing";
import { getFioB } from "@/services/solar/tarifas";
import { simularEconomia } from "@/services/solar/economia";
import { parseNumber } from "@/lib/format";

export const runtime = "nodejs";

const schema = z.object({
  municipio: z.string(),
  consumo: z.array(z.coerce.number()).length(12),
  /** Margem de segurança (%): superdimensiona aumentando o consumo mensal. */
  margemSeguranca: z.coerce.number().min(0).max(200).default(0),
  tipoConexao: z.enum(["mono", "bi", "tri"]).default("tri"),
  potenciaPainel: z.coerce.number().positive().default(700),
  // 0 = "não definido": o servidor usa o padrão/sugestão
  eficiencia: z.coerce.number().min(0).max(1).default(0),
  overloadDesejado: z.coerce.number().min(-1).max(1).optional(),
  nPaineis: z.coerce.number().int().min(0).default(0),
  potenciaInversor: z.coerce.number().min(0).default(0),
  qtdInversores: z.coerce.number().int().positive().default(1),
  tipoInversor: z.enum(["string", "micro"]).default("string"),
  /** Potência de cada microinversor (kW). 0 = usa a sugestão. */
  microPotenciaKw: z.coerce.number().min(0).default(0),
  tipoTelhado: z.string().default("Metálico"),
  // precificação (opcional; defaults vêm dos parâmetros salvos)
  kit: z.union([z.string(), z.number()]).optional(),
  fator: z.coerce.number().optional(),
  viagens: z.coerce.number().int().min(0).optional(),
  execucaoCivil: z.union([z.string(), z.number()]).optional(),
  // economia (opcional)
  distribuidora: z.string().optional(),
  subgrupo: z.enum(["B1", "B2", "B3"]).default("B1"),
  tarifaEnergia: z.union([z.string(), z.number()]).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const i = parsed.data;

  const mun = getMunicipio(i.municipio);
  if (!mun) return NextResponse.json({ error: "Município não encontrado." }, { status: 404 });

  // Margem de segurança: superdimensiona o sistema aumentando o consumo mensal
  // (ex.: 10% → cada mês vira consumo × 1,10). Alimenta TODOS os cálculos.
  const consumo = i.margemSeguranca > 0 ? i.consumo.map((c) => c * (1 + i.margemSeguranca / 100)) : i.consumo;

  // Parâmetros vigentes (admin pode alterá-los em /admin/parametros)
  const params = await getSolarParams();
  const eficiencia = i.eficiencia > 0 ? i.eficiencia : params.eficiencia;
  const overloadDesejado = i.overloadDesejado ?? params.overloadDesejado;

  const sizing = dimensionar({
    consumo,
    tipoConexao: i.tipoConexao,
    hsp: mun.hsp,
    potenciaPainel: i.potenciaPainel,
    eficiencia,
    overloadDesejado,
  });

  // Valores comerciais aplicados: usa o que o usuário escolheu, senão a sugestão
  const nPaineis = i.nPaineis > 0 ? i.nPaineis : Math.max(1, sizing.nPlacasSugerido);
  const kwp = kwpTotal(nPaineis, i.potenciaPainel);
  const inversorSugerido = sugerirInversorComercial(kwp, overloadDesejado);

  // Microinversor tem um dimensionamento próprio: a potência é por módulo e a
  // QUANTIDADE é derivada do nº de painéis (não se digita). O overload passa a
  // ser o de cada unidade, e a potência CA total é qtd × potência do micro.
  const ehMicro = i.tipoInversor === "micro";
  const microPotenciaKw = ehMicro
    ? normalizarPotenciaMicro(i.microPotenciaKw) || sugerirMicroinversor(kwp, overloadDesejado)
    : 0;
  const micro = ehMicro
    ? dimensionarMicro({
        nPaineis,
        potenciaPainelW: i.potenciaPainel,
        potenciaKw: microPotenciaKw,
        overloadDesejado,
      })
    : null;

  const potenciaInversor = micro
    ? micro.potenciaCaTotalKw
    : i.potenciaInversor > 0
      ? i.potenciaInversor
      : inversorSugerido;
  const qtdInversores = micro ? micro.qtdMicros : i.qtdInversores;
  const overload = micro ? micro.overload : overloadReal(kwp, potenciaInversor);

  const geracao = simularGeracao(mun.hsp, kwp, eficiencia, consumo);
  const bom = gerarBom({
    nPaineis,
    potenciaPainel: i.potenciaPainel,
    tipoInversor: i.tipoInversor,
    potenciaInversor,
    qtdInversores,
    tipoTelhado: i.tipoTelhado,
    microPotenciaKw: micro?.potenciaKw,
    microRamais: micro?.ramais,
  });

  let pricing = null;
  const kitNum = parseNumber(i.kit ?? 0);
  if (kitNum > 0) {
    pricing = precificar({
      ...params,
      fator: i.fator ?? params.fator,
      viagens: i.viagens ?? params.viagens,
      execucaoCivil: parseNumber(i.execucaoCivil ?? 0),
      kit: kitNum,
      nPaineis,
      kwpTotal: kwp,
    });
  }

  // Economia e payback (precisa de tarifa + investimento calculado)
  let economia = null;
  const tarifaEnergia = parseNumber(i.tarifaEnergia ?? 0);
  if (tarifaEnergia > 0 && pricing) {
    economia = simularEconomia({
      consumo,
      geracaoMensal: geracao.linhas.map((l) => l.energia),
      disponibilidade: DISPONIBILIDADE[i.tipoConexao],
      tarifaEnergia,
      fioB: i.distribuidora ? getFioB(i.distribuidora, i.subgrupo) : 0,
      simultaneidade: params.simultaneidade,
      fioBPctAtual: params.fioBPct,
      iluminacao: params.iluminacaoPublica,
      investimento: pricing.valorTotal,
      inflacaoTarifa: params.inflacaoTarifa,
      degradacao: params.degradacao,
      anos: 25,
    });
  }

  return NextResponse.json({
    sizing,
    // o que foi de fato usado no cálculo (preenche o formulário quando "auto")
    aplicado: { nPaineis, potenciaInversor, qtdInversores, eficiencia, overloadDesejado },
    inversorSugerido,
    // bloco só presente quando tipoInversor === "micro"
    micro,
    kwpTotal: kwp,
    overload,
    geracao,
    bom,
    pricing,
    economia,
    // parâmetros de custo vigentes — a planilha .xlsx usa para montar as
    // fórmulas de custo/margem (instalação, material CA, deslocamento, imposto…)
    params: {
      instalacaoPorPainel: params.instalacaoPorPainel,
      materialCaPorWp: params.materialCaPorWp,
      deslocamentoUnit: params.deslocamentoUnit,
      art: params.art,
      cartorio: params.cartorio,
      impostoPct: params.impostoPct,
      comissaoPct: params.comissaoPct,
    },
  });
}
