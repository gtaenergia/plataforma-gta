import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { criarTarefaCrmSchema, TIPO_TAREFA_LABEL } from "@/lib/crm/types";
import { notificar } from "@/lib/notificacoes/store";
import { getCurrentUser } from "@/lib/session";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const negociacaoId = new URL(req.url).searchParams.get("negociacao");
  const store = getTarefaCrmStore();
  const tarefas = negociacaoId ? await store.listDaNegociacao(negociacaoId) : await store.list();
  return NextResponse.json({ tarefas });
}

/**
 * Agenda um compromisso — preso a uma negociação, ou só ao cliente.
 *
 * Com negociação, o cliente é o dela: aceitar outro faria o mesmo contato
 * contar no histórico de dois clientes. Sem negociação, o cliente tem que
 * existir no cadastro — é ele quem dá nome e contato ao follow-up na agenda.
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
  const parsed = criarTarefaCrmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const dados = parsed.data;

  const negociacao = dados.negociacaoId ? await getNegociacaoStore().get(dados.negociacaoId) : null;
  if (dados.negociacaoId && !negociacao) {
    return NextResponse.json({ error: "Negociação não encontrada." }, { status: 422 });
  }
  // Agendar interação com negócio já fechado é agenda morta — regra do RD:
  // tarefa de negociação só em negociação em andamento. O contato de
  // pós-venda se agenda no cliente, sem negociação.
  if (negociacao && (negociacao.situacao === "ganha" || negociacao.situacao === "perdida")) {
    return NextResponse.json(
      { error: "A negociação já foi fechada — reabra-a, ou agende o follow-up direto no cliente." },
      { status: 409 },
    );
  }
  if (negociacao?.empresaId && dados.clienteId && negociacao.empresaId !== dados.clienteId) {
    return NextResponse.json({ error: "A negociação escolhida é de outro cliente." }, { status: 422 });
  }

  const clienteId = dados.clienteId || negociacao?.empresaId || "";
  const cliente = clienteId ? await getClienteStore().get(clienteId) : null;
  if (!negociacao && !cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 422 });

  /*
   * O nome do responsável vem do cadastro. Antes, e-mail sem nome caía no
   * nome de QUEM AGENDOU: a agenda mostrava "Administrador" num compromisso
   * que era do Beto — e o aviso ia para o Beto, então ninguém via o erro.
   */
  const responsavel = dados.responsavel || user.email;
  const doCadastro = dados.responsavel ? await (await users()).getByEmail(responsavel) : null;
  const responsavelNome = dados.responsavel
    ? doCadastro?.name || dados.responsavelNome || responsavel
    : user.name || user.email;

  const tarefa = await getTarefaCrmStore().create({
    ...dados,
    negociacaoNome: negociacao?.nome ?? "",
    clienteId: cliente?.id ?? "",
    // Cadastro apagado depois de a negociação existir: o nome gravado nela
    // continua contando de quem era (mesma denormalização de `empresaNome`).
    clienteNome: cliente?.nome ?? negociacao?.empresaNome ?? "",
    responsavel,
    responsavelNome,
    concluida: false,
    concluidaEm: "",
    concluidaPor: "",
    concluidaPorNome: "",
    comentario: "",
    proximaId: "",
    criadoPor: user.email,
    criadoPorNome: user.name || user.email,
  });

  // O agendamento entra no histórico da negociação, como no RD.
  if (negociacao) {
    const repete = tarefa.repetirCada > 0 ? ` ${descreverRepeticao(tarefa.repetirCada, tarefa.repetirUnidade)}.` : "";
    await getNegociacaoStore().appendAnotacao(
      negociacao.id,
      novaAnotacao({
        tipo: "sistema",
        texto: `Tarefa agendada — ${TIPO_TAREFA_LABEL[tarefa.tipo]}: ${tarefa.assunto} (${tarefa.data}${tarefa.hora ? ` ${tarefa.hora}` : ""}).${repete}`,
        autor: user.email,
        autorNome: user.name || user.email,
      }),
    );
  }

  // Aviso no sino de quem vai executar — só quando não é quem agendou.
  if (tarefa.responsavel && tarefa.responsavel.toLowerCase() !== user.email.toLowerCase()) {
    await notificar({
      paraEmail: tarefa.responsavel,
      tipo: "crm_tarefa",
      titulo: "Tarefa do CRM para você",
      mensagem: `${user.name || user.email} agendou: ${TIPO_TAREFA_LABEL[tarefa.tipo]} — ${tarefa.assunto}, ${
        negociacao ? `na negociação "${negociacao.nome}"` : `com ${tarefa.clienteNome}`
      }.`,
      link: negociacao ? `/crm/negociacoes/${negociacao.id}` : `/crm/clientes/${tarefa.clienteId}`,
    });
  }

  return NextResponse.json({ tarefa }, { status: 201 });
}
