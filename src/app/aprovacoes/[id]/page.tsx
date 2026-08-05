import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { OrcamentoDetalhe } from "@/components/orcamentos/OrcamentoDetalhe";
import { requirePageUser } from "@/lib/session";
import { permissoesDoUsuario } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { oneDriveConfigurado } from "@/lib/onedrive/graph";

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const orc = await getOrcamentoStore().get(id);
  if (!orc) notFound();
  const perms = Array.from(await permissoesDoUsuario(user));
  // `permissoesDoUsuario` já devolve TODAS as chaves para quem é admin, então
  // esta checagem cobre o super-usuário sem caso especial.
  const verFinanceiro = perms.includes("financeiro.ver");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <OrcamentoDetalhe inicial={redigirOrcamento(orc, verFinanceiro)!} perms={perms} currentEmail={user.email} isAdmin={user.role === "admin"} oneDriveAtivo={oneDriveConfigurado()} />
      </main>
    </div>
  );
}
