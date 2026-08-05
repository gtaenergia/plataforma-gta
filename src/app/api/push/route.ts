import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { motivoPushIndisponivel, pushDisponivel } from "@/lib/push/enviar";
import { getPushStore } from "@/lib/push/store";

export const runtime = "nodejs";

/**
 * Inscrição de aparelhos para notificação push.
 *
 * A chave PÚBLICA VAPID sai por aqui em vez de virar `NEXT_PUBLIC_…`: assim
 * ela pode ser trocada sem rebuild, e a mesma resposta já diz se o servidor
 * está configurado — o interruptor em /conta não precisa adivinhar.
 */

const inscricaoSchema = z.object({
  endpoint: z.string().trim().url().max(1000),
  p256dh: z.string().trim().min(1).max(200),
  auth: z.string().trim().min(1).max(200),
  aparelho: z.string().trim().max(120).default(""),
});

const cancelamentoSchema = z.object({ endpoint: z.string().trim().url().max(1000) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const disponivel = pushDisponivel();
  const aparelhos = disponivel ? await getPushStore().contarPara(user.email) : 0;
  return NextResponse.json({
    disponivel,
    chavePublica: disponivel ? (process.env.VAPID_PUBLIC_KEY ?? "").trim() : "",
    aparelhos,
    // A frase exata do que está errado. Sem ela, quem configurou fica
    // procurando às cegas qual das três variáveis tem problema.
    motivo: disponivel ? "" : motivoPushIndisponivel(),
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!pushDisponivel()) {
    return NextResponse.json({ error: "Notificações push não estão configuradas no servidor." }, { status: 503 });
  }

  const parsed = inscricaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Inscrição inválida." }, { status: 400 });

  // O dono vem da SESSÃO, nunca do corpo: senão qualquer autenticado
  // inscreveria o próprio aparelho para receber os avisos de outra pessoa.
  await getPushStore().salvar({ ...parsed.data, email: user.email });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = cancelamentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Endpoint inválido." }, { status: 400 });

  // Só apaga a inscrição da PRÓPRIA pessoa.
  //
  // Antes eu não conferia o dono, argumentando que quem está no aparelho pode
  // desligar o aviso dele. O argumento era fraco: quem entra com outra conta no
  // mesmo navegador já sobrescreve o registro, porque `salvar` é upsert pelo
  // endpoint. Sem essa justificativa, sobrava só o buraco — qualquer
  // autenticado que descobrisse um endpoint desinscrevia o aparelho alheio.
  await getPushStore().removerDoDono(parsed.data.endpoint, user.email);
  return NextResponse.json({ ok: true });
}
