import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";
import { getTrackerStore } from "@/lib/tracker/store";
import { createTimeEntrySchema, startTimeEntrySchema } from "@/lib/tracker/types";

export const runtime = "nodejs";

/**
 * Lista lançamentos no intervalo [desde, ate). Por padrão só os do usuário
 * logado — ver horas de outros exige a permissão `tracker.ver_equipe`
 * (admin sempre passa). `usuario=todos` pede a equipe inteira de uma vez.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde");
  const ate = searchParams.get("ate");
  if (!desde || !ate) return NextResponse.json({ error: "Informe desde e ate." }, { status: 400 });

  const usuarioPedido = searchParams.get("usuario");
  let usuarioEmail: string | undefined = me.email;
  if (usuarioPedido && usuarioPedido !== me.email) {
    if (!(await temPermissao(me, "tracker.ver_equipe"))) {
      return NextResponse.json({ error: "Você não tem permissão para ver horas de outros usuários." }, { status: 403 });
    }
    usuarioEmail = usuarioPedido === "todos" ? undefined : usuarioPedido;
  }

  const entradas = await getTrackerStore().list({ usuarioEmail, desde, ate });
  return NextResponse.json({ entradas });
}

/**
 * Cria um lançamento. Com `fim` no corpo = lançamento manual completo; sem
 * `fim` = inicia um cronômetro (o servidor grava `inicio = agora`).
 * Só pode haver UM cronômetro rodando por usuário — se já houver um, ele é
 * parado automaticamente no exato instante em que este começa (sem lacuna
 * nem sobreposição), o mesmo comportamento do Clockify ao trocar de tarefa.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const ehManual = typeof body === "object" && body !== null && "fim" in body && Boolean((body as { fim?: unknown }).fim);
  const store = getTrackerStore();

  if (ehManual) {
    const parsed = createTimeEntrySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
    }
    const entrada = await store.create({ ...parsed.data, usuarioEmail: me.email });
    return NextResponse.json({ entrada }, { status: 201 });
  }

  const parsed = startTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const agora = new Date().toISOString();

  const rodando = await store.getRodando(me.email);
  if (rodando) await store.update(rodando.id, { fim: agora });

  const entrada = await store.create({ ...parsed.data, usuarioEmail: me.email, inicio: agora });
  return NextResponse.json({ entrada }, { status: 201 });
}
