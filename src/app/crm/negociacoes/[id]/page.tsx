import { AppHeader } from "@/components/AppHeader";
import { NegociacaoDetalhe } from "@/components/crm/NegociacaoDetalhe";
import { requirePageUser } from "@/lib/session";

/**
 * Ficha da negociação. Sem `CrmShell`: o título da página é a própria
 * negociação, que o componente de cliente carrega — a casca aqui é só o
 * cabeçalho e o container.
 */
export default async function CrmNegociacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <NegociacaoDetalhe id={id} />
      </main>
    </div>
  );
}
