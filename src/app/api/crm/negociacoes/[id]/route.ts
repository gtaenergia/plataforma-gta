import { NextResponse } from "next/server";
import { getFunilStore } from "@/lib/crm/funis-store";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { atualizarNegociacaoSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  const negociacao = await getNegociacaoStore().get(id);
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });
  return NextResponse.json({ negociacao });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = atualizarNegociacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const store = getNegociacaoStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });

  // Mudança de etapa (o arrasto no quadro) valida o destino e entra no
  // histórico — é o "changelog" do RD, gerado pelo sistema.
  let registroDeMovimento: string | null = null;
  if (parsed.data.etapaId && parsed.data.etapaId !== atual.etapaId) {
    const funil = await getFunilStore().get(parsed.data.funilId ?? atual.funilId);
    if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 422 });
    const destino = funil.etapas.find((e) => e.id === parsed.data.etapaId);
    if (!destino) return NextResponse.json({ error: "Etapa não pertence ao funil." }, { status: 422 });
    const origem = funil.etapas.find((e) => e.id === atual.etapaId);
    registroDeMovimento = origem
      ? `Movida de "${origem.nome}" para "${destino.nome}".`
      : `Movida para "${destino.nome}".`;
  }

  const negociacao = await store.update(id, parsed.data);
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });

  const final = registroDeMovimento
    ? (await store.appendAnotacao(id, novaAnotacao({
        tipo: "sistema",
        texto: registroDeMovimento,
        autor: user.email,
        autorNome: user.name || user.email,
      }))) ?? negociacao
    : negociacao;

  return NextResponse.json({ negociacao: final });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const alvo = await getNegociacaoStore().get(id);
  if (!alvo) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });

  /*
   * Excluir apaga o HISTÓRICO junto — e o histórico é o único registro do que
   * foi combinado com o cliente. O resto do módulo trata esse registro como
   * sagrado (anotação não se edita, `update` recusa `anotacoes` por tipo), e
   * havia um DELETE aberto ao lado, para qualquer pessoa autenticada.
   *
   * Numa equipe pequena isso não é má-fé, é acidente: dois cliques na
   * negociação errada. Quem apaga precisa ser dono dela — ou administrador.
   */
  const meu = (e: string) => e.trim().toLowerCase() === user.email.trim().toLowerCase();
  const podeApagar = user.role === "admin" || meu(alvo.responsavel) || meu(alvo.criadoPor);
  if (!podeApagar) {
    return NextResponse.json(
      { error: `Esta negociação é de ${alvo.responsavelNome || alvo.responsavel}. Só o responsável (ou um administrador) pode excluí-la.` },
      { status: 403 },
    );
  }

  const ok = await getNegociacaoStore().remove(id);
  if (!ok) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });
  // Tarefa não se exclui — exceto junto com a negociação dona (regra do RD):
  // sem isso a agenda cobraria compromissos de um negócio que não existe mais.
  await getTarefaCrmStore().removeDaNegociacao(id);
  return NextResponse.json({ ok: true });
}
