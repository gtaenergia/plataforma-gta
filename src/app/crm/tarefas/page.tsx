import { CrmShell } from "@/components/crm/CrmShell";
import { TarefasCrmList } from "@/components/crm/TarefasCrmList";

export default async function CrmTarefasPage() {
  return (
    <CrmShell
      titulo="Tarefas"
      subtitulo="A agenda comercial: cada tarefa é um compromisso preso a uma negociação. Não se confunde com as Tarefas de Operações, que são demandas de execução."
    >
      <TarefasCrmList />
    </CrmShell>
  );
}
