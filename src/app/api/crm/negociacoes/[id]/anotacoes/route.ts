import { NextResponse } from "next/server";
import { z } from "zod";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const anotacaoSchema = z.object({
  texto: z.string().trim().min(1, "Escreva a anotação").max(4000),
});

/**
 * Só POST: anotação não se lista à parte (vem no GET da negociação), não se
 * edita e não se exclui — histórico imutável, como no RD.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = anotacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const negociacao = await getNegociacaoStore().appendAnotacao(
    id,
    novaAnotacao({ tipo: "nota", texto: parsed.data.texto, autor: user.email, autorNome: user.name || user.email }),
  );
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });
  return NextResponse.json({ negociacao }, { status: 201 });
}
