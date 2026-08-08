import { CrmShell } from "@/components/crm/CrmShell";
import { TarefasCrmList } from "@/components/crm/TarefasCrmList";
import { requirePageUser } from "@/lib/session";

export default async function CrmTarefasPage() {
  const user = await requirePageUser();

  return (
    <CrmShell
      user={user}
      titulo="Tarefas"
      subtitulo="A agenda comercial: cada tarefa é um compromisso preso a uma negociação. Não se confunde com as Tarefas de Operações, que são demandas de execução."
    >
      <TarefasCrmList usuarioAtual={user.email} />
    </CrmShell>
  );
}
