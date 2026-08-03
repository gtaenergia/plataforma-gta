import { AppHeader } from "@/components/AppHeader";
import { NovaTarefaForm } from "@/components/tasks/NovaTarefaForm";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { urlDaLista } from "@/components/tasks/filtros";

/**
 * Abertura de tarefa. Página própria, e não um cartão acima da lista: o
 * formulário passou a incluir a classificação da demanda e a indicação de
 * responsável, e ocupava quase duas telas no celular.
 */
export default async function NovaTarefaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  // Mesmo caminho do detalhe: a lista repassa os filtros, e o Voltar devolve
  // a pessoa à listagem de onde ela saiu.
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
  ).toString();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href={urlDaLista(query)}>Voltar para Tarefas</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Nova tarefa"
              subtitle="Classifique a demanda e a plataforma calcula a duração, indica quem tem disponibilidade e propõe a data de entrega."
            />
          </div>
        </div>
        <NovaTarefaForm podeEditarCatalogo={user.role === "admin"} />
      </main>
    </div>
  );
}
