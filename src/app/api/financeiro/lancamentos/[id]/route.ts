import { z } from "zod";
import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { autoria, idValido, jsonSemCache, lerCorpo, resumoDe, semVazios } from "@/lib/financeiro/rotas";
import { getFinanceiroStore } from "@/lib/financeiro/store";
import { lancamentoSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const naoEncontrado = () => jsonSemCache({ error: "Lançamento não encontrado." }, { status: 404 });

/** Substitui o lançamento inteiro (edição pelo formulário). */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!idValido(id)) return naoEncontrado();
  const corpo = await lerCorpo(req, lancamentoSchema);
  if ("error" in corpo) return corpo.error;

  const store = getFinanceiroStore();
  const atual = await store.get("lanc", id);
  if (!atual) return naoEncontrado();

  const d = corpo.dados;
  // O vínculo com o recorrente e com o CRM não se perde numa edição que não o mencione.
  const doc = semVazios({
    ...d,
    rec: d.rec ?? (atual.rec as string | undefined),
    mes: d.mes ?? (atual.mes as string | undefined),
    negociacaoId: d.negociacaoId ?? (atual.negociacaoId as string | undefined),
    pagoEm: d.pago ? d.pagoEm ?? d.data : undefined,
    ...autoria(auth.me),
  });
  await auditar(auth.me, req, { acao: "lanc.editar", alvo: id, resumo: resumoDe(doc), antes: atual, depois: doc });
  await store.put("lanc", id, doc, auth.me.email);
  return jsonSemCache({ lancamento: { id, ...doc } });
}

const pagoSchema = z.object({
  pago: z.boolean(),
  pagoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Marca como pago/recebido, ou desfaz. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!idValido(id)) return naoEncontrado();
  const corpo = await lerCorpo(req, pagoSchema);
  if ("error" in corpo) return corpo.error;

  const store = getFinanceiroStore();
  const atual = await store.get("lanc", id);
  if (!atual) return naoEncontrado();

  const { pago, pagoEm } = corpo.dados;
  const doc = semVazios({ ...atual, pago, pagoEm: pago ? pagoEm ?? (atual.data as string) : undefined, ...autoria(auth.me) });
  await auditar(auth.me, req, { acao: pago ? "lanc.pagar" : "lanc.desfazer", alvo: id, resumo: resumoDe(doc), antes: atual, depois: doc });
  await store.put("lanc", id, doc, auth.me.email);
  return jsonSemCache({ lancamento: { id, ...doc } });
}

/** Exclui. O documento inteiro fica na auditoria (`antes`) — dá para reconstituir. */
export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  if (!idValido(id)) return naoEncontrado();
  const store = getFinanceiroStore();
  const atual = await store.get("lanc", id);
  if (!atual) return naoEncontrado();
  await auditar(auth.me, req, { acao: "lanc.excluir", alvo: id, resumo: resumoDe(atual), antes: atual, depois: undefined });
  await store.remove("lanc", id);
  return jsonSemCache({ ok: true });
}
