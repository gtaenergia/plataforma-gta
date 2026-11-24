import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { passwordFingerprint } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import type { User } from "@/lib/users/types";
import { CABECALHO_AUTOMATICO, origemConfiavel, temAcessoFinanceiro } from "./acesso-regras";
import { CADEADO_COOKIE, MOTIVO_TEXTO, lerCadeado, opcoesCookie, renovarCadeado, type MotivoFechado } from "./cadeado";

export { temAcessoFinanceiro };

/**
 * As portas do Financeiro, em camadas:
 *
 * 1. Sessão válida (middleware + `getCurrentUser`, que derruba sessão de
 *    senha trocada ou conta desativada).
 * 2. A marca `financeiro` no cadastro. Nem o papel de administrador dá o
 *    acesso sozinho.
 * 3. O cadeado: a senha de novo, que fecha com 30 min sem uso e a cada 12 h
 *    (ver cadeado.ts).
 * 4. Nas rotas que mudam algo: a requisição precisa vir da própria plataforma
 *    (anti-CSRF) — ver `origemConfiavel`.
 */

/** Topo das páginas do Financeiro. Sem a marca, volta para a home. */
export async function requirePageFinanceiro(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/trocar-senha");
  if (!temAcessoFinanceiro(user)) redirect("/?semAcesso=financeiro");
  return user;
}

/** O cadeado está aberto para esta pessoa? (leitura, sem renovar) */
export async function situacaoCadeado(user: User): Promise<{ aberto: true } | { aberto: false; motivo: MotivoFechado }> {
  const token = (await cookies()).get(CADEADO_COOKIE)?.value;
  const r = lerCadeado(token, { email: user.email, pv: await passwordFingerprint(user.passwordHash) });
  return r.ok ? { aberto: true } : { aberto: false, motivo: r.motivo };
}

const negar = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Guarda das rotas de API do Financeiro. `cadeado: false` só na própria rota
 * que abre o cadeado (ela precisa das outras camadas, não desta).
 */
export async function requireApiFinanceiro(
  req: Request,
  opcoes: { cadeado?: boolean } = {},
): Promise<{ me: User } | { error: NextResponse }> {
  const me = await getCurrentUser();
  if (!me) return { error: negar(401, "Não autenticado.") };
  if (!temAcessoFinanceiro(me)) return { error: negar(403, "Sem acesso ao Financeiro. Peça a quem já tem acesso.") };

  const muda = req.method !== "GET" && req.method !== "HEAD";
  if (muda && !origemConfiavel(req)) return { error: negar(403, "Requisição recusada: origem não confiável.") };

  if (opcoes.cadeado === false) return { me };

  const jar = await cookies();
  const lido = lerCadeado(jar.get(CADEADO_COOKIE)?.value, { email: me.email, pv: await passwordFingerprint(me.passwordHash) });
  if (!lido.ok) {
    // 423 Locked: a tela entende e mostra o cadeado, sem perder a página.
    if (lido.motivo !== "ausente") jar.delete(CADEADO_COOKIE);
    return { error: negar(423, MOTIVO_TEXTO[lido.motivo], { bloqueado: true, motivo: lido.motivo }) };
  }
  // Consulta automática da tela (a cada 30 s) não conta como uso: sem isso, a
  // aba aberta numa mesa vazia nunca fecharia por inatividade.
  if (req.headers.get(CABECALHO_AUTOMATICO) !== "1") {
    const novo = renovarCadeado(lido.token);
    if (novo) jar.set(CADEADO_COOKIE, novo, opcoesCookie({ ...lido.token, ult: Math.floor(Date.now() / 1000) }));
  }
  return { me };
}
