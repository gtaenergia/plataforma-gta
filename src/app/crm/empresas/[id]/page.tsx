import { AppHeader } from "@/components/AppHeader";
import { EmpresaDetalhe } from "@/components/crm/EmpresaDetalhe";
import { requirePageUser } from "@/lib/session";

/**
 * Ficha da empresa. Sem `CrmShell`: o título é o nome da empresa, que o
 * componente de cliente carrega — a casca aqui é só o cabeçalho.
 */
export default async function CrmEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <EmpresaDetalhe id={id} />
      </main>
    </div>
  );
}
