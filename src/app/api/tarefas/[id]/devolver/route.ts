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
  // Opcional por decisão do dono (23/11/2026). Sem motivo, a devolução segue
  // registrada nos comentários — quem devolveu e quando — e o responsável
  // continua sendo avisado.
  motivo: z.string().trim().max(2000, "O motivo pode ter até 2000 caracteres.").default(""),
});

/**
 * Devolve ao responsável uma tarefa marcada como "Concluída".
 *
 * Rota própria, e não um PATCH de status, porque devolver é mais que mudar o
 * status: a devolução fica nos comentários (com o motivo, quando informado) e
 * o responsável é avisado. Pelo PATCH, a tarefa voltaria para a fila dele sem
 * registro — e sem ele saber que voltou.
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
    const texto = await req.text();
    body = texto.trim() ? JSON.parse(texto) : {};
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
  // sobra um registro a mais — e não uma tarefa devolvida sem registro.
  await store.addComment(id, { autor: quem, texto: motivo ? `Devolvida para ajuste: ${motivo}` : "Devolvida para ajuste." });
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
        mensagem: motivo ? `${quem} devolveu a tarefa para ajuste: ${motivo}` : `${quem} devolveu a tarefa para ajuste.`,
        link: `/tarefas/${task.id}`,
      }),
    );
  }

  return NextResponse.json({ task });
}
