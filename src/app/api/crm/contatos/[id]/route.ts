import { NextResponse } from "next/server";
import { getContatoStore } from "@/lib/crm/contatos-store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { atualizarContatoSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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
  const parsed = atualizarContatoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const contato = await getContatoStore().update(id, parsed.data);
  if (!contato) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  return NextResponse.json({ contato });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  /*
   * Contato em uso não sai — mesma trava de fontes e motivos de perda.
   *
   * Sem ela, o contato apagado sumia das fichas em que participava sem deixar
   * rastro: o id continuava no jsonb da negociação, e o painel de contatos
   * simplesmente deixava de exibi-lo. Ninguém era avisado de nada.
   */
  const emUso = (await getNegociacaoStore().list()).filter((n) => n.contatoIds.includes(id));
  if (emUso.length > 0) {
    const nomes = emUso.slice(0, 3).map((n) => `"${n.nome}"`).join(", ");
    const resto = emUso.length > 3 ? ` e mais ${emUso.length - 3}` : "";
    return NextResponse.json(
      { error: `Este contato participa de ${emUso.length} ${emUso.length === 1 ? "negociação" : "negociações"} (${nomes}${resto}). Desvincule-o antes de excluir.` },
      { status: 409 },
    );
  }

  const ok = await getContatoStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
