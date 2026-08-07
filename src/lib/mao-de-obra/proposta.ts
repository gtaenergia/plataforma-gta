import type { LinhaCalculada } from "./types";

/**
 * Da composição de mão de obra aos itens da PROPOSTA (pura, sem I/O).
 *
 * A calculadora entrega uma planilha; a proposta entrega um .docx no molde
 * padrão da plataforma. Este módulo faz a ponte: resume a equipe numa linha de
 * escopo legível e reparte o preço final entre mão de obra e materiais.
 */

/** Tipos de item de custo além da mão de obra. */
export const TIPOS_MATERIAL = ["material", "ferramenta", "equipamento", "outro"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

export const TIPO_MATERIAL_LABEL: Record<TipoMaterial, string> = {
  material: "Material",
  ferramenta: "Ferramenta",
  equipamento: "Equipamento",
  outro: "Outro",
};

/** Uma linha de material/ferramenta, já numérica (a tela converte o texto). */
export interface LinhaMaterial {
  tipo: TipoMaterial;
  descricao: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
}

/** Custo total dos materiais em centavos — linha a linha, como o motor faz. */
export function custoMateriaisCent(linhas: readonly LinhaMaterial[]): number {
  return linhas.reduce((s, l) => {
    const qtd = Number.isFinite(l.quantidade) ? Math.max(0, l.quantidade) : 0;
    const unit = Number.isFinite(l.valorUnitario) ? Math.max(0, l.valorUnitario) : 0;
    return s + Math.round(qtd * unit * 100);
  }, 0);
}

/**
 * "2 Eletricistas × 40 h · 1 Ajudante × 40 h" — o resumo da equipe que entra
 * na descrição do item da proposta. Linhas sem função ou sem horas ficam fora.
 */
export function resumoEquipe(linhas: readonly LinhaCalculada[]): string {
  return linhas
    .filter((l) => l.funcao && l.horasTotais > 0)
    .map((l) => {
      const pessoas = Math.max(1, l.linha.pessoas);
      const plural = pessoas > 1 ? "s" : "";
      return `${pessoas} ${l.funcao!.nome}${plural} × ${l.linha.horas.toLocaleString("pt-BR")} h`;
    })
    .join(" · ");
}

/**
 * Reparte o preço FINAL entre mão de obra e materiais, na proporção do custo.
 *
 * O markup incide sobre a soma dos custos; a proposta, porém, mostra duas
 * linhas. Repartir pela proporção mantém a margem igual nas duas — e o
 * arredondamento cai na linha de mão de obra, para a soma fechar exata com o
 * preço apresentado.
 */
export function repartirPreco(
  precoCent: number,
  custoMaoDeObraCent: number,
  custoMateriaisCent2: number,
): { maoDeObraCent: number; materiaisCent: number } {
  const custoTotal = custoMaoDeObraCent + custoMateriaisCent2;
  if (custoTotal <= 0 || custoMateriaisCent2 <= 0) return { maoDeObraCent: precoCent, materiaisCent: 0 };
  if (custoMaoDeObraCent <= 0) return { maoDeObraCent: 0, materiaisCent: precoCent };
  const materiaisCent = Math.round((precoCent * custoMateriaisCent2) / custoTotal);
  return { maoDeObraCent: precoCent - materiaisCent, materiaisCent };
}
