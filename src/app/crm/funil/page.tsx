import { CrmShell } from "@/components/crm/CrmShell";
import { FunilBoard } from "@/components/crm/FunilBoard";

export default async function CrmFunilPage() {
  return (
    <CrmShell
      titulo="Funil de vendas"
      subtitulo="As negociações em aberto distribuídas pelas etapas do processo comercial. Arraste o cartão (ou use o seletor nele) para avançar de etapa."
    >
      <FunilBoard />
    </CrmShell>
  );
}
