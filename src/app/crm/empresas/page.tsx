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
 */
export default async function CrmEmpresasPage() {
  return (
    <CrmShell
      titulo="Empresas"
      subtitulo="A entidade de onde saem as negociações — cliente atual ou possível. Dados de contato, endereço e segmento; também alimenta o preenchimento das propostas em Operações."
    >
      <ClientesList />
    </CrmShell>
  );
}
