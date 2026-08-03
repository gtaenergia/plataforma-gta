import { AppHeader } from "@/components/AppHeader";
import { CargosAdmin } from "@/components/cargos/CargosAdmin";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/** Gestão de cargos e permissões — restrito a administradores. */
export default async function AdminCargosPage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin />
      <main className="app-container py-8">
        <PageHeader
          title="Cargos e permissões"
          subtitle="Crie cargos e defina o que cada um pode fazer na plataforma. Administradores têm todas as permissões."
        />
        <div className="mt-6">
          <CargosAdmin />
        </div>
      </main>
    </div>
  );
}
