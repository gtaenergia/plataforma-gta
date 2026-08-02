import { AppHeader } from "@/components/AppHeader";
import { PrecosEditor } from "@/components/precos/PrecosEditor";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Preços dos materiais usados nas propostas. Qualquer autenticado vê (para
 * saber com que custo está orçando); só administrador altera.
 */
export default async function PrecosPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/">Voltar</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Preços de materiais"
              subtitle="Custo unitário que alimenta a lista de materiais das propostas. Mantê-lo atualizado é o que mantém a margem real."
            />
          </div>
        </div>
        <PrecosEditor podeEditar={user.role === "admin"} />
      </main>
    </div>
  );
}
