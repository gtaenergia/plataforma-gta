import { NextResponse, after } from "next/server";
import { getTaskStore } from "@/lib/tasks/store";
import { statusLabel, updateTaskSchema, type Task } from "@/lib/tasks/types";
import { getCurrentUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";
import { notificar } from "@/lib/notificacoes/store";
import { bloqueioDaTransicao, carimbosDaTransicao } from "@/lib/tasks/verificacao";
import { emailsDosVerificadores } from "@/lib/tasks/verificadores";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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

  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const store = getTaskStore();
  const novo = parsed.data.status;
  // A tela manda o status que estava MOSTRANDO quando a pessoa decidiu. Se ele
  // mudou nesse meio-tempo — outro verificador devolveu, o responsável reabriu —,
  // a decisão foi tomada sobre uma tarefa que já não existe: verificar ali
  // anularia em silêncio a devolução de outra pessoa.
  const esperado =
    body && typeof body === "object" && "statusEsperado" in body ? (body as { statusEsperado: unknown }).statusEsperado : undefined;

  // Mudança de status é a única edição com regra: verificar e devolver têm
  // dono. O PATCH sem status — o do formulário de edição — segue como sempre.
  // A regra é medida contra a tarefa GRAVADA, não contra o corpo: assim não se
  // contorna trocando o responsável e o status no mesmo pedido.
  let antes: Task | null = null;
  let carimbos = {};
  if (novo !== undefined) {
    antes = await store.get(id);
    if (!antes) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    if (typeof esperado === "string" && esperado !== antes.status) {
      return NextResponse.json(
        {
          error: `A tarefa mudou desde que esta tela foi aberta: agora está “${statusLabel(antes.status)}”. Confira antes de decidir.`,
          task: antes,
        },
        { status: 409 },
      );
    }
    if (novo !== antes.status) {
      const podeVerificar = await temPermissao(user, "tarefas.verificar");
      const bloqueio = bloqueioDaTransicao(antes, novo, { email: user.email, podeVerificar });
      if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: 403 });
      carimbos = carimbosDaTransicao(antes.status, novo, user.email, new Date().toISOString());
    }
  }

  const task = await store.update(id, { ...parsed.data, ...carimbos });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  // Entregue: avisa quem pode verificar. Sem isso a tarefa fica esperando numa
  // lista que ninguém sabe que precisa olhar.
  if (antes && novo === "entregue" && antes.status !== "entregue") {
    const quem = user.name || user.email;
    after(async () => {
      const para = await emailsDosVerificadores(user.email);
      await Promise.all(
        para.map((email) =>
          notificar({
            paraEmail: email,
            tipo: "tarefa_aguardando_verificacao",
            titulo: `Aguardando verificação: ${task.titulo}`,
            mensagem: `${quem} marcou a tarefa como Concluída${task.cliente ? ` — ${task.cliente}` : ""}.`,
            link: `/tarefas/${task.id}`,
          }),
        ),
      );
    });
  }

  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const ok = await getTaskStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
