import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { users } from "@/lib/users/store";
import { resetPasswordSchema } from "@/lib/users/types";
import { hashPassword, gerarSenhaProvisoria } from "@/lib/users/password";
import { decidirMudancaDeAcesso } from "@/lib/financeiro/acesso-regras";
import { alertarSocios } from "@/lib/financeiro/alertas";
import { auditar, auditarSemFalhar } from "@/lib/financeiro/auditoria";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Admin reseta a senha de um usuário: gera provisória e força troca no próximo acesso. */
export async function POST(req: Request, ctx: Ctx) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 });

  const { id } = await ctx.params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // corpo vazio é aceito (gera senha automática)
  }
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = await users();
  const alvo = await store.getById(id);
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  // Redefinir a senha de quem tem acesso ao Financeiro é o jeito de entrar
  // como essa pessoa: só quem já tem acesso pode, e todos ficam sabendo.
  if (alvo.financeiro === true) {
    const decisao = decidirMudancaDeAcesso(me, await store.list(), alvo, "senha");
    if (!decisao.ok) {
      await auditarSemFalhar(me, req, { acao: "acesso.negado", alvo: alvo.email, resumo: `redefinir senha · ${alvo.name}`, antes: undefined, depois: undefined });
      return NextResponse.json({ error: decisao.erro }, { status: 403 });
    }
    await auditar(me, req, { acao: "senha.redefinida", alvo: alvo.email, resumo: `redefiniu a senha de ${alvo.name}`, antes: undefined, depois: undefined });
  }

  const senhaProvisoria = parsed.data.novaSenha?.trim() || gerarSenhaProvisoria();
  await store.setPassword(id, hashPassword(senhaProvisoria), true);
  if (alvo.financeiro === true) {
    await alertarSocios(
      "Financeiro: senha redefinida",
      `${me.name || me.email} redefiniu a senha de ${alvo.name}, que tem acesso ao Financeiro. Se ${alvo.name} não pediu, verifique.`,
      [alvo.email],
    );
  }
  return NextResponse.json({ ok: true, senhaProvisoria });
}
