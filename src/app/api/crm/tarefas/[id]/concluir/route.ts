import { NextResponse } from "next/server";
import { z } from "zod";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { TIPO_TAREFA_LABEL } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ concluida: z.boolean() });

/** Concluir (ou reabrir) a tarefa, com registro no histórico da negociação. */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });

  const store = getTarefaCrmStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  if (atual.concluida === parsed.data.concluida) return NextResponse.json({ tarefa: atual });

  const tarefa = await store.update(id, {
    concluida: parsed.data.concluida,
    concluidaEm: parsed.data.concluida ? new Date().toISOString() : "",
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  await getNegociacaoStore().appendAnotacao(
    tarefa.negociacaoId,
    novaAnotacao({
      tipo: "sistema",
      texto: `${parsed.data.concluida ? "Tarefa concluída" : "Tarefa reaberta"} — ${TIPO_TAREFA_LABEL[tarefa.tipo]}: ${tarefa.assunto}.`,
      autor: user.email,
      autorNome: user.name || user.email,
    }),
  );

  return NextResponse.json({ tarefa });
}
