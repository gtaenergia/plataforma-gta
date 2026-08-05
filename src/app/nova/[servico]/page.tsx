import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { getService } from "@/services/registry";
import { SERVICOS_COM_AJUDA } from "@/components/ajuda/disponivel";
import { AppHeader } from "@/components/AppHeader";
import { Alert, BackLink } from "@/components/ui";
import { DynamicForm } from "@/components/DynamicForm";
import { SolarConfigurator } from "@/components/solar/SolarConfigurator";
import { SubestacaoConfigurator } from "@/components/subestacao/SubestacaoConfigurator";
import { CarregadorConfigurator } from "@/components/carregador/CarregadorConfigurator";
import { SpdaConfigurator } from "@/components/spda/SpdaConfigurator";
import { ExecucaoSubestacaoConfigurator } from "@/components/execucao-subestacao/ExecucaoSubestacaoConfigurator";
import { RedeMtConfigurator } from "@/components/rede-mt/RedeMtConfigurator";
import { QgbtConfigurator } from "@/components/qgbt/QgbtConfigurator";
import { ProjetoBtConfigurator } from "@/components/projeto-bt/ProjetoBtConfigurator";
import { ServicoSimplesConfigurator } from "@/components/ServicoSimplesConfigurator";
import { ServicoHoraConfigurator } from "@/components/servico-hora/ServicoHoraConfigurator";
import { ServiceIcon } from "@/components/ServiceIcon";
import { requirePageUser } from "@/lib/session";

export default async function NovaPropostaPage({
  params,
  searchParams,
}: {
  params: Promise<{ servico: string }>;
  searchParams: Promise<{ proposta?: string }>;
}) {
  const { servico } = await params;
  const { proposta } = await searchParams;
  const service = getService(servico);
  if (!service) notFound();

  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <div className="flex items-center justify-between gap-2">
            <BackLink href="/">Voltar</BackLink>
            {SERVICOS_COM_AJUDA.has(service.key) && (
              <Link href={`/ajuda/${service.key}`} target="_blank" className="btn-ghost">
                <HelpCircle className="h-4 w-4" />
                Como precificar
              </Link>
            )}
          </div>
          <h1 className="page-title mt-2 flex flex-wrap items-center gap-2.5">
            <ServiceIcon serviceKey={service.key} className="h-7 w-7 shrink-0 text-gta-indigo dark:text-indigo-300" />
            {service.label}
          </h1>
          <p className="mt-1 subtitle">{service.description}</p>
        </div>

        {service.emDesenvolvimento && (
          <Alert tone="amber" titulo="Serviço em desenvolvimento." className="mb-6">
            A precificação automática e o layout da proposta ainda estão sendo ajustados ao padrão da plataforma (como Solar, Carregador e SPDA). O documento é gerado normalmente — confira os valores antes de enviar.
          </Alert>
        )}

        {service.key === "solar" ? (
          <SolarConfigurator propostaId={proposta} />
        ) : service.key === "projeto-subestacao" ? (
          <SubestacaoConfigurator propostaId={proposta} />
        ) : service.key === "carregador" ? (
          <CarregadorConfigurator propostaId={proposta} />
        ) : service.key === "spda" ? (
          <SpdaConfigurator propostaId={proposta} />
        ) : service.key === "execucao-subestacao" ? (
          <ExecucaoSubestacaoConfigurator propostaId={proposta} />
        ) : service.key === "rede-mt" ? (
          <RedeMtConfigurator propostaId={proposta} />
        ) : service.key === "qgbt" ? (
          <QgbtConfigurator propostaId={proposta} />
        ) : service.key === "projeto-bt" ? (
          <ProjetoBtConfigurator propostaId={proposta} />
        ) : service.key === "servico-hora" ? (
          <ServicoHoraConfigurator propostaId={proposta} />
        ) : ["conexao", "analisador", "laudo-inspecao", "limpeza"].includes(service.key) ? (
          <ServicoSimplesConfigurator serviceKey={service.key} propostaId={proposta} />
        ) : (
          <DynamicForm serviceKey={service.key} serviceLabel={service.label} formSchema={service.formSchema} />
        )}
      </main>
    </div>
  );
}
