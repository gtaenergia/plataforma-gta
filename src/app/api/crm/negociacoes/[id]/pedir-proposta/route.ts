import { NextResponse, after } from "next/server";
import { z } from "zod";
import { notifyTaskAssigned } from "@/lib/email/notifyTask";
import { avisarSeEstourou } from "@/lib/capacidade/aviso-estouro";
import { descricaoDoPedido, tituloDoPedido } from "@/lib/crm/elo";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { valorDaNegociacao } from "@/lib/crm/types";
import { notificar } from "@/lib/notificacoes/store";
import { getCurrentUser } from "@/lib/session";
import { getService } from "@/services/registry";
import { getTaskStore } from "@/lib/tasks/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const pedidoSchema = z.object({
  serviceKey: z.string().trim().max(60).default(""),
  responsavel: z.string().trim().min(1, "Escolha quem vai montar a proposta"),
  prazo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .or(z.literal(""))
    .default(""),
  estimativaMin: z.coerce.number().int().min(0).max(400 * 60).default(0),
  tipoDemanda: z.string().trim().max(120).default(""),
  prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
  observacao: z.string().trim().max(2000).default(""),
});

/**
 * O comercial pede a proposta; a tarefa nasce em OPERAÇÕES.
 *
 * A tarefa vai com `demandante: "comercial"` e categoria "Orçamentos" — os dois
 * já existiam na plataforma esperando exatamente por isto — e carrega
 * `negociacaoId`, que é o fio pelo qual o valor volta depois.
 *
 * O que quem recebe precisa saber viaja na descrição: ele não abre o CRM.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = pedidoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = getNegociacaoStore();
  const negociacao = await store.get(id);
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });
  // Pedir proposta para negócio já fechado é trabalho que ninguém vai usar.
  if (negociacao.situacao === "ganha" || negociacao.situacao === "perdida") {
    return NextResponse.json({ error: "A negociação já foi fechada — reabra-a para pedir proposta." }, { status: 409 });
  }

  const servico = parsed.data.serviceKey ? getService(parsed.data.serviceKey) : undefined;
  const solicitante = user.name || user.email;

  // Retrato ANTES de criar: é contra ele que se mede se este pedido estourou a
  // semana de quem vai montar. Mesmo caminho de /api/tarefas.
  const antesDaCriacao = await getTaskStore().list();
  const tarefa = await getTaskStore().create({
    titulo: tituloDoPedido(servico?.label ?? "", negociacao.empresaNome),
    descricao: descricaoDoPedido({
      negociacaoNome: negociacao.nome,
      empresa: negociacao.empresaNome,
      valorEstimado: valorDaNegociacao(negociacao),
      previsao: negociacao.previsao,
      solicitante,
      observacao: parsed.data.observacao,
    }),
    cliente: negociacao.empresaNome,
    categoria: "Orçamentos",
    tipoDemanda: parsed.data.tipoDemanda,
    demandante: "comercial",
    responsavel: parsed.data.responsavel,
    status: "afazer",
    prioridade: parsed.data.prioridade,
    prazo: "",
    prazoComercial: negociacao.previsao,
    prazoOperacional: parsed.data.prazo,
    horaComercial: "",
    horaOperacional: "",
    estimativaMin: parsed.data.estimativaMin,
    negociacaoId: negociacao.id,
    serviceKey: parsed.data.serviceKey,
    criadoPor: user.email,
  });

  const atualizada =
    (await store.appendAnotacao(
      id,
      novaAnotacao({
        tipo: "sistema",
        texto:
          `Proposta pedida a ${parsed.data.responsavel}${servico ? ` — ${servico.label}` : ""}` +
          `${parsed.data.prazo ? `, para ${parsed.data.prazo}` : ""}.`,
        autor: user.email,
        autorNome: solicitante,
      }),
    )) ?? negociacao;

  /*
   * O pedido usa o MESMO caminho de aviso de uma tarefa comum.
   *
   * Antes só tocava o sino. Quem estivesse de licença, ou simplesmente não
   * abrisse a plataforma naquele dia, nunca sabia — e do outro lado o comercial
   * via "Em Operações" e esperava. O e-mail e o alerta de capacidade estourada
   * já existem; faltava usá-los.
   */
  if (tarefa.responsavel && tarefa.responsavel.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    after(() =>
      notificar({
        paraEmail: tarefa.responsavel,
        tipo: "crm_pedido_proposta",
        titulo: "Pedido de proposta do comercial",
        mensagem: `${solicitante} pediu a proposta de "${negociacao.nome}"${negociacao.empresaNome ? ` (${negociacao.empresaNome})` : ""}.`,
        link: `/tarefas/${tarefa.id}`,
      }),
    );
    after(() => notifyTaskAssigned(tarefa));
  }
  after(() => avisarSeEstourou(tarefa, antesDaCriacao));

  return NextResponse.json({ tarefa, negociacao: atualizada }, { status: 201 });
}
