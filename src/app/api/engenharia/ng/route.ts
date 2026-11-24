import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buscarNg } from "@/lib/engenharia/ng";

export const runtime = "nodejs";

/** Busca de município → NG (Tabela F.1 da NBR 5419-2:2026). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ municipios: buscarNg(q.slice(0, 80)) }, { headers: { "Cache-Control": "private, max-age=86400" } });
}
