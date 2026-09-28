import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { equipeComercial } from "@/lib/users/equipe";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";

/**
 * Lista usuários ATIVOS (email + nome) — usado no seletor de responsáveis.
 *
 * `?equipe=comercial` devolve só quem está marcado como comercial: é a lista
 * dos seletores do CRM. Operações continua pedindo sem o parâmetro, porque ali
 * o responsável é quem executa — e o pedido de proposta feito DE DENTRO do CRM
 * também, pelo mesmo motivo.
 */
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const store = await users();
  const todos = await store.list();

  if (new URL(req.url).searchParams.get("equipe") === "comercial") {
    const equipe = equipeComercial(todos);
    return NextResponse.json({ usuarios: equipe.usuarios, equipeMarcada: equipe.marcada });
  }

  const usuarios = todos.filter((u) => u.active).map((u) => ({ email: u.email, name: u.name }));
  return NextResponse.json({ usuarios });
}
