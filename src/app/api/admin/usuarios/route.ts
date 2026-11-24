import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { users, EmailEmUsoError } from "@/lib/users/store";
import { createUserSchema, toPublicUser } from "@/lib/users/types";
import { hashPassword, gerarSenhaProvisoria } from "@/lib/users/password";
import { decidirMudancaDeAcesso } from "@/lib/financeiro/acesso-regras";
import { alertarSocios } from "@/lib/financeiro/alertas";
import { auditar, auditarSemFalhar } from "@/lib/financeiro/auditoria";

export const runtime = "nodejs";

async function requireAdminApi() {
  const me = await getCurrentUser();
  if (!me) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  if (me.role !== "admin") return { error: NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 }) };
  return { me };
}

/** Lista todos os usuários (dados públicos, sem hash). */
export async function GET() {
  const { error } = await requireAdminApi();
  if (error) return error;
  const store = await users();
  const lista = (await store.list()).map(toPublicUser);
  return NextResponse.json({ usuarios: lista });
}

/** Cria um usuário com senha provisória e troca obrigatória no 1º acesso. */
export async function POST(req: Request) {
  const { me, error } = await requireAdminApi();
  if (error) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const senhaProvisoria = parsed.data.senhaProvisoria?.trim() || gerarSenhaProvisoria();
  const store = await users();
  // Criar alguém JÁ com acesso ao Financeiro é dar acesso: mesma regra.
  if (parsed.data.financeiro) {
    const decisao = decidirMudancaDeAcesso(me!, await store.list(), null, "conceder");
    if (!decisao.ok) {
      await auditarSemFalhar(me!, req, { acao: "acesso.negado", alvo: parsed.data.email, resumo: `criar com acesso · ${parsed.data.name}`, antes: undefined, depois: undefined });
      return NextResponse.json({ error: decisao.erro }, { status: 403 });
    }
    await auditar(me!, req, { acao: "acesso.concedido", alvo: parsed.data.email, resumo: `criou ${parsed.data.name} já com acesso`, antes: undefined, depois: { financeiro: true } });
  }
  try {
    const novo = await store.create({
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      cargoId: parsed.data.cargoId,
      comercial: parsed.data.comercial,
      financeiro: parsed.data.financeiro,
      passwordHash: hashPassword(senhaProvisoria),
      mustChangePassword: true,
      active: true,
    });
    if (parsed.data.financeiro) {
      await alertarSocios("Financeiro: novo acesso", `${me!.name || me!.email} criou a conta de ${novo.name} já com acesso ao Financeiro.`);
    }
    // Retorna a senha provisória UMA vez, para o admin entregar ao usuário.
    return NextResponse.json({ user: toPublicUser(novo), senhaProvisoria }, { status: 201 });
  } catch (e) {
    if (e instanceof EmailEmUsoError) {
      return NextResponse.json({ error: "Já existe um usuário com este e-mail." }, { status: 409 });
    }
    throw e;
  }
}
