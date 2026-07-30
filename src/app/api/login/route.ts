import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, REMEMBER_MAX_SECONDS, signSession } from "@/lib/auth";
import { validateCredentials } from "@/lib/users/authenticate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email, password, lembrar } = (await req.json()) as {
    email?: string;
    password?: string;
    /** "Continuar conectado": sessão de 30 dias em vez de 12h. */
    lembrar?: boolean;
  };
  const user = await validateCredentials(email ?? "", password ?? "");
  if (!user) {
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  // Troca de senha pendente nunca vira sessão longa: o vínculo com a senha
  // atual (provisória) morre assim que ela for trocada, de qualquer forma.
  const manterConectado = Boolean(lembrar) && !user.mustChangePassword;

  const token = await signSession(
    { email: user.email, name: user.name, passwordHash: user.passwordHash },
    { lembrar: manterConectado },
  );
  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: manterConectado ? REMEMBER_MAX_SECONDS : SESSION_TTL_SECONDS,
  });
  return res;
}
