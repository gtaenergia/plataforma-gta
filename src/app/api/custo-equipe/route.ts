import { NextResponse } from "next/server";
import { requireApi, requirePermissaoApi } from "@/lib/rbac/guards";
import { getConfigCustoEquipe, salvarConfigCustoEquipe } from "@/lib/custo-equipe/config";
import { configCustoEquipeSchema } from "@/lib/custo-equipe/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Custo-hora da equipe interna.
 *
 * Diferente da rota de mão de obra, aqui NÃO há corte parcial: não existe nada
 * nesta resposta que sirva a quem não pode ver o valor. Quem não tem
 * `financeiro.ver` leva 403 e ponto.
 *
 * A fronteira que sustenta tudo isto: `/api/planejamento`, que guarda a
 * jornada das mesmas pessoas, é aberta a qualquer autenticado porque alimenta
 * a indicação de responsável. Custo-hora dividido por horas é salário, então
 * mora aqui, em outra chave e atrás de outra permissão.
 */
export async function GET() {
  const guard = await requirePermissaoApi("financeiro.ver");
  if ("error" in guard) return guard.error;
  return NextResponse.json({ config: await getConfigCustoEquipe() });
}

export async function PUT(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  // Ver é `financeiro.ver`; ALTERAR é de administrador. Mexer no R$/h muda o
  // custo de tudo que for orçado dali em diante.
  if (guard.me.role !== "admin") {
    return NextResponse.json(
      { error: "Sem permissão para alterar o custo da equipe." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = configCustoEquipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const config = await salvarConfigCustoEquipe(parsed.data, guard.me.name || guard.me.email);
  return NextResponse.json({ config });
}
