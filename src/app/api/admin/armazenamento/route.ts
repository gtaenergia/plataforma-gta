import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { medirArmazenamento } from "@/lib/admin/armazenamento";

export const runtime = "nodejs";
/** Medição ao vivo: o valor de ontem não ajuda a decidir o que apagar hoje. */
export const dynamic = "force-dynamic";

/**
 * Consumo de armazenamento do banco e do Blob. Restrito a administradores —
 * expõe nomes de tabela, contagem de linhas e caminhos de arquivo, que são
 * informação de infraestrutura.
 */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  if (guard.me.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão para esta ação." }, { status: 403 });
  }

  try {
    return NextResponse.json(await medirArmazenamento());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao medir o armazenamento.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
