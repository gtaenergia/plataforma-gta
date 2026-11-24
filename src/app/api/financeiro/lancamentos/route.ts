import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { autoria, jsonSemCache, lerCorpo, resumoDe, semVazios } from "@/lib/financeiro/rotas";
import { getFinanceiroStore, novoId } from "@/lib/financeiro/store";
import { lancamentoSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

/**
 * Cria um lançamento. Também é por aqui que nascem:
 * - a ocorrência de um recorrente paga ou editada só naquele mês (`rec`+`mes`);
 * - o "pular este mês" de um recorrente (`skip`);
 * - o recebimento (ou parcela planejada) de uma negociação ganha no CRM
 *   (`negociacaoId`) — que abate o "falta receber" dela no caixa.
 *
 * A auditoria é gravada ANTES: sem rastro, sem lançamento.
 */
export async function POST(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const corpo = await lerCorpo(req, lancamentoSchema);
  if ("error" in corpo) return corpo.error;

  const d = corpo.dados;
  const id = novoId();
  const doc = semVazios({ ...d, pagoEm: d.pago ? d.pagoEm ?? d.data : undefined, ...autoria(auth.me) });
  await auditar(auth.me, req, {
    acao: d.pago && (d.rec || d.negociacaoId) ? "lanc.pagar" : "lanc.criar",
    alvo: id,
    resumo: (d.skip ? "pulou o mês · " : "") + resumoDe(doc),
    antes: undefined,
    depois: doc,
  });
  await getFinanceiroStore().put("lanc", id, doc, auth.me.email);
  return jsonSemCache({ id, lancamento: { id, ...doc } }, { status: 201 });
}
