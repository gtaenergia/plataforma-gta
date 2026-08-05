import Link from "next/link";
import { SERVICES } from "@/services/registry";
import { AppHeader } from "@/components/AppHeader";
import { ServiceIcon } from "@/components/ServiceIcon";
import { Calculator, Wrench } from "lucide-react";
import { PageHeader, Badge } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";
import { getPrecos } from "@/lib/precos/store";
import { diasDesde } from "@/lib/precos/catalogo";
import { CalculadoraMaoDeObra } from "@/components/mao-de-obra/CalculadoraMaoDeObra";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const isAdmin = user.role === "admin";
  // O alerta de lista vencida aparece para TODO MUNDO, não só para quem edita:
  // quem monta a proposta precisa saber com que custo está orçando.
  const precos = await getPrecos();
  const diasPrecos = diasDesde(precos.atualizadoEm);
  /*
   * A visibilidade da calculadora é resolvida AQUI, no servidor, e não por um
   * `fetch` dentro do componente.
   *
   * A primeira versão se escondia sozinha enquanto esperava a API responder, e
   * qualquer tropeço nesse caminho deixava a tela idêntica à de quem não tem
   * permissão — sem card, sem erro, sem nada para investigar. Resolvido no
   * servidor, o card está no HTML da primeira pintura ou não está, e o motivo é
   * sempre a permissão.
   */
  const podeVerFinanceiro = await temPermissao(user, "financeiro.ver");

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={isAdmin} />
      <main className="app-container py-8">
        <PageHeader title="Nova proposta" subtitle="Escolha o serviço para gerar uma proposta comercial." />

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <Link
              key={s.key}
              href={`/nova/${s.key}`}
              className="group block h-full card p-4 transition hover:-translate-y-0.5 hover:border-gta-indigo hover:shadow-md sm:p-5 dark:hover:border-gta-indigo"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex rounded-lg bg-gta-indigo/10 p-2.5 text-gta-indigo dark:bg-gta-indigo/20 dark:text-indigo-300">
                  <ServiceIcon serviceKey={s.key} className="h-6 w-6" />
                </span>
                {s.emDesenvolvimento && <Badge tone="amber" dot>Em desenvolvimento</Badge>}
              </div>
              <div className="mt-3 font-semibold text-gta-navy group-hover:text-gta-indigo dark:text-slate-100">
                {s.label}
              </div>
              <p className="mt-1 subtitle">{s.description}</p>
            </Link>
          ))}
        </div>

        {/* Ferramentas — não geram proposta, ajudam a montar o preço. Ficam
            abaixo dos serviços, que é o que a maioria vem buscar. */}
        <h2 className="section-title mt-10">Ferramentas</h2>

        {podeVerFinanceiro && (
          <div className="mt-4">
            <Link
              href="/mao-de-obra"
              className="group flex items-start gap-4 card p-4 transition hover:-translate-y-0.5 hover:border-gta-indigo hover:shadow-md sm:p-5 dark:hover:border-gta-indigo"
            >
              <span className="inline-flex shrink-0 rounded-lg bg-gta-indigo/10 p-2.5 text-gta-indigo dark:bg-gta-indigo/20 dark:text-indigo-300">
                <Calculator className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <span className="font-semibold text-gta-navy group-hover:text-gta-indigo dark:text-slate-100">
                  Calculadora de mão de obra
                </span>
                <p className="mt-1 subtitle">
                  Quanto cobrar por um trabalho executado por equipe contratada. Gera uma planilha
                  com a conta aberta, em vez de proposta.
                </p>
              </div>
            </Link>
          </div>
        )}

        <div className="mt-4">
          <Link
            href="/precos"
            className={`group flex items-start gap-4 card p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${
              precos.revisaoPendente
                ? "border-amber-400 hover:border-amber-500 dark:border-amber-600"
                : "hover:border-gta-indigo dark:hover:border-gta-indigo"
            }`}
          >
            <span
              className={`inline-flex shrink-0 rounded-lg p-2.5 ${
                precos.revisaoPendente
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-gta-indigo/10 text-gta-indigo dark:bg-gta-indigo/20 dark:text-indigo-300"
              }`}
            >
              <Wrench className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gta-navy group-hover:text-gta-indigo dark:text-slate-100">
                  Preços de materiais
                </span>
                {precos.revisaoPendente && <Badge tone="amber" dot>Revisão pendente</Badge>}
              </div>
              <p className="mt-1 subtitle">
                {precos.revisaoPendente
                  ? `Os preços não são revisados há ${diasPrecos} dias. Enquanto isso, a margem das propostas é calculada sobre um custo que pode não existir mais.`
                  : `Custo unitário usado na lista de materiais. Revisado há ${diasPrecos} ${diasPrecos === 1 ? "dia" : "dias"}.`}
              </p>
            </div>
          </Link>
        </div>

        <p className="mt-10 hint">
          Cada proposta gerada é fiel ao modelo oficial da GTA Energia.
        </p>
      </main>
    </div>
  );
}
