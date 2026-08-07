import { NextResponse } from "next/server";
import { getContatoStore } from "@/lib/crm/contatos-store";
import { criarContatoSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const contatos = await getContatoStore().list();
  return NextResponse.json({ contatos });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarContatoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const contato = await getContatoStore().create({
    ...parsed.data,
    criadoPor: user.email,
    criadoPorNome: user.name || user.email,
  });
  return NextResponse.json({ contato }, { status: 201 });
}
