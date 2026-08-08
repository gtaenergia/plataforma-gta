import { NextResponse } from "next/server";
import { z } from "zod";
import { getPropostaStore } from "@/lib/propostas/store";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/services/registry";
import { getTaskStore } from "@/lib/tasks/store";

export const runtime = "nodejs";

const schema = z.object({ tarefaId: z.string().trim().min(1) });

/**
 * O técnico aceita o pedido: cria a proposta JÁ VINCULADA e devolve para onde ir.
 *
 * A proposta nasce vazia, só com o elo em `dados.negociacaoId` — daí em diante
 * o configurador a carrega por `?proposta=<id>` como qualquer rascunho seu, e
 * o PATCH de propostas preserva o vínculo a cada salvamento.
 *
 * É o que evita mexer nos 13 configuradores: eles continuam sem saber que o CRM
 * existe.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 422 });

  const tarefa = await getTaskStore().get(parsed.data.tarefaId);
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  if (!tarefa.negociacaoId) {
    return NextResponse.json({ error: "Esta tarefa não veio de uma negociação." }, { status: 409 });
  }
  const servico = getService(tarefa.serviceKey);
  if (!servico) {
    return NextResponse.json(
      { error: "A tarefa não indica o serviço — abra o configurador pelo menu Nova proposta." },
      { status: 409 },
    );
  }

  const proposta = await getPropostaStore().create({
    serviceKey: servico.key,
    cliente: tarefa.cliente,
    referencia: "",
    status: "rascunho",
    manual: false,
    dados: { negociacaoId: tarefa.negociacaoId, clienteNome: tarefa.cliente },
    criadoPor: user.email,
  });

  return NextResponse.json({ destino: `/nova/${servico.key}?proposta=${proposta.id}` }, { status: 201 });
}
