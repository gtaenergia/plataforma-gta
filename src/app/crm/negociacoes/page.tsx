import { CrmShell } from "@/components/crm/CrmShell";
import { NegociacoesList } from "@/components/crm/NegociacoesList";

export default async function CrmNegociacoesPage() {
  return (
    <CrmShell
      titulo="Negociações"
      subtitulo="A mesma base do funil, em lista: filtre por funil, situação e responsável, e abra a ficha para ver o histórico completo."
    >
      <NegociacoesList />
    </CrmShell>
  );
}
