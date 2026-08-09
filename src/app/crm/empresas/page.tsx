import { ClientesList } from "@/components/clientes/ClientesList";
import { CrmShell } from "@/components/crm/CrmShell";

/**
 * Empresas do CRM.
 *
 * É o cadastro que antes ficava em `/clientes`, dentro de Operações. A tabela e
 * a rota de API não mudaram — os configuradores continuam preenchendo o cliente
 * pelo mesmo `/api/clientes`. O que mudou foi o lugar: no modelo do RD Station,
 * a Empresa é a entidade de onde saem as negociações, e por isso pertence ao
 * CRM. Quem tiver `/clientes` nos favoritos é redirecionado (next.config.mjs).
 *
 * Aqui, diferente de Operações, o nome leva à FICHA da empresa: negociações
 * abertas, quanto já se fechou e com quem falar.
 */
export default async function CrmEmpresasPage() {
  return (
    <CrmShell
      titulo="Empresas"
      subtitulo="A entidade de onde saem as negociações — cliente atual ou possível. Clique no nome para ver tudo o que existe com ela."
    >
      <ClientesList hrefFicha={(c) => `/crm/empresas/${c.id}`} />
    </CrmShell>
  );
}
