import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { getConfigCapacidade, salvarConfigCapacidade } from "@/lib/capacidade/config";
import { configCapacidadeSchema } from "@/lib/capacidade/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capacidade da equipe (jornada por pessoa e estimativa por categoria).
 *
 * LEITURA aberta a qualquer autenticado: é o que alimenta a sugestão de
 * responsável no formulário de tarefa e o painel de carga, e nada aqui é mais
 * sensível que a lista de tarefas — que `GET /api/tarefas` já devolve inteira
 * para todo mundo. (Custo-hora, quando existir, mora em outra chave e em outra
 * rota, exatamente por não ser assim.)
 *
 * ESCRITA é de administrador: mexer na jornada dos outros é decisão de gestão.
 */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  return NextResponse.json({ config: await getConfigCapacidade() });
}

export async function PUT(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  if (guard.me.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão para alterar a capacidade da equipe." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = configCapacidadeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const config = await salvarConfigCapacidade(parsed.data, guard.me.name || guard.me.email);
  return NextResponse.json({ config });
}
