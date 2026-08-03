import { AppHeader } from "@/components/AppHeader";
import { ArmazenamentoPainel } from "@/components/admin/ArmazenamentoPainel";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/** Consumo de banco e de arquivos — restrito a administradores. */
export default async function AdminArmazenamentoPage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin />
      <main className="app-container py-8">
        <PageHeader
          title="Armazenamento"
          subtitle="Quanto o banco e os arquivos estão ocupando — e o que está ocupando."
        />
        <div className="mt-6">
          <ArmazenamentoPainel />
        </div>
      </main>
    </div>
  );
}
