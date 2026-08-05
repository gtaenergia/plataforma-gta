import { getSettingsStore } from "@/lib/settings/store";
import {
  CONFIG_CUSTO_EQUIPE_PADRAO,
  CUSTO_EQUIPE_KEY,
  configCustoEquipeSchema,
  type ConfigCustoEquipe,
} from "./types";

/**
 * Leitura e escrita do custo-hora da equipe interna.
 *
 * SOMENTE SERVIDOR: puxa o store de settings, que em desenvolvimento usa
 * `node:fs`. O motor recebe o mapa pronto por parâmetro (ver `mapaDeCustos`)
 * justamente para não arrastar este arquivo para o bundle do cliente — onde,
 * além do peso, o dado não deveria nem chegar.
 */

/** Config vigente. Nunca lança: registro corrompido cai no vazio. */
export async function getConfigCustoEquipe(): Promise<ConfigCustoEquipe> {
  const salvo = await getSettingsStore().get<Partial<ConfigCustoEquipe>>(CUSTO_EQUIPE_KEY);
  return normalizarConfig(salvo);
}

/** Mescla o salvo sobre o padrão e valida. Exportada para o teste. */
export function normalizarConfig(salvo: Partial<ConfigCustoEquipe> | null | undefined): ConfigCustoEquipe {
  const parsed = configCustoEquipeSchema.safeParse({ ...CONFIG_CUSTO_EQUIPE_PADRAO, ...(salvo ?? {}) });
  if (!parsed.success) return CONFIG_CUSTO_EQUIPE_PADRAO;

  // A chave é o e-mail, e ele chega de formulário. Normalizar aqui evita que
  // "Gabriel@..." e "gabriel@..." virem duas pessoas com custos diferentes.
  const pessoas: ConfigCustoEquipe["pessoas"] = {};
  for (const [email, dados] of Object.entries(parsed.data.pessoas)) {
    const chave = email.trim().toLowerCase();
    if (chave) pessoas[chave] = dados;
  }
  return { pessoas };
}

/**
 * Grava, carimbando `atualizadoEm` só em quem MUDOU de valor.
 *
 * Carimbar tudo a cada salvamento zeraria o aviso de "valor antigo" sem
 * ninguém ter conferido nada — bastaria abrir a tela e salvar para tudo
 * parecer recente.
 */
export async function salvarConfigCustoEquipe(
  entrada: ConfigCustoEquipe,
  usuario: string,
): Promise<ConfigCustoEquipe> {
  const anterior = await getConfigCustoEquipe();
  const normalizada = normalizarConfig(entrada);
  const agora = new Date().toISOString();

  const pessoas: ConfigCustoEquipe["pessoas"] = {};
  for (const [email, dados] of Object.entries(normalizada.pessoas)) {
    const antes = anterior.pessoas[email];
    const mudou = !antes || antes.custoHora !== dados.custoHora;
    pessoas[email] = {
      custoHora: dados.custoHora,
      atualizadoEm: mudou ? agora : (antes?.atualizadoEm ?? agora),
    };
  }

  const final = { pessoas };
  await getSettingsStore().set(CUSTO_EQUIPE_KEY, final, usuario);
  return final;
}
