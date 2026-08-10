import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/rbac/guards";
import { getPrecos, salvarPrecos } from "@/lib/precos/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tabela de preços de materiais. A LEITURA é aberta a qualquer autenticado —
 * o alerta de lista vencida aparece para todo mundo, e sem poder ler a data
 * não haveria como mostrá-lo. A ESCRITA é de administrador.
 */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  return NextResponse.json(await getPrecos());
}

const schema = z
  .object({
    precos: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          preco: z.coerce.number().min(0),
          validadeDias: z.coerce.number().int().positive().max(3650).optional(),
          // Presentes só ao acrescentar material pela tela.
          categoria: z.string().trim().max(60).optional(),
          descricao: z.string().trim().max(200).optional(),
          unidade: z.string().trim().max(20).optional(),
        }),
      )
      .default([]),
    /** Ids a remover — só valem para material criado pela equipe. */
    remover: z.array(z.string().min(1)).default([]),
  })
  .refine((b) => b.precos.length > 0 || b.remover.length > 0, {
    message: "Envie ao menos um preço ou uma remoção.",
    path: ["precos"],
  });

export async function PUT(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  if (guard.me.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão para alterar preços." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const r = await salvarPrecos(parsed.data.precos, guard.me.name || guard.me.email, parsed.data.remover);
  return NextResponse.json({ ...r, tabela: await getPrecos() });
}
