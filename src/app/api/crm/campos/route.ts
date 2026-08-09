import { NextResponse } from "next/server";
import { criarCampoSchema } from "@/lib/crm/campos";
import { getCampoStore } from "@/lib/crm/campos-store";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/** A LEITURA é de todo mundo: sem os campos, a ficha não sabe o que desenhar. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({ campos: await getCampoStore().list() });
}

export async function POST(req: Request) {
  // Criar campo muda o formulário de todo mundo — e um campo obrigatório novo
  // passa a barrar negociações. É decisão de gestor.
  const guard = await requirePermissaoApi("crm.configurar");
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarCampoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const campo = await getCampoStore().create({ ...parsed.data, arquivado: false });
  return NextResponse.json({ campo }, { status: 201 });
}
