import { CrmShell } from "@/components/crm/CrmShell";
import { NegociacoesList } from "@/components/crm/NegociacoesList";
import { requirePageUser } from "@/lib/session";

export default async function CrmNegociacoesPage() {
  // O usuário é buscado aqui e entregue à casca: a lista precisa dele para já
  // vir com o responsável certo, e assim a consulta continua sendo uma só.
  const user = await requirePageUser();

  return (
    <CrmShell
      user={user}
      titulo="Negociações"
      subtitulo="A mesma base do funil, em lista: filtre por funil, situação e responsável, e abra a ficha para ver o histórico completo."
    >
      <NegociacoesList usuarioAtual={user.email} />
    </CrmShell>
  );
}
