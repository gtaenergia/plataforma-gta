import { NextResponse } from "next/server";
import { cobrancasDoDia, textoDaCobranca } from "@/lib/crm/lembretes";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { notificar } from "@/lib/notificacoes/store";
import { users } from "@/lib/users/store";

export const runtime = "nodejs";

/**
 * A cobrança da manhã.
 *
 * Um CRM não se sustenta na tela, e sim na cobrança: a regra que faz o RD
 * Station funcionar é "toda negociação em aberto tem uma próxima tarefa
 * agendada". Sem isto, a tarefa vencia e ficava vermelha esperando alguém
 * abrir a tela — e quem vende passa o dia em campo.
 *
 * A Vercel Cron chama esta rota 1x/dia (ver vercel.json) com
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * UM recado por pessoa, com os dois sinais somados (tarefas atrasadas e
 * negociações sem próximo passo). Dez notificações às 7h ensinam a ignorar o
 * sino; uma, com número e exemplo, faz abrir a tela.
 */
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  // Sem CRON_SECRET: permitido só fora de produção (para testes locais).
  return process.env.NODE_ENV !== "production";
}

async function cobrar(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const [negociacoes, tarefas] = await Promise.all([
    getNegociacaoStore().list(),
    getTarefaCrmStore().list(),
  ]);

  // O dia no fuso de São Paulo: rodando às 6h UTC, `new Date()` no servidor já
  // é o dia seguinte para quem está aqui — e a tarefa de hoje seria cobrada
  // como atrasada.
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const cobrancas = cobrancasDoDia(negociacoes, tarefas, hoje);

  // Quem saiu da empresa não recebe cobrança — e a lista de ativos é a fonte.
  const ativos = new Set(
    (await (await users()).list()).filter((u) => u.active).map((u) => u.email.trim().toLowerCase()),
  );

  let enviados = 0;
  for (const c of cobrancas) {
    if (!ativos.has(c.email.trim().toLowerCase())) continue;
    const { titulo, mensagem } = textoDaCobranca(c);
    // `notificar` é best-effort e nunca lança: uma falha não pode derrubar o
    // cron e deixar o resto da equipe sem aviso.
    await notificar({
      paraEmail: c.email,
      tipo: "crm_cobranca_diaria",
      titulo,
      mensagem,
      link: c.vencidas.length > 0 ? "/crm/tarefas" : "/crm/funil",
    });
    enviados++;
  }

  return NextResponse.json({
    ok: true,
    hoje,
    pessoas: cobrancas.length,
    enviados,
    vencidas: cobrancas.reduce((s, c) => s + c.vencidas.length, 0),
    semProximoPasso: cobrancas.reduce((s, c) => s + c.semProximoPasso.length, 0),
  });
}

export async function GET(req: Request) {
  return cobrar(req);
}
export async function POST(req: Request) {
  return cobrar(req);
}
