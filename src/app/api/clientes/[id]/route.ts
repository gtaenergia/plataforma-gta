import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { atualizarClienteSchema } from "@/lib/clientes/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const cliente = await getClienteStore().get(id);
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({ cliente });
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
  const parsed = atualizarClienteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const cliente = await getClienteStore().update(id, parsed.data);
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({ cliente });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  /*
   * Empresa com negociação no CRM não sai.
   *
   * A negociação guarda `empresaId` E `empresaNome`. Apagar a empresa deixava o
   * id apontando para o nada — e bastava alguém salvar a ficha depois para o
   * nome ser zerado junto, sumindo o cliente da lista e do funil. Travar aqui
   * é mais honesto do que remendar cada tela que lê o cadastro.
   */
  const emUso = (await getNegociacaoStore().list()).filter((n) => n.empresaId === id);
  if (emUso.length > 0) {
    return NextResponse.json(
      { error: `Esta empresa tem ${emUso.length} ${emUso.length === 1 ? "negociação" : "negociações"} no CRM. Conclua-as ou troque a empresa delas antes de excluir.` },
      { status: 409 },
    );
  }

  const ok = await getClienteStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
