import { notificar } from "@/lib/notificacoes/store";
import { users } from "@/lib/users/store";
import { temAcessoFinanceiro } from "./acesso-regras";

/**
 * Alertas de segurança do Financeiro: avisam no sino (e no celular, por push)
 * TODOS que têm acesso — para que nada que abra a porta do caixa aconteça em
 * silêncio. Ninguém dá acesso a si mesmo, redefine a senha de um sócio ou
 * insiste na senha errada sem os outros ficarem sabendo.
 *
 * O texto nunca leva valor em dinheiro: a notificação passa por serviço de
 * push de terceiros e fica na tela de bloqueio do celular.
 *
 * Best-effort, como `notificar()`: alerta que falha não desfaz a ação (ela já
 * está na auditoria).
 */
export async function alertarSocios(titulo: string, mensagem: string, alemDe: string[] = []): Promise<void> {
  try {
    const todos = await (await users()).list();
    const destinos = new Set(todos.filter((u) => temAcessoFinanceiro(u)).map((u) => u.email));
    for (const e of alemDe) if (e) destinos.add(e);
    await Promise.all(
      [...destinos].map((paraEmail) =>
        notificar({ paraEmail, tipo: "financeiro_seguranca", titulo, mensagem, link: "/financeiro/configuracoes#auditoria" }),
      ),
    );
  } catch (e) {
    console.error("Alerta do Financeiro: falha ao avisar —", e);
  }
}
