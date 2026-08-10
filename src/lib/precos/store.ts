import { getSettingsStore } from "@/lib/settings/store";
import {
  CATALOGO_PADRAO,
  DATA_CALIBRACAO_PADRAO,
  gerarIdMaterial,
  idCanonico,
  indicePorId,
  mesclarCatalogo,
  precisaRevisao,
  type MaterialPreco,
  type PrecoSalvo,
  type TabelaPrecos,
} from "./catalogo";

/**
 * Chave no store de configurações.
 *
 * Guarda o PREÇO dos itens de fábrica (o resto vem do código) e a definição
 * INTEIRA dos materiais que a equipe acrescentou pela planilha — esses não
 * existem em lugar nenhum senão aqui.
 */
export const PRECOS_KEY = "precos:materiais";

interface Salvo {
  /** `atualizadoEm` é opcional para ler o que foi salvo antes do carimbo por item. */
  precos: PrecoSalvo[];
  /**
   * Lápides dos materiais excluídos.
   *
   * Necessária só para os que o código define: apagar o registro não bastaria,
   * porque a definição segue no `CATALOGO_PADRAO` e o item voltaria na leitura
   * seguinte. Acrescentar o mesmo id de novo desfaz a lápide.
   */
  removidos?: string[];
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
  const itens = mesclarCatalogo(salvo?.precos, atualizadoEm, salvo?.removidos ?? []);
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

/** O que entra pela tela ou pela planilha. Sem `id` = material novo. */
export interface EntradaPreco {
  id?: string;
  preco: number;
  /** Só nos materiais novos — é a presença da descrição que os identifica. */
  categoria?: string;
  descricao?: string;
  unidade?: string;
}

/**
 * Grava a revisão. Aceita atualização PARCIAL: só os ids enviados mudam, o
 * resto fica como está — é o que permite a importação de uma planilha
 * preenchida pela metade sem zerar o que não foi mexido.
 *
 * Três casos, e a diferença entre eles é o que faz a planilha servir para
 * CRIAR material, não só para corrigir preço:
 *
 * 1. **Id conhecido** (de fábrica ou já criado): muda o preço.
 * 2. **Sem id, com descrição**: material novo. O id sai da descrição, para
 *    reimportar a mesma planilha atualizar o item em vez de duplicá-lo.
 * 3. **Id desconhecido e sem descrição**: ignorado. Sozinho ele seria uma
 *    linha vazia na lista de todo mundo, e é o que sobra de uma planilha
 *    antiga cujo item saiu do código.
 *
 * Ao gravar, todo id passa por `idCanonico`: o formato antigo, com prefixo de
 * serviço, se cura sozinho na primeira revisão em vez de conviver para sempre.
 */
export async function salvarPrecos(
  entradas: EntradaPreco[],
  usuario: string,
  /** Ids a remover. Vale para QUALQUER material — todos são tratados igual. */
  remover: string[] = [],
): Promise<{ atualizados: number; criados: number; removidos: number; ignorados: string[] }> {
  const store = getSettingsStore();
  const salvo = await store.get<Salvo>(PRECOS_KEY);
  const herdada = salvo?.atualizadoEm;
  const atual = new Map<string, PrecoSalvo>(
    (salvo?.precos ?? []).map((p) => [
      idCanonico(p.id),
      { ...p, id: idCanonico(p.id), atualizadoEm: p.atualizadoEm ?? herdada },
    ]),
  );
  const enterrados = new Set((salvo?.removidos ?? []).map(idCanonico));
  const agora = new Date().toISOString();
  const deFabrica = new Set(CATALOGO_PADRAO.map((p) => p.id));

  const ignorados: string[] = [];
  let atualizados = 0;
  let criados = 0;

  for (const e of entradas) {
    if (!Number.isFinite(e.preco) || e.preco < 0) { ignorados.push(e.id ?? e.descricao ?? "?"); continue; }
    const id = idCanonico(e.id ?? "");
    const conhecido = !!id && (deFabrica.has(id) || atual.has(id));

    if (conhecido) {
      const anterior = atual.get(id);
      // Carimbo por item: revisar o cabo não rejuvenesce o DR — cada material
      // reinicia o próprio prazo de 3 meses ao ser atualizado.
      atual.set(id, { ...anterior, id, preco: e.preco, atualizadoEm: agora });
      // Gravar de novo um material excluído o traz de volta.
      enterrados.delete(id);
      atualizados++;
      continue;
    }

    const descricao = e.descricao?.trim();
    if (!descricao) { ignorados.push(e.id ?? "?"); continue; }

    // Id explícito e inédito é respeitado; sem id, deriva-se da descrição.
    const novoId = id || gerarIdMaterial(descricao, [...deFabrica, ...atual.keys()]);
    atual.set(novoId, {
      id: novoId,
      preco: e.preco,
      atualizadoEm: agora,
      categoria: e.categoria?.trim() || "Outros",
      descricao,
      unidade: e.unidade?.trim() || "un",
    });
    enterrados.delete(novoId);
    criados++;
  }

  /*
   * Qualquer material sai — os do código e os da equipe. Para os do código o
   * registro não basta: a definição segue no `CATALOGO_PADRAO`, então vai uma
   * lápide junto, senão o item voltaria na leitura seguinte.
   *
   * Excluir da lista não quebra o cálculo do carregador: o motor tem a própria
   * tabela de reserva (`PRECOS_BASE`) e cai nela quando o id some. O que se
   * perde é o material aparecer para revisão de preço.
   */
  let removidos = 0;
  for (const bruto of remover) {
    const id = idCanonico(bruto);
    if (!id) { ignorados.push(bruto); continue; }
    const existia = atual.delete(id);
    if (deFabrica.has(id)) {
      enterrados.add(id);
      removidos++;
    } else if (existia) {
      removidos++;
    } else {
      ignorados.push(bruto);
    }
  }

  await store.set(
    PRECOS_KEY,
    {
      precos: [...atual.values()],
      removidos: [...enterrados],
      atualizadoEm: agora,
      atualizadoPor: usuario,
    } satisfies Salvo,
    usuario,
  );
  return { atualizados, criados, removidos, ignorados };
}
