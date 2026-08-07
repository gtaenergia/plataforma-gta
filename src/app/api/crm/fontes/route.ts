import { NextResponse } from "next/server";
import { catalogoHandlers } from "@/lib/crm/catalogo-api";
import { getFonteStore } from "@/lib/crm/catalogo-store";
import { FONTES_PADRAO } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const handlers = catalogoHandlers({
  store: getFonteStore,
  sementes: FONTES_PADRAO,
  rotulo: "fonte",
  campoEmUso: "fonteId",
  chaveLista: "fontes",
  chaveItem: "fonte",
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return handlers.GET();
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return handlers.POST(req);
}
