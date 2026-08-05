import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { getConfigCustoEquipe } from "@/lib/custo-equipe/config";
import { mapaDeCustos } from "@/lib/custo-equipe/types";
import { getConfigMaoDeObra } from "@/lib/mao-de-obra/config";
import { aplicarMarkup, custoDaEquipe } from "@/lib/mao-de-obra/motor";
import { linhaEquipeSchema, type LinhaEquipe } from "@/lib/mao-de-obra/types";
import type { FichaExterna } from "@/lib/orcamentos/types";

export const runtime = "nodejs";

/**
 * Custo administrativo interno de um orçamento.
 *
 * O cálculo é REFEITO aqui a partir do cadastro vigente, e não copiado do que
 * o navegador mandou: o custo entra na ficha, que é o registro histórico de
 * com que números o orçamento foi fechado. Aceitar o valor do corpo faria
 * qualquer autenticado escrever a margem da empresa.
 *
 * ## O custo tem dois papéis, conforme o serviço
 *
 * No "serviço por hora" o preço É custo × markup — não existe outra fonte —
 * então acrescentar horas da equipe RECALCULA o preço.
 *
 * Nos demais o preço veio do configurador (dimensionamento, Fator K...). Ali o
 * custo interno não muda o preço: ele responde a outra pergunta, que é a que o
 * dono fez — "o custo que eu tô tendo com gente interna tem que valer a pena
 * perto do faturamento".
 */

const corpoSchema = z.object({
  linhas: z.array(linhaEquipeSchema).max(50),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  // Ver e gravar custo são a mesma permissão: quem não pode enxergar a margem
  // não tem por que definir o custo que a produz.
  const guard = await requirePermissaoApi("financeiro.ver");
  if ("error" in guard) return guard.error;

  const { id } = await ctx.params;
  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = corpoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const [custos, maoDeObra] = await Promise.all([getConfigCustoEquipe(), getConfigMaoDeObra()]);
  const interna = custoDaEquipe(parsed.data.linhas as LinhaEquipe[], mapaDeCustos(custos));

  const anterior = orc.ficha;
  const imposto = anterior?.impostosPct ?? maoDeObra.impostoPadrao;
  const margem = anterior?.margemLiquida ?? maoDeObra.margemPadrao;

  const custoTerceirizado = anterior?.custoTerceirizado ?? 0;
  const custoAdministrativo = interna.custoCent / 100;
  const custoBase = custoTerceirizado + custoAdministrativo;

  /*
   * O preço do orçamento MANDA, e não é tocado aqui.
   *
   * Todo orçamento chega com preço vindo do seu configurador — dimensionamento
   * solar, Fator K, tabela. A margem é MEDIDA: é o que sobrou depois do custo e
   * do imposto. Pode dar negativo, e é justamente esse o aviso que o dono quer
   * ver — "o custo que eu tô tendo com gente interna tem que valer a pena perto
   * do faturamento".
   *
   * (A calculadora de mão de obra, em Propostas, faz o caminho inverso — do
   * custo para o preço — mas ela entrega uma planilha e não cria orçamento.)
   */
  const faturamento = orc.valor ?? 0;
  const impostoValor = faturamento * imposto;
  const lucro = faturamento - custoBase - impostoValor;
  const ficha: FichaExterna = {
    custoBase,
    fator: custoBase > 0 ? faturamento / custoBase : 0,
    faturamento: faturamento > 0 ? faturamento : 0.01, // o schema exige positivo
    impostosPct: imposto,
    margemLiquida: faturamento > 0 ? Math.max(-1, Math.min(1, lucro / faturamento)) : 0,
    custoAdministrativo,
    custoTerceirizado,
  };

  const atualizado = await store.update(id, { ficha });
  return NextResponse.json({
    orcamento: redigirOrcamento(atualizado, true),
    incompleta: interna.incompleta,
  });
}
