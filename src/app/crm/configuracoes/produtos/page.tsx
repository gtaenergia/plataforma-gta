import { BackLink } from "@/components/ui";
import { CrmShell } from "@/components/crm/CrmShell";
import { ProdutosConfig } from "@/components/crm/config/ProdutosConfig";

export default async function CrmConfigProdutosPage() {
  return (
    <CrmShell
      exigir="crm.configurar"
      titulo="Produtos e serviços"
      subtitulo="O catálogo do que a GTA vende, com preço base — os itens entram nas negociações e nos relatórios."
    >
      <div className="mb-4"><BackLink href="/crm/configuracoes">Configurações</BackLink></div>
      <ProdutosConfig />
    </CrmShell>
  );
}
