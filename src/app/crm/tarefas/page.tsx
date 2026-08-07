import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";

export default async function CrmTarefasPage() {
  return (
    <CrmShell
      titulo="Tarefas"
      subtitulo="A agenda comercial: cada tarefa é um compromisso marcado com um contato, sempre presa a uma negociação. Não se confunde com as Tarefas de Operações, que são demandas de execução."
    >
      <EmBreve
        titulo="Agenda de tarefas"
        descricao="O que fazer hoje, e com quem."
        itens={[
          "Sete tipos: ligação, e-mail, visita, reunião, tarefa, almoço e WhatsApp",
          "Sempre vinculada a uma negociação — é o que garante o histórico do relacionamento",
          "Assunto, data, hora, responsável e anotações",
          "Visões de hoje, atrasadas e próximos dias",
          "Concluir ou adiar sem sair da lista",
          "Aviso no sino e no celular quando a tarefa vence",
        ]}
      />
    </CrmShell>
  );
}
