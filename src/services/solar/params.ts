import { z } from "zod";
import { PRICING_DEFAULTS } from "./pricing";
import { getSettingsStore } from "@/lib/settings/store";

/**
 * Parâmetros ajustáveis do Solar (custos, imposto, comissão, eficiência...).
 * Os defaults vêm da planilha da GTA, mas o admin pode alterá-los em
 * /admin/parametros — os valores salvos vivem no store de configurações e são
 * usados como padrão em todo cálculo. Módulo somente-servidor (usa o store).
 */

export const SOLAR_PARAMS_KEY = "solar:parametros";

export const solarParamsSchema = z.object({
  /** Total = (Kit + Execução civil) × fator */
  fator: z.coerce.number().min(1, "Fator mínimo 1").max(5),
  /** Custo de instalação por painel (R$) */
  instalacaoPorPainel: z.coerce.number().min(0),
  /** Custo de material CA por Wp instalado (R$) */
  materialCaPorWp: z.coerce.number().min(0),
  /** Custo de cada viagem/deslocamento (R$) */
  deslocamentoUnit: z.coerce.number().min(0),
  /** Nº padrão de viagens por obra */
  viagens: z.coerce.number().int().min(0).max(50),
  /** ART/TRT (R$) */
  art: z.coerce.number().min(0),
  /** Cartório/taxas (R$) */
  cartorio: z.coerce.number().min(0),
  /** Imposto/NF sobre os serviços (fração: 0,0701 = 7,01%) */
  impostoPct: z.coerce.number().min(0).max(1),
  /** Comissão sobre os serviços (fração) */
  comissaoPct: z.coerce.number().min(0).max(1),
  /** Eficiência global do sistema (fração: 0,75 = 75%) */
  eficiencia: z.coerce.number().min(0.3).max(1),
  /** Overload desejado no dimensionamento (fração: 0,15 = 15%) */
  overloadDesejado: z.coerce.number().min(0).max(1),
  // ----- Economia / payback -----
  /**
   * Consumo simultâneo à geração (fração; o resto é injetado e paga Fio B).
   *
   * O percentual do Fio B em si NÃO é parâmetro: vem da rampa da Lei 14.300
   * pelo ano-calendário (ver economia.ts). Era ajustável e estava em 0,7, que
   * não corresponde a ano nenhum da tabela — e envelhecia a cada janeiro sem
   * ninguém notar.
   */
  simultaneidade: z.coerce.number().min(0).max(1),
  /** Iluminação pública / custo fixo mensal (R$) */
  iluminacaoPublica: z.coerce.number().min(0),
  /** Inflação anual da tarifa de energia (fração: 0,10 = 10%) */
  inflacaoTarifa: z.coerce.number().min(0).max(1),
  /** Degradação anual dos módulos (fração: 0,005 = 0,5%) */
  degradacao: z.coerce.number().min(0).max(1),
});

export type SolarParams = z.infer<typeof solarParamsSchema>;

/** Defaults extraídos da planilha de Orçamento Solar da GTA. */
export const SOLAR_PARAMS_DEFAULT: SolarParams = {
  fator: PRICING_DEFAULTS.fator,
  instalacaoPorPainel: PRICING_DEFAULTS.instalacaoPorPainel,
  materialCaPorWp: PRICING_DEFAULTS.materialCaPorWp,
  deslocamentoUnit: PRICING_DEFAULTS.deslocamentoUnit,
  viagens: PRICING_DEFAULTS.viagens,
  art: PRICING_DEFAULTS.art,
  cartorio: PRICING_DEFAULTS.cartorio,
  impostoPct: PRICING_DEFAULTS.impostoPct,
  comissaoPct: PRICING_DEFAULTS.comissaoPct,
  eficiencia: 0.75,
  overloadDesejado: 0.15,
  simultaneidade: 0.7,
  iluminacaoPublica: 4,
  inflacaoTarifa: 0.1,
  degradacao: 0.005,
};

/** Parâmetros vigentes: salvos pelo admin, com fallback nos defaults. */
export async function getSolarParams(): Promise<SolarParams> {
  const saved = await getSettingsStore().get<Partial<SolarParams>>(SOLAR_PARAMS_KEY);
  const parsed = solarParamsSchema.safeParse({ ...SOLAR_PARAMS_DEFAULT, ...(saved ?? {}) });
  return parsed.success ? parsed.data : SOLAR_PARAMS_DEFAULT;
}
