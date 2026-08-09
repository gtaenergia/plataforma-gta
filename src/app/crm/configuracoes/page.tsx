import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Alert, Badge, PageHeader, SectionCard } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { temPermissao } from "@/lib/rbac/resolve";

/**
 * Configurações do CRM.
 *
 * As sete categorias e os itens de cada uma seguem a organização do RD Station
 * CRM. Alguns itens já existem na plataforma e apontam para a tela que os
 * atende hoje (usuários e cargos, em Administração); o resto está declarado
 * para as próximas entregas — a tela serve de índice do que o CRM terá.
 *
 * Esta página monta a casca à mão, em vez de usar `CrmShell`, porque precisa do
 * usuário para decidir o que mostrar: pedir o usuário duas vezes seria uma
 * consulta a mais por visita.
 */

interface ItemConfig {
  label: string;
  descricao: string;
  /** Presente = a tela existe hoje. Ausente = ainda não implementado. */
  href?: string;
  /** Só aparece para administrador. */
  admin?: boolean;
  /** Exige `crm.configurar` — sem ela, o item aparece explicando por quê. */
  configurar?: boolean;
}

const CATEGORIAS: { titulo: string; subtitulo: string; itens: ItemConfig[] }[] = [
  {
    titulo: "Seu time",
    subtitulo: "Quem usa o CRM, o que cada um pode fazer e o que cada um enxerga.",
    itens: [
      { label: "Usuários", descricao: "Cadastrar, ativar e desativar quem acessa a plataforma.", href: "/admin/usuarios", admin: true },
      { label: "Cargos e permissões", descricao: "O que cada cargo pode fazer. “Configurar o CRM” é a permissão que guarda esta tela.", href: "/admin/cargos", admin: true },
      { label: "Equipes", descricao: "Agrupar vendedores em equipes, para meta e relatório por time." },
      { label: "Níveis de visibilidade", descricao: "Restrito, Equipe ou Geral — o quanto cada pessoa enxerga das negociações." },
    ],
  },
  {
    titulo: "Configure seu processo de venda",
    subtitulo: "O desenho do funil e os campos que cada negociação precisa carregar.",
    itens: [
      { label: "Funis de venda", descricao: "Criar funis e ordenar as etapas de cada um (até 12 etapas).", href: "/crm/configuracoes/funis", configurar: true },
      {
        label: "Campos personalizados",
        descricao:
          "O que a negociação de engenharia carrega além do padrão: potência, distribuidora, classe de tensão, UC. Texto, número, data e escolha — com obrigatoriedade sempre ou só para entrar numa etapa.",
        href: "/crm/configuracoes/campos",
        configurar: true,
      },
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
      {
        label: "Integração com Operações",
        descricao:
          "Já no ar: na ficha da negociação, “Pedir proposta” cria a tarefa em Operações com o serviço, o prazo e o responsável indicado — e o valor volta sozinho quando a proposta é gerada e quando é aprovada. Vincule cada produto a um serviço em Produtos e serviços.",
        href: "/crm/configuracoes/produtos",
        configurar: true,
      },
    ],
  },
  {
    titulo: "Ajustes da conta",
    subtitulo: "As listas que alimentam os campos de escolha das negociações.",
    itens: [
      { label: "Fontes", descricao: "De onde a negociação veio, para medir o retorno de cada ação.", href: "/crm/configuracoes/fontes", configurar: true },
      { label: "Produtos e serviços", descricao: "O catálogo do que se vende, com preço base. Itens fora de linha são ocultados, nunca excluídos.", href: "/crm/configuracoes/produtos", configurar: true },
      { label: "Segmentos", descricao: "Área de atuação das empresas." },
      { label: "Motivo de perda", descricao: "Por que a negociação não foi ganha. Toda perda exige um motivo.", href: "/crm/configuracoes/motivos-perda", configurar: true },
      { label: "Informações pré-definidas", descricao: "Textos e valores que já vêm preenchidos ao criar uma negociação." },
      { label: "Modelos de e-mail", descricao: "Mensagens prontas para enviar a partir da negociação." },
    ],
  },
  {
    titulo: "Avançado",
    subtitulo: "Entrada de dados, metas e o que sai da plataforma.",
    itens: [
      { label: "Importar dados", descricao: "Trazer empresas, contatos e negociações de planilha ou de outro CRM." },
      { label: "Metas", descricao: "Objetivo de venda por vendedor e por equipe, para comparar com o realizado nos relatórios." },
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
  const podeConfigurar = await temPermissao(user, "crm.configurar");

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

        {/* Dizer ANTES, e não no 403: quem não pode configurar precisa saber a
            quem pedir, não descobrir a trava ao clicar. */}
        {!podeConfigurar && (
          <Alert tone="indigo" className="mb-4" titulo="Você pode consultar, não alterar.">
            Mudar funil, fontes, motivos de perda ou o catálogo altera o processo de toda a equipe, e depende da
            permissão <strong>“Configurar funis, etapas, fontes, motivos de perda e produtos”</strong>. Peça a um
            administrador em Cargos e permissões.
          </Alert>
        )}

        <div className="space-y-4">
          {CATEGORIAS.map((c) => {
            const itens = c.itens.filter((i) => !i.admin || isAdmin);
            if (itens.length === 0) return null;
            return (
              <SectionCard key={c.titulo} title={c.titulo} subtitle={c.subtitulo}>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {itens.map((i) => (
                    <ItemCartao key={i.label} item={i} podeConfigurar={podeConfigurar} />
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

function ItemCartao({ item, podeConfigurar }: { item: ItemConfig; podeConfigurar: boolean }) {
  const trancado = !!item.configurar && !podeConfigurar;
  const navegavel = !!item.href && !trancado;

  const corpo = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${trancado ? "text-slate-500 dark:text-slate-400" : "text-gta-navy dark:text-slate-100"}`}>
          {item.label}
        </span>
        {trancado ? (
          <span className="hint flex shrink-0 items-center gap-1">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Sem permissão
          </span>
        ) : item.href ? (
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <Badge tone="amber" dot>Em desenvolvimento</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.descricao}</p>
    </>
  );

  if (navegavel) {
    return (
      <Link
        href={item.href!}
        className="block rounded-lg border border-slate-200 p-3 transition hover:border-gta-indigo hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
      >
        {corpo}
      </Link>
    );
  }
  return <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">{corpo}</div>;
}
