import { NextResponse } from "next/server";
import { getPropostaStore } from "@/lib/propostas/store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Duplica uma proposta: cria uma cópia em rascunho preservando toda a
 * configuração (`dados`), mas com NOVO nº sequencial de referência e data de
 * emissão de hoje. Serve para recotar um cliente antigo ou montar uma variação
 * sem sobrescrever a proposta original. O criador passa a ser quem duplicou.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;

  const store = getPropostaStore();
  const original = await store.get(id);
  if (!original) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  // Novo nº e data de hoje; o restante da configuração é copiado como está.
  // O configurador reabre a partir de `dados`, então basta ajustar esses campos.
  const proximoSeq = await store.nextSeq(original.serviceKey);
  const hoje = new Date().toISOString().slice(0, 10);
  const dados = { ...(original.dados ?? {}), referenciaSeq: proximoSeq, dataEmissao: hoje };

  const copia = await store.create({
    serviceKey: original.serviceKey,
    cliente: original.cliente,
    referencia: "", // o store gera a referência nova a partir de dados.referenciaSeq
    status: "rascunho",
    manual: original.manual,
    dados,
    criadoPor: user.email,
  });
  return NextResponse.json({ proposta: copia }, { status: 201 });
}
