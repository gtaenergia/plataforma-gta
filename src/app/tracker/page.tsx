import { AppHeader } from "@/components/AppHeader";
import { TrackerBoard } from "@/components/tracker/TrackerBoard";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

export default async function TrackerPage() {
  const user = await requirePageUser();
  const podeVerEquipe = await temPermissao(user, "tracker.ver_equipe");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader title="Tracker" subtitle="Registre o tempo dedicado a cada tarefa — cronômetro ou lançamento manual." />
        <div className="mt-6">
          <TrackerBoard meEmail={user.email} podeVerEquipe={podeVerEquipe} />
        </div>
      </main>
    </div>
  );
}
