import { NextResponse } from "next/server";
import { getFunilStore, novaEtapa } from "@/lib/crm/funis-store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { atualizarFunilSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = atualizarFunilSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  // Remover etapa que ainda tem negociação deixaria cartões órfãos no quadro.
  if (parsed.data.etapas) {
    const atual = await getFunilStore().get(id);
    if (!atual) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
    const idsNovos = new Set(parsed.data.etapas.map((e) => e.id).filter(Boolean));
    const removidas = atual.etapas.filter((e) => !idsNovos.has(e.id));
    if (removidas.length > 0) {
      const negociacoes = await getNegociacaoStore().list();
      const ocupada = removidas.find((e) => negociacoes.some((n) => n.etapaId === e.id));
      if (ocupada) {
        return NextResponse.json(
          { error: `A etapa "${ocupada.nome}" tem negociações — mova-as antes de removê-la.` },
          { status: 409 },
        );
      }
    }
  }

  const funil = await getFunilStore().update(id, {
    ...(parsed.data.nome !== undefined ? { nome: parsed.data.nome } : {}),
    ...(parsed.data.etapas
      ? { etapas: parsed.data.etapas.map((e) => (e.id ? { id: e.id, nome: e.nome } : novaEtapa(e.nome))) }
      : {}),
  });
  if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
  return NextResponse.json({ funil });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const negociacoes = await getNegociacaoStore().list();
  if (negociacoes.some((n) => n.funilId === id)) {
    return NextResponse.json({ error: "O funil tem negociações — mova-as ou exclua-as antes." }, { status: 409 });
  }
  // O quadro precisa de ao menos um funil para existir.
  if ((await getFunilStore().list()).length <= 1) {
    return NextResponse.json({ error: "A conta precisa de ao menos um funil." }, { status: 409 });
  }

  const ok = await getFunilStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
