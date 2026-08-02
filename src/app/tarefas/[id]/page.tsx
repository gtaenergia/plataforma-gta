import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TarefaDetalhe } from "@/components/tasks/TarefaDetalhe";
import { BackLink } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { getTaskStore } from "@/lib/tasks/store";

/**
 * Página de uma tarefa. Mesmo desenho de /aprovacoes/[id]: a busca acontece no
 * servidor e o objeto já chega pronto ao componente, sem uma volta à API só
 * para exibir o que a página acabou de ler.
 */
export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const tarefa = await getTaskStore().get(id);
  if (!tarefa) notFound();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href="/tarefas">Voltar para Tarefas</BackLink>
        </div>
        <TarefaDetalhe inicial={tarefa} podeEditarCatalogo={user.role === "admin"} />
      </main>
    </div>
  );
}
