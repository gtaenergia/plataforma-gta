import { NextResponse, after } from "next/server";
import { getTaskStore } from "@/lib/tasks/store";
import { createTaskSchema } from "@/lib/tasks/types";
import { getCurrentUser } from "@/lib/session";
import { notifyTaskAssigned } from "@/lib/email/notifyTask";
import { notificar } from "@/lib/notificacoes/store";
import { avisarSeEstourou } from "@/lib/capacidade/aviso-estouro";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const tasks = await getTaskStore().list();
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Lista ANTES de criar: é o retrato contra o qual se mede se esta tarefa foi
  // a que estourou a semana de alguém.
  const antesDaCriacao = await getTaskStore().list();
  const task = await getTaskStore().create({ ...parsed.data, criadoPor: user.email });
  // Notifica o responsável — in-app sempre; por e-mail se o Resend estiver
  // configurado — após a resposta (best-effort, não bloqueia). Sem sentido
  // notificar quando o criador se atribui a própria tarefa.
  if (task.responsavel && task.responsavel.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    after(() =>
      notificar({
        paraEmail: task.responsavel,
        tipo: "tarefa_atribuida",
        titulo: `Nova tarefa: ${task.titulo}`,
        mensagem: `${user.name || user.email} atribuiu esta tarefa a você${task.cliente ? ` — ${task.cliente}` : ""}.`,
        link: "/tarefas",
      }),
    );
    after(() => notifyTaskAssigned(task));
  }
  after(() => avisarSeEstourou(task, antesDaCriacao));
  return NextResponse.json({ task }, { status: 201 });
}
