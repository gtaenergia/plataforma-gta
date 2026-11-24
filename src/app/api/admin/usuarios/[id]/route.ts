import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { users, type UserPatch } from "@/lib/users/store";
import { updateUserSchema, toPublicUser } from "@/lib/users/types";
import { decidirMudancaDeAcesso, temAcessoFinanceiro } from "@/lib/financeiro/acesso-regras";
import { alertarSocios } from "@/lib/financeiro/alertas";
import { auditar, auditarSemFalhar } from "@/lib/financeiro/auditoria";

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

  // Porta do Financeiro: dar/tirar o acesso, ou desativar/reativar quem o tem,
  // só por quem já tem acesso (ver decidirMudancaDeAcesso).
  const todos = await store.list();
  const querFin = parsed.data.financeiro;
  const mudancaFin =
    querFin !== undefined && querFin !== (alvo.financeiro === true)
      ? querFin
        ? "conceder"
        : "revogar"
      : parsed.data.active === false && temAcessoFinanceiro(alvo)
        ? "desativar"
        : parsed.data.active === true && !alvo.active && alvo.financeiro === true
          ? "conceder"
          : null;
  if (mudancaFin) {
    const decisao = decidirMudancaDeAcesso(me!, todos, alvo, mudancaFin);
    if (!decisao.ok) {
      await auditarSemFalhar(me!, req, { acao: "acesso.negado", alvo: alvo.email, resumo: `${mudancaFin} · ${alvo.name}`, antes: undefined, depois: undefined });
      return NextResponse.json({ error: decisao.erro }, { status: 403 });
    }
    // Rastro antes da mudança: sem auditoria, sem porta aberta.
    await auditar(me!, req, {
      acao: mudancaFin === "conceder" ? "acesso.concedido" : "acesso.revogado",
      alvo: alvo.email,
      resumo: `${mudancaFin === "desativar" ? "desativou a conta de" : mudancaFin === "conceder" ? "acesso para" : "tirou o acesso de"} ${alvo.name}`,
      antes: { financeiro: alvo.financeiro === true, active: alvo.active },
      depois: { financeiro: querFin ?? alvo.financeiro === true, active: parsed.data.active ?? alvo.active },
    });
  }

  // Repassa só o que veio: undefined = não altera; cargoId null = limpar o cargo.
  const patch: UserPatch = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.cargoId !== undefined) patch.cargoId = parsed.data.cargoId;
  if (parsed.data.comercial !== undefined) patch.comercial = parsed.data.comercial;
  if (parsed.data.financeiro !== undefined) patch.financeiro = parsed.data.financeiro;

  const atualizado = await store.update(id, patch);
  if (mudancaFin) {
    const quem = me!.name || me!.email;
    await alertarSocios(
      mudancaFin === "conceder" ? "Financeiro: novo acesso" : "Financeiro: acesso retirado",
      mudancaFin === "conceder"
        ? `${quem} deu acesso ao Financeiro para ${alvo.name}.`
        : mudancaFin === "desativar"
          ? `${quem} desativou a conta de ${alvo.name}, que tinha acesso ao Financeiro.`
          : `${quem} tirou o acesso de ${alvo.name} ao Financeiro.`,
      [alvo.email],
    );
  }
  return NextResponse.json({ user: atualizado ? toPublicUser(atualizado) : null });
}

/** Remove um usuário (não permite remover a si mesmo nem o último admin). */
export async function DELETE(req: Request, ctx: Ctx) {
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

  if (alvo.financeiro === true) {
    const decisao = decidirMudancaDeAcesso(me!, await store.list(), alvo, "excluir");
    if (!decisao.ok) {
      await auditarSemFalhar(me!, req, { acao: "acesso.negado", alvo: alvo.email, resumo: `excluir · ${alvo.name}`, antes: undefined, depois: undefined });
      return NextResponse.json({ error: decisao.erro }, { status: 403 });
    }
    await auditar(me!, req, { acao: "acesso.revogado", alvo: alvo.email, resumo: `excluiu a conta de ${alvo.name}`, antes: toPublicUser(alvo), depois: undefined });
  }

  await store.remove(id);
  if (alvo.financeiro === true) {
    await alertarSocios("Financeiro: conta excluída", `${me!.name || me!.email} excluiu a conta de ${alvo.name}, que tinha acesso ao Financeiro.`);
  }
  return NextResponse.json({ ok: true });
}
