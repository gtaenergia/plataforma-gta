import { NextResponse, after } from "next/server";
import { z } from "zod";
import { getTaskStore } from "@/lib/tasks/store";
import { getCurrentUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";
import { notificar } from "@/lib/notificacoes/store";
import { carimbosDaTransicao } from "@/lib/tasks/verificacao";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const devolverSchema = z.object({
  motivo: z.string().trim().min(3, "Escreva o motivo da devolução.").max(2000, "O motivo pode ter até 2000 caracteres."),
});

/**
 * Devolve ao responsável uma tarefa marcada como "Concluída".
 *
 * Rota própria, e não um PATCH de status, porque devolver é mais que mudar o
 * status: o motivo é obrigatório, fica nos comentários e vai no aviso ao
 * responsável. Pelo PATCH, a tarefa voltaria para a fila dele sem nenhuma
 * explicação — e sem ele saber que voltou.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await temPermissao(user, "tarefas.verificar"))) {
    return NextResponse.json(
      { error: "Devolver tarefas cabe a administradores e a quem tem a permissão de verificar tarefas." },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = devolverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { motivo } = parsed.data;

  const store = getTaskStore();
  const antes = await store.get(id);
  if (!antes) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  if (antes.status !== "entregue") {
    return NextResponse.json(
      // A tarefa vai junto para a tela se atualizar: quem abriu a página antes
      // de outra pessoa agir está olhando um status que já não vale.
      { error: "Só uma tarefa marcada como Concluída, aguardando verificação, pode ser devolvida.", task: antes },
      { status: 409 },
    );
  }

  const quem = user.name || user.email;
  // O comentário vai antes da mudança de status: se a segunda gravação falhar,
  // sobra um motivo registrado a mais — e não uma tarefa devolvida sem motivo.
  await store.addComment(id, { autor: quem, texto: `Devolvida para ajuste: ${motivo}` });
  const task = await store.update(id, {
    status: "andamento",
    ...carimbosDaTransicao(antes.status, "andamento", user.email, new Date().toISOString()),
  });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  if (antes.responsavel && antes.responsavel.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    after(() =>
      notificar({
        paraEmail: antes.responsavel,
        tipo: "tarefa_devolvida",
        titulo: `Tarefa devolvida: ${task.titulo}`,
        mensagem: `${quem} devolveu a tarefa para ajuste: ${motivo}`,
        link: `/tarefas/${task.id}`,
      }),
    );
  }

  return NextResponse.json({ task });
}
