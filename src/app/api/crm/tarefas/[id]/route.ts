import { NextResponse } from "next/server";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { atualizarTarefaCrmSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edição dos campos da tarefa (adiar = trocar a data). Concluir/reabrir tem
 * rota própria (./concluir), que grava o histórico da negociação. Sem DELETE:
 * tarefa não se exclui — regra do RD.
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
  const parsed = atualizarTarefaCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const tarefa = await getTarefaCrmStore().update(id, parsed.data);
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  return NextResponse.json({ tarefa });
}
