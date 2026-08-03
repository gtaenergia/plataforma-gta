import { AppHeader } from "@/components/AppHeader";
import { PlanejamentoAdmin } from "@/components/capacidade/PlanejamentoAdmin";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Parâmetros de planejamento: jornada de trabalho da equipe, catálogo de tipos
 * de demanda com a duração média de cada um e calendário de feriados. É o que
 * alimenta a indicação de responsável e o cálculo de prazo na abertura de uma
 * tarefa. Restrito a administradores.
 */
export default async function AdminPlanejamentoPage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/tarefas">Voltar para Tarefas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Planejamento e capacidade"
              subtitle="Cadastre a jornada de trabalho de cada profissional e o catálogo de demandas com a duração média de cada tipo. Com esses parâmetros, a plataforma passa a indicar responsáveis com disponibilidade e a calcular prazos de entrega já na abertura da tarefa."
            />
          </div>
        </div>
        <PlanejamentoAdmin />
      </main>
    </div>
  );
}
