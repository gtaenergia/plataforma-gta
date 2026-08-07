import Link from "next/link";
import { CrmShell } from "@/components/crm/CrmShell";
import { EmBreve } from "@/components/crm/EmBreve";
import { SectionCard } from "@/components/ui";
import { getProduto } from "@/lib/produtos/registry";

export default async function CrmInicioPage() {
  const crm = getProduto("crm")!;
  const atalhos = [...crm.nav.filter((i) => i.href !== "/crm"), crm.config!];

  return (
    <CrmShell
      titulo="CRM"
      subtitulo="A ferramenta comercial da GTA: do primeiro contato ao fechamento. Empresas, contatos, negociações no funil e as tarefas de cada uma."
    >
      <div className="space-y-4">
        <SectionCard title="Onde ir" subtitle="As telas do CRM. Empresas já está no ar; as demais chegam nas próximas entregas.">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {atalhos.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-gta-navy transition hover:border-gta-indigo hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {i.label}
              </Link>
            ))}
          </div>
        </SectionCard>

        <EmBreve
          titulo="Painel do CRM"
          descricao="O resumo do momento comercial, na abertura da ferramenta."
          itens={[
            "Indicadores do período: negociações abertas, valor em funil, ganhas, perdidas e ticket médio",
            "As suas tarefas de hoje e as atrasadas, com um clique para concluir ou adiar",
            "As negociações que mais tempo estão paradas na mesma etapa",
            "Desempenho contra a meta do mês, por vendedor e por equipe",
          ]}
        />
      </div>
    </CrmShell>
  );
}
