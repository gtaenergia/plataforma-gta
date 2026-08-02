import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PropostasList } from "@/components/propostas/PropostasList";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

export default async function PropostasPage() {
  const user = await requirePageUser();
  const podeEnviar = await temPermissao(user, "orcamentos.criar");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <PageHeader
            title="Propostas geradas"
            /* Não citar serviço específico: reabrir é liberado por
               `usesConfigurator`, hoje verdadeiro para os doze serviços. A
               frase anterior nomeava só o Solar — resquício de quando ele era
               o único configurador — e levava a crer que as demais propostas
               não podiam ser retomadas. */
            subtitle="Todas as propostas geradas na plataforma. Filtre por cliente, serviço, criador ou status, e reabra uma proposta para continuar de onde parou."
            actions={
              <Link href="/" className="btn-primary whitespace-nowrap">
                + Nova proposta
              </Link>
            }
          />
        </div>

        <PropostasList podeEnviar={podeEnviar} />
      </main>
    </div>
  );
}
