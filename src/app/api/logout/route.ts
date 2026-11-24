import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { CADEADO_COOKIE } from "@/lib/financeiro/cadeado";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  // Sair também fecha o cadeado do Financeiro.
  res.cookies.set(CADEADO_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
