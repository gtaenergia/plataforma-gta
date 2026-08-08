import { NextResponse } from "next/server";
import { getPropostaStore } from "@/lib/propostas/store";
import { updatePropostaSchema } from "@/lib/propostas/types";
import { negociacaoDaProposta } from "@/lib/crm/retorno";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const proposta = await getPropostaStore().get(id);
  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  return NextResponse.json({ proposta });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = updatePropostaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  /*
   * O vínculo com a negociação do CRM sobrevive ao salvamento.
   *
   * Os 13 configuradores gravam `dados` INTEIRO a cada save — o objeto que eles
   * montam a partir do próprio formulário, que não conhece o CRM. Sem esta
   * costura, o primeiro "Salvar proposta" apagaria `negociacaoId` e o valor
   * nunca voltaria ao comercial.
   *
   * Aqui, e não em cada configurador: é uma regra de integração, e espalhá-la
   * por treze telas seria criar treze chances de esquecer.
   */
  const store = getPropostaStore();
  let patch = parsed.data;
  if (patch.dados && !negociacaoDaProposta(patch.dados)) {
    const anterior = await store.get(id);
    const vinculo = negociacaoDaProposta(anterior?.dados);
    if (vinculo) patch = { ...patch, dados: { ...patch.dados, negociacaoId: vinculo } };
  }

  const proposta = await store.update(id, patch);
  if (!proposta) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  return NextResponse.json({ proposta });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await getPropostaStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
