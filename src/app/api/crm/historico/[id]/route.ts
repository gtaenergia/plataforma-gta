import { NextResponse } from "next/server";
import { atualizarRegistroSchema } from "@/lib/crm/historico";
import { getHistoricoStore } from "@/lib/crm/historico-store";
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
  const parsed = atualizarRegistroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = getHistoricoStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  // Pedido avulso sem nome deixaria uma linha que não diz o que foi pedido.
  if (!atual.propostaId && parsed.data.titulo !== undefined && !parsed.data.titulo) {
    return NextResponse.json({ error: "Diga o que o cliente pediu." }, { status: 422 });
  }

  const registro = await store.update(id, parsed.data);
  if (!registro) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  return NextResponse.json({ registro });
}

/**
 * Apaga o que foi escrito à mão. No pedido avulso, a linha some; na proposta
 * do operacional, ela volta ao automático — a proposta continua lá.
 *
 * Como na negociação: só quem registrou, ou um administrador. Numa equipe
 * pequena isso não é desconfiança, é proteção contra o clique na linha errada.
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const store = getHistoricoStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });

  const meu = atual.criadoPor.trim().toLowerCase() === user.email.trim().toLowerCase();
  if (!meu && user.role !== "admin") {
    return NextResponse.json(
      { error: `Registrado por ${atual.criadoPorNome || atual.criadoPor}. Só quem registrou (ou um administrador) pode apagar.` },
      { status: 403 },
    );
  }

  await store.remove(id);
  return NextResponse.json({ ok: true });
}
