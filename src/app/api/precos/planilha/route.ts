import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { getPrecos } from "@/lib/precos/store";
import { gerarCsv } from "@/lib/precos/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Planilha de revisão, já preenchida com o que está valendo hoje. */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;

  const { itens } = await getPrecos();
  const hoje = new Date().toISOString().slice(0, 10);

  return new NextResponse(gerarCsv(itens), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="precos-materiais-${hoje}.csv"`,
    },
  });
}
