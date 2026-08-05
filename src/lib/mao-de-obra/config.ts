import { getSettingsStore } from "@/lib/settings/store";
import {
  CONFIG_MAO_DE_OBRA_PADRAO,
  MAO_DE_OBRA_KEY,
  configMaoDeObraSchema,
  type ConfigMaoDeObra,
} from "./types";

/**
 * Leitura e escrita do catálogo de mão de obra.
 *
 * SOMENTE SERVIDOR: puxa o store de settings, que em desenvolvimento usa
 * `node:fs`. O motor (./motor) recebe a config pronta por parâmetro justamente
 * para não arrastar este arquivo — e o driver do Postgres — para o bundle do
 * cliente, onde o preço precisa recalcular a cada tecla.
 */

/**
 * Config vigente. Nunca lança: catálogo corrompido cai no padrão, porque
 * derrubar a tela de orçamento por causa de um JSON estranho é pior que abrir
 * com as funções sem custo — que a tela já sabe sinalizar.
 */
export async function getConfigMaoDeObra(): Promise<ConfigMaoDeObra> {
  const salvo = await getSettingsStore().get<Partial<ConfigMaoDeObra>>(MAO_DE_OBRA_KEY);
  return normalizarConfig(salvo);
}

/** Mescla o salvo sobre o padrão e valida. Exportada para o teste. */
export function normalizarConfig(salvo: Partial<ConfigMaoDeObra> | null | undefined): ConfigMaoDeObra {
  const bruto = { ...CONFIG_MAO_DE_OBRA_PADRAO, ...(salvo ?? {}) };
  const parsed = configMaoDeObraSchema.safeParse(bruto);
  if (!parsed.success) return CONFIG_MAO_DE_OBRA_PADRAO;

  /*
   * Id repetido é pior que id ausente: duas funções com a mesma chave fazem o
   * `Map` do motor guardar só a última, e a linha do orçamento passa a apontar
   * silenciosamente para o custo errado.
   */
  const vistos = new Set<string>();
  const funcoes = parsed.data.funcoes.filter((f) => {
    if (vistos.has(f.id)) return false;
    vistos.add(f.id);
    return true;
  });
  return { ...parsed.data, funcoes };
}

export async function salvarConfigMaoDeObra(
  config: ConfigMaoDeObra,
  usuario: string,
): Promise<ConfigMaoDeObra> {
  const normalizada = normalizarConfig(config);
  await getSettingsStore().set(MAO_DE_OBRA_KEY, normalizada, usuario);
  return normalizada;
}
