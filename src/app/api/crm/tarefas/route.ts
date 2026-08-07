import { NextResponse } from "next/server";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { criarTarefaCrmSchema, TIPO_TAREFA_LABEL } from "@/lib/crm/types";
import { notificar } from "@/lib/notificacoes/store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const negociacaoId = new URL(req.url).searchParams.get("negociacao");
  let tarefas = await getTarefaCrmStore().list();
  if (negociacaoId) tarefas = tarefas.filter((t) => t.negociacaoId === negociacaoId);
  return NextResponse.json({ tarefas });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarTarefaCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const negociacao = await getNegociacaoStore().get(parsed.data.negociacaoId);
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 422 });
  // Agendar interação com negócio já fechado é agenda morta — regra do RD:
  // tarefa só em negociação em andamento.
  if (negociacao.situacao === "ganha" || negociacao.situacao === "perdida") {
    return NextResponse.json({ error: "A negociação já foi fechada — reabra-a para agendar tarefas." }, { status: 409 });
  }

  const tarefa = await getTarefaCrmStore().create({
    ...parsed.data,
    negociacaoNome: negociacao.nome,
    responsavel: parsed.data.responsavel || user.email,
    responsavelNome: parsed.data.responsavelNome || user.name || user.email,
    concluida: false,
    concluidaEm: "",
    criadoPor: user.email,
    criadoPorNome: user.name || user.email,
  });

  // O agendamento entra no histórico da negociação, como no RD.
  await getNegociacaoStore().appendAnotacao(
    negociacao.id,
    novaAnotacao({
      tipo: "sistema",
      texto: `Tarefa agendada — ${TIPO_TAREFA_LABEL[tarefa.tipo]}: ${tarefa.assunto} (${tarefa.data}${tarefa.hora ? ` ${tarefa.hora}` : ""}).`,
      autor: user.email,
      autorNome: user.name || user.email,
    }),
  );

  // Aviso no sino de quem vai executar — só quando não é quem agendou.
  if (tarefa.responsavel && tarefa.responsavel.toLowerCase() !== user.email.toLowerCase()) {
    await notificar({
      paraEmail: tarefa.responsavel,
      tipo: "crm_tarefa",
      titulo: "Tarefa do CRM para você",
      mensagem: `${user.name || user.email} agendou: ${TIPO_TAREFA_LABEL[tarefa.tipo]} — ${tarefa.assunto}, na negociação "${negociacao.nome}".`,
      link: `/crm/negociacoes/${negociacao.id}`,
    });
  }

  return NextResponse.json({ tarefa }, { status: 201 });
}
