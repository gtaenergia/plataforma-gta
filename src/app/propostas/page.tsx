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
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
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
              <>
                {/* "Registrar" e não "Cadastrar manual": o par que a pessoa lê é
                    GERAR (a plataforma monta) x REGISTRAR (já está pronta,
                    só entra no histórico). "Externa" estava fora de questão —
                    no sistema já significa orçamento de terceiro. */}
                <Link href="/propostas/registrar" className="btn-secondary whitespace-nowrap" title="Guardar no histórico uma proposta que já foi feita fora da plataforma">
                  Registrar proposta pronta
                </Link>
                <Link href="/" className="btn-primary whitespace-nowrap">
                  + Nova proposta
                </Link>
              </>
            }
          />
        </div>

        <PropostasList podeEnviar={podeEnviar} />
      </main>
    </div>
  );
}
