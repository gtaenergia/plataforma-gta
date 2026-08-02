import { getSettingsStore } from "@/lib/settings/store";
import {
  CAPACIDADE_KEY,
  CONFIG_CAPACIDADE_PADRAO,
  configCapacidadeSchema,
  type ConfigCapacidade,
} from "./types";

/**
 * Leitura e escrita da configuração de capacidade.
 *
 * SOMENTE SERVIDOR: puxa o store de settings, que em desenvolvimento usa
 * `node:fs`. O motor (./motor) recebe a config pronta por parâmetro justamente
 * para não arrastar este arquivo — e o driver do Postgres — para o bundle do
 * cliente.
 *
 * Mora em `settings`, e não numa coluna de `User`, porque o dado não é um
 * escalar: são minutos por dia, dias da semana e o atraso de leitura, por
 * pessoa, mais o bloco global. Em `User` seriam três ou quatro colunas novas —
 * e `PostgresUserStore.update()` lista coluna por coluna, então esquecer uma
 * faz o valor sumir só em produção, onde ninguém está olhando.
 */

/**
 * Config vigente. Nunca lança: configuração corrompida cai no padrão, porque
 * derrubar a tela de tarefas inteira por causa de um JSON estranho é pior que
 * sugerir com a jornada padrão.
 */
export async function getConfigCapacidade(): Promise<ConfigCapacidade> {
  const salvo = await getSettingsStore().get<Partial<ConfigCapacidade>>(CAPACIDADE_KEY);
  return normalizarConfig(salvo);
}

/** Mescla o salvo sobre o padrão e valida. Exportada para o teste. */
export function normalizarConfig(salvo: Partial<ConfigCapacidade> | null | undefined): ConfigCapacidade {
  const bruto = {
    ...CONFIG_CAPACIDADE_PADRAO,
    ...(salvo ?? {}),
    // `padrao` é objeto: o spread raso trocaria o bloco inteiro, e um salvo
    // com metade dos campos deixaria os outros indefinidos.
    padrao: { ...CONFIG_CAPACIDADE_PADRAO.padrao, ...(salvo?.padrao ?? {}) },
  };
  const parsed = configCapacidadeSchema.safeParse(bruto);
  return parsed.success ? parsed.data : CONFIG_CAPACIDADE_PADRAO;
}

export async function salvarConfigCapacidade(
  config: ConfigCapacidade,
  usuario: string,
): Promise<ConfigCapacidade> {
  const normalizada = normalizarConfig(config);
  await getSettingsStore().set(CAPACIDADE_KEY, normalizada, usuario);
  return normalizada;
}
