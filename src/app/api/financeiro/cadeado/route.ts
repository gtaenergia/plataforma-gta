import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { passwordFingerprint } from "@/lib/auth";
import { requireApiFinanceiro } from "@/lib/financeiro/acesso";
import { alertarSocios } from "@/lib/financeiro/alertas";
import { auditarSemFalhar } from "@/lib/financeiro/auditoria";
import { CADEADO_COOKIE, emitirCadeado, opcoesCookie } from "@/lib/financeiro/cadeado";
import { FALHAS_LIVRES, bloqueadoAte, falhasVigentes, ipDaRequisicao, segundosRestantes } from "@/lib/login/limite";
import { getLoginLimiteStore, type TentativaLogin } from "@/lib/login/store";
import { verifyPassword } from "@/lib/users/password";

export const runtime = "nodejs";

const corpoSchema = z.object({ senha: z.string().min(1, "Digite sua senha.").max(200) });

/**
 * Abre o cadeado do Financeiro com a senha da conta.
 *
 * Mesmo freio do login (falhas dobram a espera, até 15 min), com contagem
 * PRÓPRIA — por conta e por IP. Na quinta senha errada seguida, todos que
 * têm acesso recebem um alerta: alguém com a sessão de um sócio na mão está
 * tentando adivinhar a senha dele.
 */
export async function POST(req: Request) {
  const auth = await requireApiFinanceiro(req, { cadeado: false });
  if ("error" in auth) return auth.error;
  const { me } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = corpoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Digite sua senha." }, { status: 422 });

  const freio = getLoginLimiteStore();
  const chaves = [`fin:email:${me.email.toLowerCase()}`, `fin:ip:${ipDaRequisicao(req.headers)}`];
  const agora = Date.now();
  let estado = new Map<string, TentativaLogin>();
  try {
    estado = await freio.ler(chaves);
  } catch {
    /* banco do freio fora do ar: segue, a senha ainda é exigida */
  }
  const espera = Math.max(0, ...chaves.map((c) => segundosRestantes(estado.get(c)?.bloqueadoAteMs ?? 0, agora)));
  if (espera > 0) {
    return NextResponse.json(
      { error: `Muitas tentativas erradas. Tente de novo em ${espera} segundo(s).` },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  if (!verifyPassword(parsed.data.senha, me.passwordHash)) {
    let falhasConta = 0;
    await Promise.all(
      chaves.map(async (c) => {
        const atual = estado.get(c);
        const vigentes = falhasVigentes(atual?.falhas ?? 0, atual?.ultimaFalhaMs ?? 0, agora) + 1;
        if (c.startsWith("fin:email:")) falhasConta = vigentes;
        await freio.gravar(c, { falhas: vigentes, bloqueadoAteMs: bloqueadoAte(vigentes, agora), ultimaFalhaMs: agora }).catch(() => undefined);
      }),
    );
    await auditarSemFalhar(me, req, { acao: "cadeado.falha", alvo: me.email, resumo: `Senha errada (${falhasConta}ª seguida)`, antes: undefined, depois: undefined });
    if (falhasConta === FALHAS_LIVRES + 1) {
      await auditarSemFalhar(me, req, { acao: "cadeado.bloqueio", alvo: me.email, resumo: `${falhasConta} senhas erradas seguidas`, antes: undefined, depois: undefined });
      await alertarSocios(
        "Financeiro: senhas erradas em sequência",
        `Alguém errou a senha do Financeiro ${falhasConta} vezes seguidas na conta de ${me.name || me.email}. Se não foi essa pessoa, troque a senha dela agora.`,
        [me.email],
      );
    }
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  await freio.limpar(chaves).catch(() => undefined);
  const agoraSeg = Math.floor(agora / 1000);
  const token = { e: me.email, pv: await passwordFingerprint(me.passwordHash), ini: agoraSeg, ult: agoraSeg };
  (await cookies()).set(CADEADO_COOKIE, emitirCadeado(token), opcoesCookie(token, agoraSeg));
  await auditarSemFalhar(me, req, { acao: "cadeado.aberto", alvo: me.email, resumo: "Abriu o Financeiro com a senha", antes: undefined, depois: undefined });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** Fecha o cadeado agora (botão "Bloquear"). */
export async function DELETE(req: Request) {
  const auth = await requireApiFinanceiro(req, { cadeado: false });
  if ("error" in auth) return auth.error;
  (await cookies()).delete(CADEADO_COOKIE);
  await auditarSemFalhar(auth.me, req, { acao: "cadeado.fechado", alvo: auth.me.email, resumo: "Bloqueou o Financeiro", antes: undefined, depois: undefined });
  return NextResponse.json({ ok: true });
}
