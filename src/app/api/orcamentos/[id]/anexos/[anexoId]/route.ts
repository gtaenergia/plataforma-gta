import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { removerAnexo } from "@/lib/orcamentos/anexo-store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; anexoId: string }> };

/** Remove um anexo (criador/admin/revisor), enquanto o orçamento não estiver finalizado. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id, anexoId } = await ctx.params;
  const me = guard.me;

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  if (orc.estacao === "aprovado" || orc.estacao === "cancelado") {
    return NextResponse.json({ error: "Orçamento finalizado — anexos não podem ser removidos." }, { status: 409 });
  }
  const autorizado =
    me.role === "admin" || me.email === orc.criadoPor || (await temPermissao(me, "orcamentos.revisar"));
  if (!autorizado) return NextResponse.json({ error: "Sem permissão para remover o anexo." }, { status: 403 });

  const anexo = orc.anexos.find((a) => a.id === anexoId);
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });

  if (!(await removerAnexo(anexo))) {
    return NextResponse.json({ error: "Não foi possível remover o arquivo agora. Tente novamente." }, { status: 502 });
  }
  const atualizado = await store.setAnexos(id, orc.anexos.filter((a) => a.id !== anexoId));
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) });
}
