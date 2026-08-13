import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTrackerStore } from "@/lib/tracker/store";
import { ordemPreservada, updateTimeEntrySchema } from "@/lib/tracker/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Só o dono do lançamento (ou admin, super-usuário) pode editar/excluir. */
function souDonoOuAdmin(entrada: { usuarioEmail: string }, me: { email: string; role: string }): boolean {
  return me.role === "admin" || entrada.usuarioEmail.trim().toLowerCase() === me.email.trim().toLowerCase();
}

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const store = getTrackerStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (!souDonoOuAdmin(atual, me)) return NextResponse.json({ error: "Sem permissão para editar este lançamento." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = updateTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  // A ordem é conferida no ESTADO RESULTANTE, não só no patch — ver
  // `ordemPreservada`. Vale para qualquer cliente, não só para o formulário.
  if (!ordemPreservada(atual, parsed.data)) {
    return NextResponse.json({ error: "O fim precisa ser depois do início." }, { status: 422 });
  }

  const entrada = await store.update(id, parsed.data);
  return NextResponse.json({ entrada });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const store = getTrackerStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (!souDonoOuAdmin(atual, me)) return NextResponse.json({ error: "Sem permissão para excluir este lançamento." }, { status: 403 });

  const ok = await store.remove(id);
  return NextResponse.json({ ok });
}
