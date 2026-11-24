import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requirePageUser } from "@/lib/session";
import { getProjetoEngStore } from "@/lib/engenharia/store";
import { QuadroCargas } from "@/components/engenharia/quadro/QuadroCargas";

export const metadata = { title: "Quadro de Cargas — Plataforma GTA" };

export default async function QuadroPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const projeto = await getProjetoEngStore().get(id);
  if (!projeto) notFound();
  return (
    <div className="min-h-screen pb-16">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <QuadroCargas projetoId={projeto.id} dados={projeto.dados} inicial={projeto.quadro} salvoEm={projeto.atualizadoEm} />
      </main>
    </div>
  );
}
