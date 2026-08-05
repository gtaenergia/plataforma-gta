import { NextResponse } from "next/server";
import { requirePermissaoApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { comentarioSchema } from "@/lib/orcamentos/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Adiciona um comentário de revisão (rastro). Exige permissão de revisar. */
export async function POST(req: Request, ctx: Ctx) {
  const guard = await requirePermissaoApi("orcamentos.revisar");
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = comentarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const me = guard.me;
  const store = getOrcamentoStore();
  const atualizado = await store.addComentario(id, { autor: me.name || me.email, texto: parsed.data.texto });
  if (!atualizado) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) }, { status: 201 });
}
