import { AppHeader } from "@/components/AppHeader";
import { CapacidadeAdmin } from "@/components/capacidade/CapacidadeAdmin";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Capacidade da equipe — quanto cada pessoa consegue trabalhar por dia e quanto
 * tempo leva cada tipo de demanda. É o que alimenta a sugestão de responsável e
 * o prazo proposto na criação de uma tarefa. Restrito a administradores.
 */
export default async function AdminCapacidadePage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/tarefas">Voltar para Tarefas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Capacidade da equipe"
              subtitle="Cadastre a jornada de trabalho de cada profissional e a duração média de cada tipo de demanda. Com esses parâmetros, a plataforma passa a indicar responsáveis com disponibilidade e a calcular prazos de entrega já na abertura da tarefa."
            />
          </div>
        </div>
        <CapacidadeAdmin />
      </main>
    </div>
  );
}
