import { NextResponse } from "next/server";
import { getContatoStore } from "@/lib/crm/contatos-store";
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
  const ok = await getContatoStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
