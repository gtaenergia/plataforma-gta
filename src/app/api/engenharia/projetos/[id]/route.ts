import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProjetoEngStore, type PatchProjeto } from "@/lib/engenharia/store";
import { ferramentaValida, sanearDados } from "@/lib/engenharia/validacao";
import type { DadosRisco } from "@/lib/engenharia/risco/tipos";
import type { DadosQuadro } from "@/lib/engenharia/quadro/tipos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const projeto = await getProjetoEngStore().get(id);
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  return NextResponse.json({ projeto });
}

/** Salvamento parcial: só o que vier no corpo muda (dados, risco e/ou quadro). */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const patch: PatchProjeto = {};
  if ("dados" in body) {
    const dados = sanearDados(body.dados);
    if (!dados.nome.trim()) return NextResponse.json({ error: "Informe o nome do projeto." }, { status: 422 });
    patch.dados = dados;
  }
  if ("risco" in body) {
    if (!ferramentaValida(body.risco)) return NextResponse.json({ error: "Análise de risco inválida ou grande demais." }, { status: 422 });
    patch.risco = body.risco as DadosRisco | null;
  }
  if ("quadro" in body) {
    if (!ferramentaValida(body.quadro)) return NextResponse.json({ error: "Quadro de cargas inválido ou grande demais." }, { status: 422 });
    patch.quadro = body.quadro as DadosQuadro | null;
  }
  const projeto = await getProjetoEngStore().update(id, patch);
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  return NextResponse.json({ projeto: { id: projeto.id, atualizadoEm: projeto.atualizadoEm } });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await getProjetoEngStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
