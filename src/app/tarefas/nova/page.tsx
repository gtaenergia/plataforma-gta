import { AppHeader } from "@/components/AppHeader";
import { NovaTarefaForm } from "@/components/tasks/NovaTarefaForm";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Abertura de tarefa. Página própria, e não um cartão acima da lista: o
 * formulário passou a incluir a classificação da demanda e a indicação de
 * responsável, e ocupava quase duas telas no celular.
 */
export default async function NovaTarefaPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href="/tarefas">Voltar para Tarefas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Nova tarefa"
              subtitle="Classifique a demanda e a plataforma calcula a duração, indica quem tem disponibilidade e propõe a data de entrega."
            />
          </div>
        </div>
        <NovaTarefaForm podeEditarCatalogo={user.role === "admin"} />
      </main>
    </div>
  );
}
