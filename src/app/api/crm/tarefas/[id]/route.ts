import { NextResponse } from "next/server";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { atualizarTarefaCrmSchema, TIPO_TAREFA_LABEL } from "@/lib/crm/types";
import { notificar } from "@/lib/notificacoes/store";
import { getCurrentUser } from "@/lib/session";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Edição dos campos da tarefa (adiar = trocar a data; delegar = trocar o
 * responsável). Concluir/reabrir tem rota própria (./concluir), que grava o
 * histórico da negociação. Sem DELETE: tarefa não se exclui — regra do RD.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = atualizarTarefaCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = getTarefaCrmStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const patch = { ...parsed.data };
  // O estado final é o que conta: mudar só o "a cada" numa tarefa sem
  // unidade gravada deixaria uma repetição que não diz quando volta.
  const cada = patch.repetirCada ?? atual.repetirCada;
  const unidade = patch.repetirUnidade ?? atual.repetirUnidade;
  if (cada > 0 && !unidade) {
    return NextResponse.json({ error: "Informe de quanto em quanto tempo repete." }, { status: 422 });
  }
  if (patch.repetirCada === 0) patch.repetirUnidade = "";

  const delegando =
    !!patch.responsavel && patch.responsavel.trim().toLowerCase() !== atual.responsavel.trim().toLowerCase();
  // Nome vindo do cadastro quando a tela mandou só o e-mail: é ele que a
  // agenda mostra ao lado do compromisso.
  if (delegando && !patch.responsavelNome) {
    patch.responsavelNome = (await (await users()).getByEmail(patch.responsavel!))?.name || patch.responsavel;
  }

  const tarefa = await store.update(id, patch);
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  // Delegar é passar o compromisso para outra pessoa — que precisa saber, como
  // em Operações. Quem assume para si mesmo não recebe o próprio aviso.
  if (delegando && tarefa.responsavel.toLowerCase() !== user.email.toLowerCase()) {
    const comQuem = tarefa.negociacaoNome ? `na negociação "${tarefa.negociacaoNome}"` : `com ${tarefa.clienteNome}`;
    await notificar({
      paraEmail: tarefa.responsavel,
      tipo: "crm_tarefa",
      titulo: "Tarefa do CRM para você",
      mensagem: `${user.name || user.email} passou para você: ${TIPO_TAREFA_LABEL[tarefa.tipo]} — ${tarefa.assunto}, ${comQuem}.`,
      link: tarefa.negociacaoId ? `/crm/negociacoes/${tarefa.negociacaoId}` : `/crm/clientes/${tarefa.clienteId}`,
    });
  }

  return NextResponse.json({ tarefa });
}
