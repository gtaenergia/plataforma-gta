import { AppHeader } from "@/components/AppHeader";
import { ClientesList } from "@/components/clientes/ClientesList";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

export default async function ClientesPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <PageHeader
            title="Clientes"
            subtitle="Cadastro dos clientes da GTA — dados de contato, endereço e segmento. Usado para agilizar propostas e, no futuro, faturamento e relatórios por cliente."
          />
        </div>
        <ClientesList />
      </main>
    </div>
  );
}
