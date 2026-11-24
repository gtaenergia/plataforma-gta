import { NextResponse } from "next/server";
import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { getAuditoriaStore } from "@/lib/financeiro/auditoria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Últimos registros da auditoria (só leitura — não existe rota que apague). */
export async function GET(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const limite = Math.min(1000, Math.max(1, Number(new URL(req.url).searchParams.get("limite")) || 300));
  const registros = await getAuditoriaStore().listar(limite);
  return NextResponse.json({ registros }, { headers: { "Cache-Control": "no-store" } });
}
