import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requirePageUser } from "@/lib/session";
import { getProjetoEngStore } from "@/lib/engenharia/store";
import { AnaliseRisco } from "@/components/engenharia/risco/AnaliseRisco";

export const metadata = { title: "Análise de Risco — Plataforma GTA" };

export default async function RiscoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const projeto = await getProjetoEngStore().get(id);
  if (!projeto) notFound();
  return (
    <div className="min-h-screen pb-28">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <AnaliseRisco projetoId={projeto.id} dados={projeto.dados} inicial={projeto.risco} salvoEm={projeto.atualizadoEm} />
      </main>
    </div>
  );
}
