import { BackLink } from "@/components/ui";
import { CrmShell } from "@/components/crm/CrmShell";
import { CatalogoConfig } from "@/components/crm/config/CatalogoConfig";

export default async function CrmConfigMotivosPerdaPage() {
  return (
    <CrmShell
      exigir="crm.configurar"
      titulo="Motivos de perda"
      subtitulo="Por que as negociações não fecham. Toda perda exige um destes motivos — é o que alimenta a análise depois."
    >
      <div className="mb-4"><BackLink href="/crm/configuracoes">Configurações</BackLink></div>
      <CatalogoConfig
        endpoint="/api/crm/motivos-perda"
        chaveLista="motivos"
        chaveItem="motivo"
        singular="motivo de perda"
        placeholder="Ex.: Optou por não investir agora"
      />
    </CrmShell>
  );
}
