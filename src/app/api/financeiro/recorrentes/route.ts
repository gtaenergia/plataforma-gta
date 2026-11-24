import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { autoria, jsonSemCache, lerCorpo, resumoDe, semVazios } from "@/lib/financeiro/rotas";
import { getFinanceiroStore, novoId } from "@/lib/financeiro/store";
import { recorrenteSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

/** Cria uma regra mensal (gera um lançamento por mês, de `ini` até `fim`). */
export async function POST(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const corpo = await lerCorpo(req, recorrenteSchema);
  if ("error" in corpo) return corpo.error;

  const id = novoId();
  const doc = semVazios({ ...corpo.dados, nat: "fixo", ...autoria(auth.me) });
  await auditar(auth.me, req, { acao: "rec.criar", alvo: id, resumo: resumoDe(doc), antes: undefined, depois: doc });
  await getFinanceiroStore().put("rec", id, doc, auth.me.email);
  return jsonSemCache({ id, recorrente: { id, ...doc } }, { status: 201 });
}
