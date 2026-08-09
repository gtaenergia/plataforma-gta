import { NextResponse } from "next/server";
import { funilPadrao, getFunilStore, novaEtapa } from "@/lib/crm/funis-store";
import { criarFunilSchema } from "@/lib/crm/types";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const store = getFunilStore();
  let funis = await store.list();
  // Conta vazia ganha o funil padrão na primeira visita — como no RD, ninguém
  // começa diante de um quadro sem colunas.
  if (funis.length === 0) {
    await store.create(funilPadrao());
    funis = await store.list();
  }
  return NextResponse.json({ funis });
}

export async function POST(req: Request) {
  // Desenhar o funil é decisão de gestor: muda o processo comercial de todo
  // mundo, não só o trabalho de quem clicou.
  const guard = await requirePermissaoApi("crm.configurar");
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarFunilSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const funil = await getFunilStore().create({
    nome: parsed.data.nome,
    etapas: parsed.data.etapas.map((e) => (e.id ? { id: e.id, nome: e.nome } : novaEtapa(e.nome))),
  });
  return NextResponse.json({ funil }, { status: 201 });
}
