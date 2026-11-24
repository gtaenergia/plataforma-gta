import { NextResponse } from "next/server";
import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { auditar } from "@/lib/financeiro/auditoria";
import { receitasDoCrm } from "@/lib/financeiro/crm";
import { hojeBrasilia } from "@/lib/financeiro/datas";
import { eventos } from "@/lib/financeiro/motor";
import { autoria, lerCorpo, semVazios } from "@/lib/financeiro/rotas";
import { carregarFinanceiro, getFinanceiroStore, novoId, type Doc } from "@/lib/financeiro/store";
import { saldoSchema } from "@/lib/financeiro/tipos";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";

export const runtime = "nodejs";

/**
 * "Conferir saldo com o banco": grava o saldo real no fim de um dia e marca
 * como pago/recebido o que já passou pela conta até ali — o que o artefato
 * fazia numa tacada só. Sem essa marcação, a conta seria descontada duas
 * vezes: uma no saldo do banco, outra como "em aberto".
 *
 * Os ids podem ser de ocorrência de recorrente ("rec|AAAA-MM") ou do "falta
 * receber" de uma negociação ("crm|id"): nos dois casos nasce um lançamento
 * pago no lugar.
 */
export async function PUT(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;
  const corpo = await lerCorpo(req, saldoSchema);
  if ("error" in corpo) return corpo.error;

  const { data, valor, pagos } = corpo.dados;
  const hoje = hojeBrasilia();
  if (data > hoje) return NextResponse.json({ error: "A data do saldo não pode ser no futuro." }, { status: 422 });

  const store = getFinanceiroStore();
  const carimbo = autoria(auth.me);
  const novoSaldo = { data, valor: Math.round(valor * 100) / 100, ...carimbo };
  const docs: Doc[] = [];
  if (pagos.length) {
    const [dados, negociacoes] = await Promise.all([carregarFinanceiro(store), getNegociacaoStore().list()]);
    const evs = eventos({ ...dados, crm: receitasDoCrm(negociacoes), prazoCrmDias: dados.config.prazoCrmDias }, hoje);
    const porId = new Map(evs.map((e) => [e.id, e]));
    for (const id of new Set(pagos)) {
      const e = porId.get(id);
      if (!e || e.pago) continue;
      if (e.virt) {
        docs.push({
          id: novoId(),
          dados: semVazios({
            k: e.k,
            desc: e.desc,
            valor: e.valor,
            data: e.data,
            nat: e.nat,
            cat: e.cat,
            quem: e.quem,
            proj: e.proj,
            rec: e.rec,
            mes: e.mes,
            negociacaoId: e.negociacaoId,
            dre: e.dre,
            pago: true,
            pagoEm: e.data,
            ...carimbo,
          }),
        });
      } else {
        const atual = dados.lanc.find((l) => l.id === id);
        if (atual) docs.push({ id, dados: semVazios({ ...atual, id: undefined, pago: true, pagoEm: e.data, ...carimbo }) });
      }
    }
  }

  await auditar(auth.me, req, {
    acao: "saldo.conferir",
    alvo: "config/saldo",
    resumo: `Saldo de ${data}: ${novoSaldo.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${docs.length ? ` · ${docs.length} conta(s) marcadas como pagas` : ""}`,
    antes: await store.get("config", "saldo"),
    depois: { saldo: novoSaldo, pagos: docs },
  });
  await store.putMany("lanc", docs, auth.me.email);
  await store.put("config", "saldo", novoSaldo, auth.me.email);
  return NextResponse.json({ ok: true });
}
