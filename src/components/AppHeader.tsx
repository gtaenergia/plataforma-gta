import { AppHeaderCliente } from "./AppHeaderCliente";
import { getCurrentUser } from "@/lib/session";
import { temAcessoFinanceiro } from "@/lib/financeiro/acesso-regras";

/**
 * Cabeçalho da plataforma — casca de servidor em volta do cabeçalho interativo.
 *
 * Existe para uma pergunta só: esta pessoa enxerga o Financeiro? A resposta
 * está no cadastro, no servidor, e as ~23 páginas que montam o cabeçalho
 * continuam passando só nome, foto e papel. `getCurrentUser` é memorizado por
 * requisição (React `cache`), então a página e o cabeçalho dividem a mesma
 * consulta ao banco.
 */
export async function AppHeader(props: { userName?: string; avatarUrl?: string; isAdmin?: boolean }) {
  const me = props.userName ? await getCurrentUser() : null;
  return <AppHeaderCliente {...props} financeiro={temAcessoFinanceiro(me)} />;
}
