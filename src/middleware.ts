import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifySession,
  renewSession,
  precisaRenovar,
  maxAgeRestante,
} from "@/lib/auth";

/**
 * Protege todas as rotas: sem sessão válida, redireciona para /login.
 * Exceções: /login, /api/login e assets estáticos (tratados pelo matcher).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname === "/api/logout" ||
    pathname === "/icon.png" ||
    pathname.startsWith("/api/cron/") || // cron da Vercel (protegido por CRON_SECRET na rota)
    pathname.startsWith("/brand/"); // logo e ícone da marca (acessíveis no login)
  if (isPublic) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Sessão deslizante: com o usuário ativo, empurra a validade para frente —
  // sem nunca passar do teto absoluto gravado no próprio token.
  if (precisaRenovar(session)) {
    res.cookies.set(SESSION_COOKIE, await renewSession(session), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: maxAgeRestante(session),
    });
  }
  return res;
}

export const config = {
  // Roda em tudo, exceto assets do Next e favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
