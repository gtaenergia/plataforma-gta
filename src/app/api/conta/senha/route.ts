import { NextResponse } from "next/server";
import { getCurrentUser, getSessionUser } from "@/lib/session";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth";
import { users } from "@/lib/users/store";
import { changePasswordSchema } from "@/lib/users/types";
import { hashPassword, verifyPassword } from "@/lib/users/password";

export const runtime = "nodejs";

/**
 * Troca a senha do próprio usuário logado.
 * - Troca voluntária: exige a senha atual.
 * - Troca obrigatória (mustChangePassword): dispensa a senha atual (já entrou com ela).
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

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { senhaAtual, novaSenha } = parsed.data;

  if (!me.mustChangePassword) {
    if (!senhaAtual || !verifyPassword(senhaAtual, me.passwordHash)) {
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }
  }

  const store = await users();
  const atualizado = await store.setPassword(me.id, hashPassword(novaSenha), false);

  // Trocar a senha invalida TODAS as sessões (a impressão da senha no token
  // deixa de bater) — inclusive esta. Reemitimos o cookie de quem acabou de
  // trocar, para não se deslogar sozinho; as outras sessões caem, que é o
  // comportamento desejado se a troca foi por suspeita de acesso indevido.
  const res = NextResponse.json({ ok: true });
  if (atualizado) {
    const sessao = await getSessionUser();
    const token = await signSession(
      { email: atualizado.email, name: atualizado.name, passwordHash: atualizado.passwordHash },
      // preserva o teto da sessão atual (não estende a validade na troca)
      { mx: sessao?.mx },
    );
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessao ? Math.max(0, sessao.mx - Math.floor(Date.now() / 1000)) : SESSION_TTL_SECONDS,
    });
  }
  return res;
}
