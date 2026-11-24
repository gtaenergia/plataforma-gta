import { requireApiFinanceiro, temAcessoFinanceiro } from "@/lib/financeiro/acesso";
import { receitasDoCrm } from "@/lib/financeiro/crm";
import { hojeBrasilia } from "@/lib/financeiro/datas";
import { jsonSemCache } from "@/lib/financeiro/rotas";
import { carregarFinanceiro } from "@/lib/financeiro/store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tudo que as telas do Financeiro precisam, numa resposta só: lançamentos,
 * recorrentes, saldo conferido, histórico do banco, configuração do DRE, as
 * negociações ganhas no CRM e quem tem acesso. São poucas centenas de
 * documentos — o cálculo (projeção e DRE) roda no navegador, como no artefato.
 *
 * Exige o cadeado aberto, e a resposta nunca vai para cache.
 */
export async function GET(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;

  const [dados, negociacoes, todos] = await Promise.all([carregarFinanceiro(), getNegociacaoStore().list(), (await users()).list()]);
  return jsonSemCache({
    ...dados,
    crm: receitasDoCrm(negociacoes),
    hoje: hojeBrasilia(),
    acesso: todos.filter((u) => temAcessoFinanceiro(u)).map((u) => u.name || u.email),
    souAdmin: auth.me.role === "admin",
  });
}
