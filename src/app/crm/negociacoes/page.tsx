import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";

export default async function CrmNegociacoesPage() {
  return (
    <CrmShell
      titulo="Negociações"
      subtitulo="A mesma base do funil, em lista: para filtrar, comparar e agir sobre muitas negociações de uma vez."
    >
      <div className="space-y-4">
        <EmBreve
          titulo="Listagem de negociações"
          descricao="A visão de tabela, com filtros e ações em massa."
          itens={[
            "Colunas: nome, empresa, etapa, valor, responsável, fonte, previsão de fechamento e situação",
            "Situação em quatro estados: aberta, pausada, ganha e perdida (com o motivo)",
            "Filtros combinados por etapa, responsável, equipe, fonte, campanha, produto e período",
            "Ações em massa: transferir responsável, mover de etapa, marcar ganha ou perdida, excluir",
            "Exportação da seleção",
            "No celular, cartões em vez de tabela — o padrão das listas da plataforma",
          ]}
        />
        <EmBreve
          titulo="Ficha da negociação"
          descricao="A tela em que o vendedor passa o dia."
          itens={[
            "Dados da negociação: etapa, valor, responsável, fonte, campanha, previsão e avaliação",
            "Empresa e contatos vinculados",
            "Produtos e serviços negociados, com quantidade, preço, desconto (valor ou percentual) e recorrência",
            "Tarefas da negociação, por tipo",
            "Histórico único e imutável: anotações, mudanças de etapa, e-mails, propostas enviadas e ligações",
            "Anexos da negociação",
            "Campos personalizados definidos nas configurações",
          ]}
        />
      </div>
    </CrmShell>
  );
}
