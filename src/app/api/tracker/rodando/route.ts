import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTrackerStore } from "@/lib/tracker/store";

export const runtime = "nodejs";

/** Cronômetro em andamento do usuário logado (ou null) — usado pra restaurar
 *  o estado do timer ao recarregar a página ou abrir em outra aba. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const entrada = await getTrackerStore().getRodando(me.email);
  return NextResponse.json({ entrada });
}
