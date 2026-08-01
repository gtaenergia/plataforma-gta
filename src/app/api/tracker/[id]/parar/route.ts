import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTrackerStore } from "@/lib/tracker/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Para o cronômetro: grava `fim = agora`. O `agora` é do servidor — nunca do cliente. */
export async function POST(_req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const store = getTrackerStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
  if (atual.usuarioEmail.trim().toLowerCase() !== me.email.trim().toLowerCase() && me.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão para parar este lançamento." }, { status: 403 });
  }
  if (atual.fim) return NextResponse.json({ error: "Este lançamento já está parado." }, { status: 409 });

  const entrada = await store.update(id, { fim: new Date().toISOString() });
  return NextResponse.json({ entrada });
}
