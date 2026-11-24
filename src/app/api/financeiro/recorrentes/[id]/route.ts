import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { autoria, idValido, jsonSemCache, lerCorpo, resumoDe, semVazios } from "@/lib/financeiro/rotas";
import { getFinanceiroStore } from "@/lib/financeiro/store";
import { recorrenteSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const naoEncontrado = () => jsonSemCache({ error: "Recorrente não encontrado." }, { status: 404 });

/** Altera a regra: muda todos os meses que ainda não foram pagos nem editados à parte. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!idValido(id)) return naoEncontrado();
  const corpo = await lerCorpo(req, recorrenteSchema);
  if ("error" in corpo) return corpo.error;

  const store = getFinanceiroStore();
  const atual = await store.get("rec", id);
  if (!atual) return naoEncontrado();
  const doc = semVazios({ ...corpo.dados, nat: "fixo", ...autoria(auth.me) });
  await auditar(auth.me, req, { acao: "rec.editar", alvo: id, resumo: resumoDe(doc), antes: atual, depois: doc });
  await store.put("rec", id, doc, auth.me.email);
  return jsonSemCache({ recorrente: { id, ...doc } });
}

/**
 * Exclui a regra. Os meses já pagos continuam: eles são lançamentos próprios
 * (gravados ao marcar como pago), não ocorrências da regra.
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!idValido(id)) return naoEncontrado();
  const store = getFinanceiroStore();
  const atual = await store.get("rec", id);
  if (!atual) return naoEncontrado();
  await auditar(auth.me, req, { acao: "rec.excluir", alvo: id, resumo: resumoDe(atual), antes: atual, depois: undefined });
  await store.remove("rec", id);
  return jsonSemCache({ ok: true });
}
