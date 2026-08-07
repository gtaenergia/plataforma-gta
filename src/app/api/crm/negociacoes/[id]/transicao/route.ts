import { NextResponse } from "next/server";
import { z } from "zod";
import { getMotivoPerdaStore } from "@/lib/crm/catalogo-store";
import { podeTransicionar, type AcaoNegociacao } from "@/lib/crm/machine";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { SITUACAO_LABEL } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const transicaoSchema = z.object({
  acao: z.enum(["pausar", "retomar", "ganhar", "perder", "reabrir"]),
  motivoPerdaId: z.string().trim().optional(),
});

/**
 * Única porta de mudança de situação — o PATCH não aceita `situacao` de
 * propósito. Aqui a máquina valida o caminho, a perda exige o motivo (regra
 * do RD) e o fechamento entra no histórico imutável.
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
  const parsed = transicaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const acao: AcaoNegociacao = parsed.data.acao;

  const store = getNegociacaoStore();
  const atual = await store.get(id);
  if (!atual) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });

  const transicao = podeTransicionar(atual.situacao, acao);
  if (!transicao.ok) return NextResponse.json({ error: transicao.erro }, { status: 409 });

  // Perder sem dizer por quê deixaria o relatório de motivos vazio — o RD
  // pergunta o motivo no ato, e aqui também.
  let motivoPerdaId = "";
  let motivoPerdaNome = "";
  if (acao === "perder") {
    if (!parsed.data.motivoPerdaId) {
      return NextResponse.json({ error: "Informe o motivo da perda." }, { status: 422 });
    }
    const motivo = await getMotivoPerdaStore().get(parsed.data.motivoPerdaId);
    if (!motivo) return NextResponse.json({ error: "Motivo de perda não encontrado." }, { status: 422 });
    motivoPerdaId = motivo.id;
    motivoPerdaNome = motivo.nome;
  }

  const agora = new Date().toISOString();
  const fechando = transicao.destino === "ganha" || transicao.destino === "perdida";
  const negociacao = await store.update(id, {
    situacao: transicao.destino,
    motivoPerdaId,
    motivoPerdaNome,
    fechadoEm: fechando ? agora : "",
    fechadoPor: fechando ? user.email : "",
  });
  if (!negociacao) return NextResponse.json({ error: "Negociação não encontrada." }, { status: 404 });

  const texto =
    acao === "perder"
      ? `Marcada como perdida — motivo: ${motivoPerdaNome}.`
      : `Situação alterada para "${SITUACAO_LABEL[transicao.destino]}".`;
  const final =
    (await store.appendAnotacao(id, novaAnotacao({
      tipo: "sistema",
      texto,
      autor: user.email,
      autorNome: user.name || user.email,
    }))) ?? negociacao;

  return NextResponse.json({ negociacao: final });
}
