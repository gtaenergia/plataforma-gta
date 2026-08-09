import { CrmShell } from "@/components/crm/CrmShell";
import { ContatosList } from "@/components/crm/ContatosList";

export default async function CrmContatosPage() {
  return (
    <CrmShell
      titulo="Contatos"
      subtitulo="As pessoas com quem se negocia. Um contato pertence a um cliente e pode participar de várias negociações."
    >
      <ContatosList />
    </CrmShell>
  );
}
