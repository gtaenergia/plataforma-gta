import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { oneDriveConfigurado, enviarOrcamentoParaOneDrive } from "@/lib/onedrive/orcamento";
import type { OrcamentoOneDrive } from "@/lib/orcamentos/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Envia (ou reenvia) os arquivos do orçamento aprovado para o OneDrive. */
export async function POST(_req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const me = guard.me;
  const { id } = await ctx.params;

  if (!oneDriveConfigurado()) {
    return NextResponse.json({ error: "A integração com o OneDrive ainda não está configurada." }, { status: 400 });
  }

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const souDono = orc.criadoPor === me.email;
  const podeRevisar = await temPermissao(me, "orcamentos.revisar");
  const podeAprovar = await temPermissao(me, "orcamentos.aprovar");
  if (!(souDono || podeRevisar || podeAprovar)) {
    return NextResponse.json({ error: "Você não tem permissão para esta ação." }, { status: 403 });
  }

  if (orc.estacao !== "aprovado") {
    return NextResponse.json({ error: "Só orçamentos aprovados são enviados ao OneDrive." }, { status: 409 });
  }

  let resultado: OrcamentoOneDrive;
  try {
    resultado = await enviarOrcamentoParaOneDrive(orc);
  } catch (e) {
    resultado = { pasta: "", url: "", arquivos: 0, enviadoEm: new Date().toISOString(), erro: e instanceof Error ? e.message : "Falha ao enviar ao OneDrive." };
  }
  const atualizado = await store.update(id, { oneDrive: resultado });
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) });
}
