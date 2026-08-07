import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";

export default async function CrmRelatoriosPage() {
  return (
    <CrmShell
      titulo="Relatórios"
      subtitulo="O que aconteceu no comercial: volume, conversão, motivo de perda e desempenho, por período, funil, equipe e vendedor."
    >
      <div className="space-y-4">
        <EmBreve
          titulo="Relatórios do CRM"
          descricao="Cada tela do CRM alimenta estes números automaticamente."
          itens={[
            "Desempenho em tempo real — as negociações acontecendo agora",
            "Painel de desempenho — curvas de faturamento e ticket médio no período",
            "Dashboard — negociações criadas, ganhas e perdidas",
            "Pipeline — quantidade e valor previsto por etapa do funil",
            "Vendas por equipe — valor e quantidade no período",
            "Feedback de interações — frequência de contato com o cliente",
            "Conversões — taxa por etapa e motivos de perda",
            "Produtos e serviços — o que foi vendido, em quantidade e valor",
            "Negociações por origem — retorno de cada fonte e campanha",
            "Desempenho × metas — realizado contra a meta, por vendedor e por equipe",
            "Atividades de vendas — tarefas, interações e tempo até o primeiro contato",
            "Performance em vendas — o processo e o resultado lado a lado",
            "Negociações concluídas — detalhamento das fechadas, comparando vendedores e equipes",
          ]}
        />
        <EmBreve
          titulo="Filtros e visibilidade"
          descricao="Como cada pessoa enxerga os números."
          itens={[
            "Filtros de período, funil, equipe e vendedor em todos os relatórios",
            "Visibilidade Restrito: a pessoa vê apenas o que é dela",
            "Visibilidade Equipe: vê tudo de quem está na sua equipe",
            "Visibilidade Geral: vê tudo, sem restrição",
            "Exportação dos dados",
          ]}
        />
      </div>
    </CrmShell>
  );
}
