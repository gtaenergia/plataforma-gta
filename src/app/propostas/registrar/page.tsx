import { AppHeader } from "@/components/AppHeader";
import { RegistrarPropostaForm } from "@/components/propostas/RegistrarPropostaForm";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Registro de proposta feita fora da plataforma. Página própria, e não um
 * cartão dentro da lista: o formulário tem sete campos mais o anexo, e o mesmo
 * desenho de /tarefas/nova já resolveu esse caso.
 */
export default async function RegistrarPropostaPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href="/propostas">Voltar para Propostas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Registrar proposta pronta"
              subtitle="Para a proposta que já foi montada fora da plataforma. Ela entra no mesmo histórico e na mesma esteira de aprovação das que a plataforma gera."
            />
          </div>
        </div>
        <RegistrarPropostaForm />
      </main>
    </div>
  );
}
