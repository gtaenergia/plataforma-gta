import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CalculadoraMaoDeObra } from "@/components/mao-de-obra/CalculadoraMaoDeObra";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

/**
 * Calculadora de mão de obra terceirizada.
 *
 * Página própria, e não um bloco que expande na inicial: a ferramenta ocupa
 * espaço — cadastro de funções, equipe, taxas e resultado — e um acordeão
 * daquele tamanho empurra o resto da tela para longe.
 *
 * Restrita a `financeiro.ver`. Quem não tem nem enxerga o cartão que leva
 * aqui, e chegando pela URL recebe 404 — em vez de uma tela dizendo que existe
 * algo que não pode ver.
 */
export default async function MaoDeObraPage() {
  const user = await requirePageUser();
  if (!(await temPermissao(user, "financeiro.ver"))) notFound();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/">Voltar</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Calculadora de mão de obra"
              subtitle="Quanto cobrar por um trabalho executado por equipe contratada. Não gera proposta — a entrega é uma planilha com a conta aberta, em que mudar a margem recalcula o preço."
            />
          </div>
        </div>
        <CalculadoraMaoDeObra podeConfigurar={user.role === "admin"} />
      </main>
    </div>
  );
}
