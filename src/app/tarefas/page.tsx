import { AppHeader } from "@/components/AppHeader";
import { TaskList } from "@/components/tasks/TaskList";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

export default async function TarefasPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader title="Tarefas" subtitle="Organize e acompanhe as tarefas da equipe GTA." />
        <div className="mt-6">
          <TaskList />
        </div>
      </main>
    </div>
  );
}
