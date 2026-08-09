import { BackLink } from "@/components/ui";
import { CrmShell } from "@/components/crm/CrmShell";
import { CatalogoConfig } from "@/components/crm/config/CatalogoConfig";

export default async function CrmConfigFontesPage() {
  return (
    <CrmShell
      exigir="crm.configurar"
      titulo="Fontes"
      subtitulo="De onde cada negociação veio — a base do relatório de origem, que mostra o retorno de cada canal."
    >
      <div className="mb-4"><BackLink href="/crm/configuracoes">Configurações</BackLink></div>
      <CatalogoConfig
        endpoint="/api/crm/fontes"
        chaveLista="fontes"
        chaveItem="fonte"
        singular="fonte"
        placeholder="Ex.: Feira do setor elétrico"
      />
    </CrmShell>
  );
}
