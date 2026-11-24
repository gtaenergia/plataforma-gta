import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { ProjetosEngenharia } from "@/components/engenharia/ProjetosEngenharia";

export const metadata = { title: "Engenharia — Plataforma GTA" };

export default async function EngenhariaPage() {
  const user = await requirePageUser();
  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader
          title="Projetos de engenharia"
          subtitle="Análise de risco de descargas atmosféricas (NBR 5419-2) e quadro de cargas (NBR 5410), com laudos em PDF e Word."
        />
        <ProjetosEngenharia />
      </main>
    </div>
  );
}
