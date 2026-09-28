import { CrmShell } from "@/components/crm/CrmShell";
import { TarefasCrmList } from "@/components/crm/TarefasCrmList";
import { requirePageUser } from "@/lib/session";

export default async function CrmTarefasPage() {
  const user = await requirePageUser();

  return (
    <CrmShell
      user={user}
      titulo="Tarefas"
      subtitulo="A agenda comercial: follow-ups e tarefas com cada cliente — ligados a uma negociação quando houver, e repetidos quando o relacionamento pede. Não se confunde com as Tarefas de Operações, que são demandas de execução."
    >
      <TarefasCrmList usuarioAtual={user.email} />
    </CrmShell>
  );
}
