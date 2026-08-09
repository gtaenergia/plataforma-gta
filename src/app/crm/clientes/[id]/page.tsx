import { AppHeader } from "@/components/AppHeader";
import { ClienteDetalhe } from "@/components/crm/ClienteDetalhe";
import { requirePageUser } from "@/lib/session";

/**
 * Ficha do cliente. Sem `CrmShell`: o título é o nome do cliente, que o
 * componente carrega — a casca aqui é só o cabeçalho.
 */
export default async function CrmClientePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <ClienteDetalhe id={id} />
      </main>
    </div>
  );
}
