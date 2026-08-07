import { NextResponse } from "next/server";
import { catalogoHandlers } from "@/lib/crm/catalogo-api";
import { getMotivoPerdaStore } from "@/lib/crm/catalogo-store";
import { MOTIVOS_PERDA_PADRAO } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const handlers = catalogoHandlers({
  store: getMotivoPerdaStore,
  sementes: MOTIVOS_PERDA_PADRAO,
  rotulo: "motivo de perda",
  campoEmUso: "motivoPerdaId",
  chaveLista: "motivos",
  chaveItem: "motivo",
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
