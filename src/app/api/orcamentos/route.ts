import { NextResponse } from "next/server";
import { requireApi, requirePermissaoApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { criarOrcamentoSchema } from "@/lib/orcamentos/types";

export const runtime = "nodejs";

/** Lista os orçamentos em aprovação (filtros aplicados no cliente). */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const store = getOrcamentoStore();
  const verFinanceiro = await temPermissao(guard.me, "financeiro.ver");
  return NextResponse.json({ orcamentos: (await store.list()).map((o) => redigirOrcamento(o, verFinanceiro)) });
}

/** Cria um orçamento (entra como rascunho). */
export async function POST(req: Request) {
  const guard = await requirePermissaoApi("orcamentos.criar");
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarOrcamentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const me = guard.me;
  const store = getOrcamentoStore();
  const novo = await store.create({
    cliente: parsed.data.cliente,
    fonte: parsed.data.fonte,
    estacao: "rascunho",
    serviceKey: parsed.data.serviceKey,
    propostaId: parsed.data.propostaId,
    descricao: parsed.data.descricao,
    valor: parsed.data.valor,
    ficha: parsed.data.ficha,
    expiraEm: null,
    criadoPor: me.email,
    criadoPorNome: me.name || me.email,
  });
  const verFinanceiro = await temPermissao(me, "financeiro.ver");
  return NextResponse.json({ orcamento: redigirOrcamento(novo, verFinanceiro) }, { status: 201 });
}
