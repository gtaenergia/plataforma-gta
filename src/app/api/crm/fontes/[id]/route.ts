import { NextResponse } from "next/server";
import { catalogoHandlers } from "@/lib/crm/catalogo-api";
import { getFonteStore } from "@/lib/crm/catalogo-store";
import { FONTES_PADRAO } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const handlers = catalogoHandlers({
  store: getFonteStore,
  sementes: FONTES_PADRAO,
  rotulo: "fonte",
  campoEmUso: "fonteId",
  chaveLista: "fontes",
  chaveItem: "fonte",
});

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  return handlers.PATCH(req, id);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  return handlers.DELETE(id);
}
