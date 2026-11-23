import { AppHeader } from "@/components/AppHeader";
import { TaskList } from "@/components/tasks/TaskList";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

export default async function TarefasPage() {
  const user = await requirePageUser();
  // O cliente não enxerga o cargo: a permissão é resolvida aqui e só o
  // sim/não desce, para o seletor não oferecer o que a API vai recusar.
  const podeVerificar = await temPermissao(user, "tarefas.verificar");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader title="Tarefas" subtitle="Organize e acompanhe as tarefas da equipe GTA." />
        <div className="mt-6">
          <TaskList usuario={{ email: user.email, podeVerificar }} />
        </div>
      </main>
    </div>
  );
}
