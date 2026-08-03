import { AppHeader } from "@/components/AppHeader";
import { PropostaManualForm } from "@/components/propostas/PropostaManualForm";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Cadastro de proposta feita fora da plataforma. Página própria, e não um
 * cartão dentro da lista: o formulário tem sete campos mais o anexo, e o mesmo
 * desenho de /tarefas/nova já resolveu esse caso.
 */
export default async function PropostaManualPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href="/propostas">Voltar para Propostas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Cadastrar proposta manual"
              subtitle="Para a proposta que foi montada fora da plataforma. Ela entra no mesmo histórico e na mesma esteira de aprovação das geradas."
            />
          </div>
        </div>
        <PropostaManualForm />
      </main>
    </div>
  );
}
