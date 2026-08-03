import { AppHeader } from "@/components/AppHeader";
import { AprovacoesBoard } from "@/components/orcamentos/AprovacoesBoard";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/** Aprovação de orçamentos (fluxo de revisão e aprovação). */
export default async function AprovacoesPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader
          title="Aprovação de orçamentos"
          subtitle="Cada orçamento passa por revisão e aprovação antes de ser liberado."
        />
        <div className="mt-6">
          <AprovacoesBoard />
        </div>
      </main>
    </div>
  );
}
