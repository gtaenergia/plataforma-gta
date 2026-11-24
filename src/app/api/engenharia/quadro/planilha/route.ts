import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { planilhaQuadro } from "@/lib/engenharia/quadro/planilha";
import { ferramentaValida } from "@/lib/engenharia/validacao";
import type { DadosQuadro } from "@/lib/engenharia/quadro/tipos";

export const runtime = "nodejs";

/** Planilha .xlsx do quadro de cargas (calculada no servidor com o mesmo motor da tela). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  let body: { quadro?: unknown; projeto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  if (!body.quadro || !ferramentaValida(body.quadro)) return NextResponse.json({ error: "Quadro inválido." }, { status: 422 });
  try {
    const buf = await planilhaQuadro(body.quadro as DadosQuadro, String(body.projeto ?? "").slice(0, 120));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="quadro-de-cargas.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao gerar a planilha." }, { status: 500 });
  }
}
