import { notFound } from "next/navigation";
import { getService } from "@/services/registry";
import { BackLink } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ServiceIcon } from "@/components/ServiceIcon";
import { requirePageUser } from "@/lib/session";
import { SERVICOS_COM_AJUDA } from "@/components/ajuda/disponivel";
import { SolarAjuda } from "@/components/ajuda/SolarAjuda";
import { CarregadorAjuda } from "@/components/ajuda/CarregadorAjuda";
import { SpdaAjuda } from "@/components/ajuda/SpdaAjuda";
import { ProjetoBtAjuda } from "@/components/ajuda/ProjetoBtAjuda";
import { SubestacaoAjuda } from "@/components/ajuda/SubestacaoAjuda";
import { ExecucaoSubestacaoAjuda } from "@/components/ajuda/ExecucaoSubestacaoAjuda";
import { RedeMtAjuda } from "@/components/ajuda/RedeMtAjuda";
import { QgbtAjuda } from "@/components/ajuda/QgbtAjuda";
import { ConexaoAjuda } from "@/components/ajuda/ConexaoAjuda";
import { AnalisadorAjuda } from "@/components/ajuda/AnalisadorAjuda";
import { LaudoAjuda } from "@/components/ajuda/LaudoAjuda";
import { LimpezaAjuda } from "@/components/ajuda/LimpezaAjuda";
import { MaoDeObraAjuda } from "@/components/ajuda/MaoDeObraAjuda";

/** Conteúdo da ajuda por serviço. Adicione um case ao criar o componente. */
function conteudoAjuda(servico: string) {
  switch (servico) {
    case "solar":
      return <SolarAjuda />;
    case "carregador":
      return <CarregadorAjuda />;
    case "spda":
      return <SpdaAjuda />;
    case "projeto-bt":
      return <ProjetoBtAjuda />;
    case "projeto-subestacao":
      return <SubestacaoAjuda />;
    case "execucao-subestacao":
      return <ExecucaoSubestacaoAjuda />;
    case "rede-mt":
      return <RedeMtAjuda />;
    case "qgbt":
      return <QgbtAjuda />;
    case "conexao":
      return <ConexaoAjuda />;
    case "analisador":
      return <AnalisadorAjuda />;
    case "laudo-inspecao":
      return <LaudoAjuda />;
    case "limpeza":
      return <LimpezaAjuda />;
    case "mao-de-obra":
      return <MaoDeObraAjuda />;
    default:
      return null;
  }
}

export default async function AjudaServicoPage({ params }: { params: Promise<{ servico: string }> }) {
  const { servico } = await params;
  const service = getService(servico);
  if (!service || !SERVICOS_COM_AJUDA.has(servico)) notFound();
  const conteudo = conteudoAjuda(servico);
  if (!conteudo) notFound();

  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container-leitura py-8">
        <div className="mb-6">
          <BackLink href={`/nova/${servico}`}>Voltar ao configurador</BackLink>
          <h1 className="page-title mt-2 flex flex-wrap items-center gap-2.5">
            <ServiceIcon serviceKey={service.key} className="h-7 w-7 shrink-0 text-gta-indigo dark:text-indigo-300" />
            Como precificar — {service.label}
          </h1>
          <p className="mt-1 subtitle">Tutorial, fórmulas e valores padrão de precificação deste serviço.</p>
        </div>
        {conteudo}
      </main>
    </div>
  );
}
