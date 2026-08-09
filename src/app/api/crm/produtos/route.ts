import { NextResponse } from "next/server";
import { getProdutoCrmStore } from "@/lib/crm/produtos-store";
import { criarProdutoCrmSchema } from "@/lib/crm/types";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const produtos = await getProdutoCrmStore().list();
  return NextResponse.json({ produtos });
}

export async function POST(req: Request) {
  const guard = await requirePermissaoApi("crm.configurar");
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarProdutoCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const produto = await getProdutoCrmStore().create({ ...parsed.data, oculto: false });
  return NextResponse.json({ produto }, { status: 201 });
}
