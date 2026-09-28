import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { users, type UserPatch } from "@/lib/users/store";
import { updateUserSchema, toPublicUser } from "@/lib/users/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  if (me.role !== "admin") return { error: NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 }) };
  return { me };
}

/** Edita nome, papel ou ativação. Protege o último admin e a auto-remoção de privilégio. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { me, error } = await requireAdmin();
  if (error) return error;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = await users();
  const alvo = await store.getById(id);
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // Não permitir remover o próprio status de admin nem desativar a si mesmo
  if (me!.id === id && (parsed.data.role === "member" || parsed.data.active === false)) {
    return NextResponse.json({ error: "Você não pode remover o próprio acesso de administrador." }, { status: 400 });
  }

  // Não deixar a plataforma sem nenhum admin ativo
  if ((parsed.data.role === "member" || parsed.data.active === false) && alvo.role === "admin") {
    const adminsAtivos = (await store.list()).filter((u) => u.role === "admin" && u.active);
    if (adminsAtivos.length <= 1) {
      return NextResponse.json({ error: "Deve haver ao menos um administrador ativo." }, { status: 400 });
    }
  }

  // Repassa só o que veio: undefined = não altera; cargoId null = limpar o cargo.
  const patch: UserPatch = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.cargoId !== undefined) patch.cargoId = parsed.data.cargoId;
  if (parsed.data.comercial !== undefined) patch.comercial = parsed.data.comercial;

  const atualizado = await store.update(id, patch);
  return NextResponse.json({ user: atualizado ? toPublicUser(atualizado) : null });
}

/** Remove um usuário (não permite remover a si mesmo nem o último admin). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { me, error } = await requireAdmin();
  if (error) return error;
  const { id } = await ctx.params;

  if (me!.id === id) {
    return NextResponse.json({ error: "Você não pode remover a própria conta." }, { status: 400 });
  }

  const store = await users();
  const alvo = await store.getById(id);
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  if (alvo.role === "admin") {
    const adminsAtivos = (await store.list()).filter((u) => u.role === "admin" && u.active);
    if (adminsAtivos.length <= 1) {
      return NextResponse.json({ error: "Deve haver ao menos um administrador ativo." }, { status: 400 });
    }
  }

  await store.remove(id);
  return NextResponse.json({ ok: true });
}
