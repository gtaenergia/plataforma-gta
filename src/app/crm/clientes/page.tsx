import { ClientesList } from "@/components/clientes/ClientesList";
import { CrmShell } from "@/components/crm/CrmShell";

/**
 * Clientes do CRM.
 *
 * É o cadastro que antes ficava em `/clientes`, dentro de Operações. A tabela e
 * a rota de API não mudaram — os configuradores continuam preenchendo o cliente
 * pelo mesmo `/api/clientes`. O que mudou foi o lugar: o cliente é a entidade
 * de onde saem as negociações, e por isso pertence ao CRM. A aba chegou a se
 * chamar "Empresas" (o nome do RD Station); voltou a "Clientes" porque é assim
 * que a GTA sempre chamou — `/clientes` e `/crm/empresas` redirecionam para cá
 * (next.config.mjs).
 *
 * Aqui, diferente de Operações, o nome leva à FICHA do cliente: negociações
 * abertas, quanto já se fechou e com quem falar.
 */
export default async function CrmClientesPage() {
  return (
    <CrmShell
      titulo="Clientes"
      subtitulo="A entidade de onde saem as negociações — cliente atual ou possível. Clique no nome para ver tudo o que existe com ele."
    >
      <ClientesList fichaBase="/crm/clientes" />
    </CrmShell>
  );
}
