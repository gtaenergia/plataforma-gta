import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { removerAnexo } from "@/lib/orcamentos/anexo-store";
import { atualizarOrcamentoSchema } from "@/lib/orcamentos/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Detalhe de um orçamento. */
export async function GET(_req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const orc = await getOrcamentoStore().get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });
  return NextResponse.json({ orcamento: redigirOrcamento(orc, await temPermissao(guard.me, "financeiro.ver")) });
}

/** Edita dados do orçamento — apenas o criador (ou admin) e somente em rascunho. */
export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const me = guard.me;
  if (me.email !== orc.criadoPor && me.role !== "admin") {
    return NextResponse.json({ error: "Só o criador pode editar este orçamento." }, { status: 403 });
  }
  if (orc.estacao !== "rascunho") {
    return NextResponse.json({ error: "Só é possível editar em rascunho." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = atualizarOrcamentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  // O meta é substituído por inteiro no store; o schema só valida os campos
  // editáveis, então o merge preserva os campos calculados no servidor
  // (ex.: `regeneravel`, que habilita o botão de regerar o .docx).
  const patch = parsed.data.meta !== undefined ? { ...parsed.data, meta: { ...orc.meta, ...parsed.data.meta } } : parsed.data;
  const atualizado = await store.update(id, patch);
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) });
}

/** Exclui o orçamento e seus anexos — apenas o criador ou admin. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const me = guard.me;
  if (me.email !== orc.criadoPor && me.role !== "admin") {
    return NextResponse.json({ error: "Só o criador ou um administrador pode excluir." }, { status: 403 });
  }
  // Orçamento finalizado guarda a auditoria da decisão — só admin pode excluir.
  if ((orc.estacao === "aprovado" || orc.estacao === "cancelado") && me.role !== "admin") {
    return NextResponse.json({ error: "Orçamento finalizado — apenas um administrador pode excluir." }, { status: 409 });
  }

  // Remove os arquivos do storage (best-effort) antes de apagar o registro.
  for (const anexo of orc.anexos) await removerAnexo(anexo);
  await store.remove(id);
  return NextResponse.json({ ok: true });
}
