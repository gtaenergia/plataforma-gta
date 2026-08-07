import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge, PageHeader, SectionCard } from "@/components/ui";
import { requirePageUser } from "@/lib/session";

/**
 * Configurações do CRM.
 *
 * As sete categorias e os itens de cada uma seguem a organização do RD Station
 * CRM. Alguns itens já existem na plataforma e apontam para a tela que os
 * atende hoje (usuários e cargos, em Administração); o resto está declarado
 * para as próximas entregas — a tela serve de índice do que o CRM terá.
 *
 * Esta página monta a casca à mão, em vez de usar `CrmShell`, porque precisa do
 * usuário para decidir se mostra os itens de administração: pedir o usuário
 * duas vezes seria uma consulta a mais por visita.
 */

interface ItemConfig {
  label: string;
  descricao: string;
  /** Presente = a tela existe hoje. Ausente = ainda não implementado. */
  href?: string;
  /** Só aparece para administrador. */
  admin?: boolean;
}

const CATEGORIAS: { titulo: string; subtitulo: string; itens: ItemConfig[] }[] = [
  {
    titulo: "Seu time",
    subtitulo: "Quem usa o CRM, o que cada um pode fazer e o que cada um enxerga.",
    itens: [
      { label: "Usuários", descricao: "Cadastrar, ativar e desativar quem acessa a plataforma.", href: "/admin/usuarios", admin: true },
      { label: "Cargos e permissões", descricao: "O que cada cargo pode fazer, inclusive no CRM.", href: "/admin/cargos", admin: true },
      { label: "Equipes", descricao: "Agrupar vendedores em equipes, para meta e relatório por time." },
      { label: "Níveis de visibilidade", descricao: "Restrito, Equipe ou Geral — o quanto cada pessoa enxerga das negociações." },
    ],
  },
  {
    titulo: "Configure seu processo de venda",
    subtitulo: "O desenho do funil e os campos que cada negociação precisa carregar.",
    itens: [
      { label: "Funis de venda", descricao: "Criar funis e ordenar as etapas de cada um (até 12 etapas).", href: "/crm/configuracoes/funis" },
      { label: "Configurar campos", descricao: "Campos personalizados de negociação, contato, empresa e produto: texto, data, escolha única e múltipla, com obrigatoriedade por etapa." },
    ],
  },
  {
    titulo: "Automatize processos",
    subtitulo: "Regras que executam o processo sem depender de alguém lembrar.",
    itens: [
      { label: "Automação de vendas", descricao: "Gatilhos que criam tarefa, enviam e-mail, trocam o responsável ou movem a negociação de etapa." },
    ],
  },
  {
    titulo: "Ferramentas GTA",
    subtitulo: "Como o CRM conversa com a outra ferramenta da conta.",
    itens: [
      { label: "Integração com Operações", descricao: "Negociação ganha gera orçamento; proposta enviada entra no histórico da negociação." },
    ],
  },
  {
    titulo: "Ajustes da conta",
    subtitulo: "As listas que alimentam os campos de escolha das negociações.",
    itens: [
      { label: "Fontes", descricao: "De onde a negociação veio, para medir o retorno de cada ação.", href: "/crm/configuracoes/fontes" },
      { label: "Produtos e serviços", descricao: "O catálogo do que se vende, com preço base. Itens fora de linha são ocultados, nunca excluídos.", href: "/crm/configuracoes/produtos" },
      { label: "Segmentos", descricao: "Área de atuação das empresas." },
      { label: "Motivo de perda", descricao: "Por que a negociação não foi ganha. Toda perda exige um motivo.", href: "/crm/configuracoes/motivos-perda" },
      { label: "Informações pré-definidas", descricao: "Textos e valores que já vêm preenchidos ao criar uma negociação." },
      { label: "Modelos de e-mail", descricao: "Mensagens prontas para enviar a partir da negociação." },
    ],
  },
  {
    titulo: "Avançado",
    subtitulo: "Entrada de dados, metas e o que sai da plataforma.",
    itens: [
      { label: "Importar dados", descricao: "Trazer empresas, contatos e negociações de planilha ou de outro CRM." },
      { label: "Metas", descricao: "Objetivo de venda por vendedor e por equipe, base do relatório de desempenho." },
      { label: "Multi-vendas", descricao: "Registrar mais de uma venda na mesma negociação." },
      { label: "Preferências", descricao: "Comportamento padrão do CRM na conta." },
      { label: "Preferências regionais", descricao: "Moeda, formato de data e fuso horário." },
      { label: "Integrações", descricao: "Webhooks e conexão com outras ferramentas." },
      { label: "Privacidade de dados", descricao: "Base legal do contato e tratamento de dados pessoais (LGPD)." },
      { label: "Venda pelo WhatsApp", descricao: "Registrar a conversa do WhatsApp no histórico da negociação." },
    ],
  },
  {
    titulo: "Acompanhamento do administrador",
    subtitulo: "O rastro do que foi tirado ou alterado em massa.",
    itens: [
      { label: "Gerenciamento de exportações", descricao: "Quem exportou o quê, e quando." },
      { label: "Gerenciamento de ações em massa", descricao: "Histórico das alterações aplicadas a muitos registros de uma vez." },
      { label: "Lixeira", descricao: "Registros excluídos, com prazo para restaurar." },
    ],
  },
];

export default async function CrmConfiguracoesPage() {
  const user = await requirePageUser();
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={isAdmin} />
      <main className="app-container py-8">
        <div className="mb-6">
          <PageHeader
            title="Configurações do CRM"
            subtitle="O processo comercial da GTA descrito na ferramenta: funil e etapas, campos, listas de escolha, equipes e o que cada pessoa enxerga."
          />
        </div>

        <div className="space-y-4">
          {CATEGORIAS.map((c) => {
            const itens = c.itens.filter((i) => !i.admin || isAdmin);
            if (itens.length === 0) return null;
            return (
              <SectionCard key={c.titulo} title={c.titulo} subtitle={c.subtitulo}>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {itens.map((i) => (
                    <ItemCartao key={i.label} item={i} />
                  ))}
                </div>
              </SectionCard>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function ItemCartao({ item }: { item: ItemConfig }) {
  const corpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gta-navy dark:text-slate-100">{item.label}</span>
        {item.href ? (
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <Badge tone="amber" dot>Em desenvolvimento</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.descricao}</p>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block rounded-lg border border-slate-200 p-3 transition hover:border-gta-indigo hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
      >
        {corpo}
      </Link>
    );
  }
  return <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">{corpo}</div>;
}
