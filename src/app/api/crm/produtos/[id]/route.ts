import { NextResponse } from "next/server";
import { getProdutoCrmStore } from "@/lib/crm/produtos-store";
import { atualizarProdutoCrmSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Sem DELETE de propósito: produto do catálogo não se exclui, se oculta
 * (`oculto: true` neste PATCH) — excluir apagaria o passado das negociações.
 */
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
  const parsed = atualizarProdutoCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const produto = await getProdutoCrmStore().update(id, parsed.data);
  if (!produto) return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 });
  return NextResponse.json({ produto });
}
