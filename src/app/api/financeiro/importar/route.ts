import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { alertarSocios } from "@/lib/financeiro/alertas";
import { auditar } from "@/lib/financeiro/auditoria";
import { semVazios } from "@/lib/financeiro/rotas";
import { getFinanceiroStore, type Doc } from "@/lib/financeiro/store";
import { lancamentoSchema, recorrenteSchema } from "@/lib/financeiro/tipos";

export const runtime = "nodejs";

/**
 * Importa os dados do artefato "GTA Controle Financeiro" (o controle que os
 * sócios usavam no chat): lançamentos, recorrentes, saldo conferido e o
 * histórico do extrato.
 *
 * Os ids do artefato são mantidos, então importar o mesmo arquivo duas vezes
 * não duplica nada — o segundo envio só regrava os mesmos documentos. Ou entra
 * tudo, ou nada: um item inválido devolve a lista do que corrigir.
 */

const comId = z.object({ id: z.string().trim().min(1).max(64) });

const arquivoSchema = z.object({
  saldo: z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.number().finite() }).nullish(),
  historico: z
    .object({
      fonte: z.string().max(200).default(""),
      meses: z.array(z.object({ m: z.string().regex(/^\d{4}-\d{2}$/), ent: z.number(), sai: z.number(), fim: z.number() })).max(600),
    })
    .nullish(),
  lanc: z.array(z.record(z.unknown())).max(20000).default([]),
  rec: z.array(z.record(z.unknown())).max(2000).default([]),
});

export async function POST(req: Request) {
  const auth = await requireApiFinanceiro(req);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "O arquivo não é um JSON válido." }, { status: 400 });
  }
  const arq = arquivoSchema.safeParse(body);
  if (!arq.success) return NextResponse.json({ error: "Formato de arquivo não reconhecido.", issues: arq.error.flatten() }, { status: 422 });

  const problemas: string[] = [];
  // Sem autor: no artefato o autor era um id do Claude, sem nome — e "por
  // Importado do artefato" em cada linha da lista era só ruído.
  const origem = {};
  const lanc: Doc[] = [];
  for (const item of arq.data.lanc) {
    const id = comId.safeParse(item);
    const l = lancamentoSchema.safeParse(item);
    if (!id.success || !l.success) {
      problemas.push(`Lançamento ${String(item.id ?? "?")}: ${l.success ? "sem id" : l.error.issues[0]?.message}`);
      continue;
    }
    const ts = typeof item.ts === "number" ? item.ts : Date.now();
    lanc.push({ id: id.data.id, dados: semVazios({ ...l.data, pagoEm: l.data.pago ? l.data.pagoEm ?? l.data.data : undefined, ...origem, ts }) });
  }
  const rec: Doc[] = [];
  for (const item of arq.data.rec) {
    const id = comId.safeParse(item);
    const r = recorrenteSchema.safeParse(item);
    if (!id.success || !r.success) {
      problemas.push(`Recorrente ${String(item.id ?? "?")}: ${r.success ? "sem id" : r.error.issues[0]?.message}`);
      continue;
    }
    const ts = typeof item.ts === "number" ? item.ts : Date.now();
    rec.push({ id: id.data.id, dados: semVazios({ ...r.data, nat: "fixo", ...origem, ts }) });
  }
  if (problemas.length) return NextResponse.json({ error: "Nada foi importado. Corrija o arquivo:", problemas }, { status: 422 });

  const store = getFinanceiroStore();
  // Importar regrava documentos por id: o que existia com o mesmo id vai inteiro para a auditoria.
  const [lancAntes, recAntes] = await Promise.all([store.list("lanc"), store.list("rec")]);
  const idsL = new Set(lanc.map((d) => d.id));
  const idsR = new Set(rec.map((d) => d.id));
  await auditar(auth.me, req, {
    acao: "importar",
    alvo: "importacao",
    resumo: `${lanc.length} lançamentos e ${rec.length} recorrentes${arq.data.saldo ? ", saldo" : ""}${arq.data.historico ? ", histórico" : ""}`,
    antes: {
      lanc: lancAntes.filter((d) => idsL.has(d.id)),
      rec: recAntes.filter((d) => idsR.has(d.id)),
      saldo: arq.data.saldo ? await store.get("config", "saldo") : undefined,
    },
    depois: { lanc, rec, saldo: arq.data.saldo ?? undefined, historico: arq.data.historico ?? undefined },
  });
  await store.putMany("lanc", lanc, auth.me.email);
  await store.putMany("rec", rec, auth.me.email);
  if (arq.data.saldo) await store.put("config", "saldo", { ...arq.data.saldo, ...origem, ts: Date.now() }, auth.me.email);
  if (arq.data.historico) await store.put("config", "historico", arq.data.historico, auth.me.email);

  await alertarSocios(
    "Financeiro: dados importados",
    `${auth.me.name || auth.me.email} importou ${lanc.length} lançamentos e ${rec.length} recorrentes para o Financeiro. Os valores anteriores estão na auditoria.`,
  );
  return NextResponse.json({
    ok: true,
    importados: { lancamentos: lanc.length, recorrentes: rec.length, saldo: !!arq.data.saldo, historico: !!arq.data.historico },
  });
}
