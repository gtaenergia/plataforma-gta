import { AppHeader } from "@/components/AppHeader";
import { CalendarioTarefas } from "@/components/calendario/CalendarioTarefas";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Calendário de prazos das tarefas. Abre nas tarefas do próprio usuário, com
 * alternância para a equipe inteira.
 */
export default async function CalendarioPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/tarefas">Voltar para Tarefas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Calendário"
              subtitle="Prazos das tarefas distribuídos no mês, com prioridade e situação. Clique em um item para abrir a tarefa."
            />
          </div>
        </div>
        <CalendarioTarefas currentUserEmail={user.email} />
      </main>
    </div>
  );
}
