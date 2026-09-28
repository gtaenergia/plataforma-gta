import { NextResponse } from "next/server";
import { z } from "zod";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { hojeEmSaoPaulo, proximaOcorrencia } from "@/lib/crm/repeticao";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { TIPO_TAREFA_LABEL, type TarefaCrm } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  concluida: z.boolean(),
  /** Quem fez o contato (e-mail). Vazio = quem está registrando. */
  feitoPor: z.string().trim().max(200).default(""),
  comentario: z.string().trim().max(2000).default(""),
  /**
   * Data do próximo contato. Ausente = a da repetição, se houver; "" = não
   * agendar outro. É o campo que a tela mostra já preenchido com a data
   * calculada, para a pessoa confirmar ou mudar.
   */
  proximaData: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data do próximo contato inválida")
    .or(z.literal(""))
    .optional(),
  /** A próxima ocorrência (se houver) nasce sem repetição: a série para aqui. */
  encerrarRepeticao: z.boolean().default(false),
});

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Concluir (ou reabrir) a tarefa, com registro no histórico da negociação.
 *
 * Concluir é registrar o contato: quem fez, o que aconteceu e, quando o
 * compromisso se repete, quando é o próximo. A próxima ocorrência nasce aqui,
 * no servidor, para valer igual em qualquer tela que conclua — o quadro da
 * agenda, a lista de tarefas ou a caixinha na ficha da negociação.
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const pedido = parsed.data;

  const store = getTarefaCrmStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
  if (atual.concluida === pedido.concluida) return NextResponse.json({ tarefa: atual, proxima: null });

  const negociacoes = getNegociacaoStore();
  const negociacao = atual.negociacaoId ? await negociacoes.get(atual.negociacaoId) : null;
  const autorNome = user.name || user.email;

  if (!pedido.concluida) {
    /*
     * Reabrir desfaz a conclusão — inclusive a próxima ocorrência que ela
     * gerou, se ninguém mexeu nela. Sem isso, um clique errado no "concluir"
     * deixaria um compromisso fantasma na agenda. Se a próxima já foi mexida
     * (adiada, reatribuída), ela é de alguém agora: fica, e o vínculo também,
     * para concluir de novo não gerar uma segunda.
     */
    const sucessora = atual.proximaId ? await store.get(atual.proximaId) : null;
    const intocada = !!sucessora && !sucessora.concluida && sucessora.atualizadoEm === sucessora.criadoEm;
    if (intocada) await store.remove(sucessora.id);

    const tarefa = await store.update(id, {
      concluida: false,
      concluidaEm: "",
      concluidaPor: "",
      concluidaPorNome: "",
      comentario: "",
      proximaId: sucessora && !intocada ? atual.proximaId : "",
    });
    if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

    if (negociacao) {
      await negociacoes.appendAnotacao(
        negociacao.id,
        novaAnotacao({
          tipo: "sistema",
          texto: `Tarefa reaberta — ${TIPO_TAREFA_LABEL[tarefa.tipo]}: ${tarefa.assunto}.`,
          autor: user.email,
          autorNome,
        }),
      );
    }
    return NextResponse.json({ tarefa, proxima: null });
  }

  // Quem fez vem do cadastro, e não do corpo: o nome gravado é o que a agenda
  // vai mostrar em "último follow-up por".
  const feitoPor = pedido.feitoPor || user.email;
  const doCadastro = feitoPor.toLowerCase() === user.email.toLowerCase() ? null : await (await users()).getByEmail(feitoPor);
  const feitoPorNome = feitoPor.toLowerCase() === user.email.toLowerCase() ? autorNome : doCadastro?.name || feitoPor;

  const repete = atual.repetirCada > 0 && !!atual.repetirUnidade && !pedido.encerrarRepeticao;
  const dataProxima =
    pedido.proximaData !== undefined
      ? pedido.proximaData
      : repete && atual.repetirUnidade
        ? proximaOcorrencia(atual.data, atual.repetirCada, atual.repetirUnidade, hojeEmSaoPaulo())
        : "";

  // Reaberta e concluída de novo, com a próxima já mexida por alguém: ela
  // continua valendo, e não se gera outra.
  const jaGerada = atual.proximaId ? await store.get(atual.proximaId) : null;

  let proxima: TarefaCrm | null = null;
  let aviso = "";
  if (dataProxima && !jaGerada) {
    /*
     * Negociação fechada no mesmo contato (a pessoa marcou "ganha" ao
     * concluir): o relacionamento continua, a negociação não. O próximo
     * contato segue preso só ao cliente — é o pós-venda.
     */
    const negociacaoSegue = !!negociacao && (negociacao.situacao === "aberta" || negociacao.situacao === "pausada");
    const clienteId = atual.clienteId || negociacao?.empresaId || "";
    const clienteNome = atual.clienteNome || negociacao?.empresaNome || "";
    if (negociacaoSegue || clienteId) {
      proxima = await store.create({
        negociacaoId: negociacaoSegue ? atual.negociacaoId : "",
        negociacaoNome: negociacaoSegue ? atual.negociacaoNome : "",
        clienteId,
        clienteNome,
        tipo: atual.tipo,
        assunto: atual.assunto,
        data: dataProxima,
        hora: atual.hora,
        notas: atual.notas,
        responsavel: atual.responsavel,
        responsavelNome: atual.responsavelNome,
        repetirCada: pedido.encerrarRepeticao ? 0 : atual.repetirCada,
        repetirUnidade: pedido.encerrarRepeticao ? "" : atual.repetirUnidade,
        concluida: false,
        concluidaEm: "",
        concluidaPor: "",
        concluidaPorNome: "",
        comentario: "",
        proximaId: "",
        criadoPor: user.email,
        criadoPorNome: autorNome,
      });
    } else {
      aviso = "A negociação foi fechada e não está ligada a um cliente do cadastro — o próximo contato não foi agendado.";
    }
  }

  const tarefa = await store.update(id, {
    concluida: true,
    concluidaEm: new Date().toISOString(),
    concluidaPor: feitoPor,
    concluidaPorNome: feitoPorNome,
    comentario: pedido.comentario,
    proximaId: proxima?.id ?? (jaGerada ? atual.proximaId : ""),
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  if (negociacao) {
    const partes = [`Tarefa concluída — ${TIPO_TAREFA_LABEL[tarefa.tipo]}: ${tarefa.assunto}.`];
    if (feitoPor.toLowerCase() !== user.email.toLowerCase()) partes.push(`Feita por ${feitoPorNome}.`);
    if (pedido.comentario) partes.push(pedido.comentario);
    if (proxima) partes.push(`Próximo contato: ${dataBR(proxima.data)}.`);
    await negociacoes.appendAnotacao(
      negociacao.id,
      novaAnotacao({ tipo: "sistema", texto: partes.join(" "), autor: user.email, autorNome }),
    );
  }

  return NextResponse.json({ tarefa, proxima, ...(aviso ? { aviso } : {}) });
}
