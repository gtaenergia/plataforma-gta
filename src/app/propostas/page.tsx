import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { PropostasList } from "@/components/propostas/PropostasList";
import { CalculadoraMaoDeObra } from "@/components/propostas/CalculadoraMaoDeObra";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

export default async function PropostasPage() {
  const user = await requirePageUser();
  const podeEnviar = await temPermissao(user, "orcamentos.criar");
  /*
   * A visibilidade da calculadora é decidida AQUI, no servidor, e não por um
   * `fetch` dentro do componente.
   *
   * Na primeira versão o card se escondia sozinho enquanto esperava a API
   * responder — e qualquer tropeço nesse caminho (sessão vencida, resposta que
   * não é JSON) fazia ele sumir sem deixar rastro na tela. Foi exatamente o que
   * aconteceu: "não tá aparecendo", sem nada para investigar.
   *
   * Resolvido no servidor, o card está no HTML da primeira pintura ou não está
   * — e o motivo é sempre a permissão, nunca a rede.
   */
  const podeVerFinanceiro = await temPermissao(user, "financeiro.ver");

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

        {/* Ferramenta, não listagem: fica acima do histórico porque é o que se
            vem fazer aqui. */}
        {podeVerFinanceiro && (
          <div className="mb-6">
            <CalculadoraMaoDeObra podeConfigurar={user.role === "admin"} />
          </div>
        )}

        <PropostasList podeEnviar={podeEnviar} />
      </main>
    </div>
  );
}
