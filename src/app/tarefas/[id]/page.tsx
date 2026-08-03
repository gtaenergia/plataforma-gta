import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { TarefaDetalhe } from "@/components/tasks/TarefaDetalhe";
import { BackLink } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { getTaskStore } from "@/lib/tasks/store";
import { urlDaLista } from "@/components/tasks/filtros";

/**
 * Página de uma tarefa. Mesmo desenho de /aprovacoes/[id]: a busca acontece no
 * servidor e o objeto já chega pronto ao componente, sem uma volta à API só
 * para exibir o que a página acabou de ler.
 */
export default async function TarefaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const tarefa = await getTaskStore().get(id);
  if (!tarefa) notFound();

  // A lista manda os filtros na query; devolvemos a pessoa exatamente à
  // listagem de onde ela veio, em vez de a um /tarefas sem filtro nenhum.
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
  ).toString();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href={urlDaLista(query)}>Voltar para Tarefas</BackLink>
        </div>
        <TarefaDetalhe inicial={tarefa} podeEditarCatalogo={user.role === "admin"} />
      </main>
    </div>
  );
}
