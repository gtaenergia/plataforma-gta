import { AppHeader } from "@/components/AppHeader";
import { UsersAdmin } from "@/components/users/UsersAdmin";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/** Gestão de usuários — restrito a administradores. */
export default async function AdminUsuariosPage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin />
      <main className="app-container py-8">
        <PageHeader title="Usuários" subtitle="Cadastre e gerencie quem tem acesso à plataforma." />
        <div className="mt-6">
          <UsersAdmin currentUserId={user.id} />
        </div>
      </main>
    </div>
  );
}
