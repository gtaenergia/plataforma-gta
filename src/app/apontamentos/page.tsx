import { AppHeader } from "@/components/AppHeader";
import { TrackerBoard } from "@/components/tracker/TrackerBoard";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

export default async function ApontamentosPage() {
  const user = await requirePageUser();
  // A CHAVE da permissão continua "tracker.*": ela está gravada nos cargos
  // (jsonb no banco), e renomeá-la revogaria em silêncio quem já a tem.
  // Só o texto que o usuário lê mudou.
  const podeVerEquipe = await temPermissao(user, "tracker.ver_equipe");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <PageHeader title="Apontamentos" subtitle="Registre o tempo dedicado a cada tarefa — cronômetro ou lançamento manual." />
        <div className="mt-6">
          <TrackerBoard meEmail={user.email} podeVerEquipe={podeVerEquipe} />
        </div>
      </main>
    </div>
  );
}
