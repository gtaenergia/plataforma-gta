import { CrmShell } from "@/components/crm/CrmShell";
import { RelatoriosCrm } from "@/components/crm/RelatoriosCrm";

export default async function CrmRelatoriosPage() {
  return (
    <CrmShell
      titulo="Relatórios"
      subtitulo="O que aconteceu no comercial: quanto está em jogo, quanto fechou, por que se perdeu e de onde veio."
    >
      <RelatoriosCrm />
    </CrmShell>
  );
}
