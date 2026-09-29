import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import { contadoresDeFollowUp } from "@/lib/crm/followups";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * O contador de follow-ups de cada cliente e de cada negociação — o número
 * que o funil e a lista de clientes mostram em cada linha, sem o navegador
 * precisar receber as tarefas inteiras para contar.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const [tarefas, negociacoes, clientes] = await Promise.all([
    getTarefaCrmStore().list(),
    getNegociacaoStore().list(),
    getClienteStore().list(),
  ]);
  return NextResponse.json(
    contadoresDeFollowUp({ tarefas, negociacoes, clientes: clientes.map((c) => ({ id: c.id, nome: c.nome })) }),
  );
}
