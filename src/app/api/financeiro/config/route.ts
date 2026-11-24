import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { jsonSemCache, lerCorpo } from "@/lib/financeiro/rotas";
import { getFinanceiroStore } from "@/lib/financeiro/store";
import { configSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

/** Grava a configuração do DRE: categoria → linha, bens que depreciam, prazo do CRM. */
export async function PUT(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const corpo = await lerCorpo(req, configSchema);
  if ("error" in corpo) return corpo.error;
  const store = getFinanceiroStore();
  const antes = await store.get("config", "dre");
  await auditar(auth.me, req, { acao: "config.alterar", alvo: "config/dre", resumo: "DRE, depreciação e prazo do CRM", antes, depois: corpo.dados });
  await store.put("config", "dre", corpo.dados, auth.me.email);
  return jsonSemCache({ config: corpo.dados });
}
