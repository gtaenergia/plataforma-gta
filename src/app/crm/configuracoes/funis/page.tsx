import { BackLink } from "@/components/ui";
import { CrmShell } from "@/components/crm/CrmShell";
import { FunisConfig } from "@/components/crm/config/FunisConfig";

export default async function CrmConfigFunisPage() {
  return (
    <CrmShell
      exigir="crm.configurar"
      titulo="Funis de venda"
      subtitulo="O desenho do processo comercial: cada funil com suas etapas, na ordem em que aparecem no quadro."
    >
      <div className="mb-4"><BackLink href="/crm/configuracoes">Configurações</BackLink></div>
      <FunisConfig />
    </CrmShell>
  );
}
