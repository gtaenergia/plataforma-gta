import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";

export default async function CrmFunilPage() {
  return (
    <CrmShell
      titulo="Funil de vendas"
      subtitulo="As negociações em aberto distribuídas pelas etapas do processo comercial, da prospecção ao fechamento."
    >
      <EmBreve
        titulo="Funil de vendas"
        descricao="A visão de quadro: uma coluna por etapa, um cartão por negociação."
        itens={[
          "Uma coluna por etapa, com a quantidade de negociações e o valor previsto somado no topo",
          "Cartão por negociação: nome, empresa, valor, responsável e data prevista de fechamento",
          "Arrastar o cartão entre etapas, registrando a mudança no histórico da negociação",
          "Marcar como ganha ou perdida — a perda exige o motivo, escolhido entre os do funil",
          "Pausar uma negociação sem tirá-la do funil",
          "Seletor de funil, para contas com mais de um processo comercial (até 12 etapas cada)",
          "Filtros por responsável, equipe, fonte, campanha e período",
        ]}
      />
    </CrmShell>
  );
}
