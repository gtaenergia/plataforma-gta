import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, REMEMBER_MAX_SECONDS, signSession } from "@/lib/auth";
import { validateCredentials } from "@/lib/users/authenticate";
import {
  bloqueadoAte,
  chaveEmail,
  chaveIp,
  falhasVigentes,
  ipDaRequisicao,
  segundosRestantes,
} from "@/lib/login/limite";
import { getLoginLimiteStore, type TentativaLogin } from "@/lib/login/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Corpo malformado passa a ser 400: antes, um JSON quebrado subia como erro
  // não tratado e virava 500.
  let body: { email?: string; password?: string; lembrar?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  /** "Continuar conectado": sessão de 30 dias em vez de 12h. */
  const { email = "", password = "", lembrar } = body;

  const store = getLoginLimiteStore();
  const chaves = [chaveEmail(email), chaveIp(ipDaRequisicao(req.headers))];
  const agora = Date.now();

  // O freio é consultado ANTES de validar: negar sem gastar o scrypt é o que
  // impede que a própria defesa vire o custo do ataque.
  let estado = new Map<string, TentativaLogin>();
  try {
    estado = await store.ler(chaves);
  } catch {
    // Banco fora do ar não pode trancar a porta de todo mundo. Segue sem
    // freio: pior que ficar sem limite é a equipe inteira não conseguir entrar.
  }

  const espera = Math.max(
    0,
    ...chaves.map((c) => segundosRestantes(estado.get(c)?.bloqueadoAteMs ?? 0, agora)),
  );
  if (espera > 0) {
    // Mesma resposta para e-mail que existe e que não existe — o 429 não pode
    // virar um oráculo de quem tem conta.
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${espera} segundo(s).` },
      { status: 429, headers: { "Retry-After": String(espera) } },
    );
  }

  const user = await validateCredentials(email, password);

  if (!user) {
    // Conta a falha nas DUAS chaves: só por IP, ataque distribuído passa; só
    // por e-mail, qualquer um tranca a conta de um colega.
    await Promise.all(
      chaves.map(async (c) => {
        const atual = estado.get(c);
        const vigentes = falhasVigentes(atual?.falhas ?? 0, atual?.ultimaFalhaMs ?? 0, agora) + 1;
        await store
          .gravar(c, {
            falhas: vigentes,
            bloqueadoAteMs: bloqueadoAte(vigentes, agora),
            ultimaFalhaMs: agora,
          })
          .catch(() => undefined);
      }),
    );
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  // Acertou: zera as duas chaves. Quem errou de dedo antes de lembrar a senha
  // não carrega o histórico para a próxima vez.
  await store.limpar(chaves).catch(() => undefined);

  // Troca de senha pendente nunca vira sessão longa: o vínculo com a senha
  // atual (provisória) morre assim que ela for trocada, de qualquer forma.
  const manterConectado = Boolean(lembrar) && !user.mustChangePassword;

  const token = await signSession(
    { email: user.email, name: user.name, passwordHash: user.passwordHash },
    { lembrar: manterConectado },
  );
  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: manterConectado ? REMEMBER_MAX_SECONDS : SESSION_TTL_SECONDS,
  });
  return res;
}
