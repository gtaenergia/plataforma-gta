import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requirePageUser } from "@/lib/session";
import { getProjetoEngStore } from "@/lib/engenharia/store";
import { ProjetoDetalhe } from "@/components/engenharia/ProjetoDetalhe";

export default async function ProjetoEngPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const projeto = await getProjetoEngStore().get(id);
  if (!projeto) notFound();
  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <ProjetoDetalhe projeto={projeto} />
      </main>
    </div>
  );
}
