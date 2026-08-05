import { AppHeader } from "@/components/AppHeader";
import { MaoDeObraAdmin } from "@/components/mao-de-obra/MaoDeObraAdmin";
import { BackLink, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Catálogo de mão de obra TERCEIRIZADA — o que a GTA paga a quem executa.
 *
 * Não confundir com o custo administrativo interno (as horas da própria
 * equipe): são cadastros distintos e entram no preço por caminhos distintos.
 *
 * Restrito a administradores: o R$/h de cada função é o piso de tudo que for
 * orçado por hora, e mexer nele muda o preço de todo orçamento feito dali em
 * diante.
 */
export default async function AdminMaoDeObraPage() {
  const user = await requirePageUser({ requireAdmin: true });

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin />
      <main className="app-container py-8">
        <div className="mb-6">
          <BackLink href="/">Voltar para o início</BackLink>
          <div className="mt-2">
            <PageHeader
              title="Mão de obra terceirizada"
              subtitle="Cadastre quanto custa a hora de cada função contratada de fora e as taxas com que os orçamentos nascem. Com isso a plataforma passa a montar o preço de serviços cobrados por hora — inclusive os que não têm configurador próprio."
            />
          </div>
        </div>
        <MaoDeObraAdmin />
      </main>
    </div>
  );
}
