import { NextResponse } from "next/server";
import { catalogoHandlers } from "@/lib/crm/catalogo-api";
import { getMotivoPerdaStore } from "@/lib/crm/catalogo-store";
import { MOTIVOS_PERDA_PADRAO } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const handlers = catalogoHandlers({
  store: getMotivoPerdaStore,
  sementes: MOTIVOS_PERDA_PADRAO,
  rotulo: "motivo de perda",
  campoEmUso: "motivoPerdaId",
  chaveLista: "motivos",
  chaveItem: "motivo",
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
