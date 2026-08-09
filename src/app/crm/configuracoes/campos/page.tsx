import { BackLink } from "@/components/ui";
import { CrmShell } from "@/components/crm/CrmShell";
import { CamposConfig } from "@/components/crm/config/CamposConfig";

export default async function CrmConfigCamposPage() {
  return (
    <CrmShell
      exigir="crm.configurar"
      titulo="Campos personalizados"
      subtitulo="O que uma negociação de engenharia carrega e uma negociação genérica não tem: potência, distribuidora, classe de tensão, número da UC."
    >
      <div className="mb-4"><BackLink href="/crm/configuracoes">Configurações</BackLink></div>
      <CamposConfig />
    </CrmShell>
  );
}
