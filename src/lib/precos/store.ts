import { getSettingsStore } from "@/lib/settings/store";
import {
  CATALOGO_PADRAO,
  DATA_CALIBRACAO_PADRAO,
  indicePorId,
  mesclarCatalogo,
  precisaRevisao,
  type MaterialPreco,
  type TabelaPrecos,
} from "./catalogo";

/** Chave no store de configurações. Só o preço é salvo — o resto vem do código. */
export const PRECOS_KEY = "precos:materiais";

interface Salvo {
  /** `atualizadoEm` é opcional para ler o que foi salvo antes do carimbo por item. */
  precos: { id: string; preco: number; atualizadoEm?: string }[];
  atualizadoEm: string;
  atualizadoPor: string;
}

/**
 * Tabela vigente: padrões do código com os preços revisados por cima.
 *
 * Enquanto ninguém revisou, `atualizadoEm` é a data do levantamento que
 * originou os padrões — não a de hoje. Fingir que a lista é nova só porque o
 * banco está vazio esconderia exatamente o problema que o alerta existe para
 * mostrar.
 */
export async function getPrecos(): Promise<TabelaPrecos & { revisaoPendente: boolean; totalPendentes: number }> {
  const salvo = await getSettingsStore().get<Salvo>(PRECOS_KEY);
  const atualizadoEm = salvo?.atualizadoEm ?? DATA_CALIBRACAO_PADRAO;
  const itens = mesclarCatalogo(salvo?.precos, atualizadoEm);
  return {
    itens,
    atualizadoEm,
    atualizadoPor: salvo?.atualizadoPor ?? "levantamento inicial",
    // Pendente quando QUALQUER item está vencido — o card geral chama para a
    // revisão ampla; o aviso dentro da proposta é que olha só o que ela usa.
    revisaoPendente: itens.some((i) => precisaRevisao(i.atualizadoEm)),
    totalPendentes: itens.filter((i) => precisaRevisao(i.atualizadoEm)).length,
  };
}

/** Índice id → preço para os motores. */
export async function getIndicePrecos(): Promise<Record<string, number>> {
  return indicePorId((await getPrecos()).itens);
}

/**
 * Grava a revisão. Aceita atualização PARCIAL: só os ids enviados mudam, o
 * resto fica como está — é o que permite a importação de uma planilha
 * preenchida pela metade sem zerar o que não foi mexido.
 */
export async function salvarPrecos(
  novos: { id: string; preco: number }[],
  usuario: string,
): Promise<{ atualizados: number; ignorados: string[] }> {
  const store = getSettingsStore();
  const salvo = await store.get<Salvo>(PRECOS_KEY);
  const herdada = salvo?.atualizadoEm;
  const atual = new Map(
    (salvo?.precos ?? []).map((p) => [p.id, { preco: p.preco, atualizadoEm: p.atualizadoEm ?? herdada }]),
  );
  const agora = new Date().toISOString();
  const validos = new Set(CATALOGO_PADRAO.map((p) => p.id));

  const ignorados: string[] = [];
  let atualizados = 0;
  for (const n of novos) {
    // Id fora do catálogo entraria como lixo permanente no banco.
    if (!validos.has(n.id)) { ignorados.push(n.id); continue; }
    if (!Number.isFinite(n.preco) || n.preco < 0) { ignorados.push(n.id); continue; }
    // Carimbo por item: revisar o cabo não rejuvenesce o DR.
    atual.set(n.id, { preco: n.preco, atualizadoEm: agora });
    atualizados++;
  }

  await store.set(
    PRECOS_KEY,
    {
      precos: [...atual.entries()].map(([id, v]) => ({ id, preco: v.preco, atualizadoEm: v.atualizadoEm })),
      atualizadoEm: agora,
      atualizadoPor: usuario,
    } satisfies Salvo,
    usuario,
  );
  return { atualizados, ignorados };
}
