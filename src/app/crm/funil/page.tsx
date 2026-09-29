import { CrmShell } from "@/components/crm/CrmShell";
import { FunilBoard } from "@/components/crm/FunilBoard";
import { requirePageUser } from "@/lib/session";

export default async function CrmFunilPage() {
  const user = await requirePageUser();

  return (
    <CrmShell
      user={user}
      titulo="Funil de vendas"
      subtitulo="As negociações em aberto distribuídas pelas etapas do processo comercial. Arraste o cartão (ou use o seletor nele) para avançar de etapa; o botão de follow-up agenda o próximo contato."
    >
      <FunilBoard usuarioAtual={user.email} />
    </CrmShell>
  );
}
