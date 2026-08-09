import { NextResponse } from "next/server";
import { atualizarCampoSchema } from "@/lib/crm/campos";
import { getCampoStore } from "@/lib/crm/campos-store";
import { requirePermissaoApi } from "@/lib/rbac/guards";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Sem DELETE de propósito: campo se ARQUIVA (`arquivado: true` neste PATCH).
 * Excluir apagaria a definição de um dado já digitado — o valor continuaria no
 * jsonb da negociação sem rótulo e sem tipo, impossível de exibir.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const guard = await requirePermissaoApi("crm.configurar");
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = atualizarCampoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const atual = (await getCampoStore().list()).find((c) => c.id === id);
  if (!atual) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

  // Deixar um campo de escolha sem opções o tornaria impossível de preencher —
  // e, se obrigatório, travaria toda negociação que passasse por ele.
  const opcoes = parsed.data.opcoes ?? atual.opcoes;
  if (["opcao", "multipla"].includes(atual.tipo) && opcoes.length === 0) {
    return NextResponse.json({ error: "Este tipo de campo precisa de ao menos uma opção." }, { status: 422 });
  }

  const campo = await getCampoStore().update(id, parsed.data);
  if (!campo) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });
  return NextResponse.json({ campo });
}
