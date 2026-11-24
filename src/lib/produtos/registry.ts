import type { LucideIcon } from "lucide-react";
import { Handshake, Wallet, Wrench } from "lucide-react";

/**
 * Registro central das ferramentas da plataforma.
 *
 * A conta é uma só, a marca é uma só, mas o trabalho é de três tipos: Operações
 * (configurar, precificar, aprovar e executar), CRM (prospectar, negociar e
 * fechar) e Financeiro (caixa, lançamentos e DRE). Cada ferramenta tem sua
 * própria navegação, e o cabeçalho monta o menu a partir daqui — acrescentar
 * um item é editar este arquivo, e só.
 *
 * Mesmo espírito do registro de serviços (src/services/registry.ts): um array
 * tipado que a interface consome automaticamente.
 */

export type ProdutoKey = "operacoes" | "crm" | "financeiro";

export interface ItemNav {
  href: string;
  label: string;
  /**
   * Só acende em correspondência exata. Necessário na rota "casa" de cada
   * ferramenta: sem isso, `/crm` acenderia junto com `/crm/funil`.
   */
  exato?: boolean;
  /** Prefixos extras que também acendem o item (ex.: `/nova` acende "Nova proposta"). */
  tambem?: string[];
}

export interface Produto {
  key: ProdutoKey;
  label: string;
  /** Uma linha, exibida no seletor abaixo do nome. */
  descricao: string;
  home: string;
  icone: LucideIcon;
  nav: ItemNav[];
  /** Item de engrenagem, fora do menu principal. */
  config?: ItemNav;
  /**
   * Só aparece para quem tem a marca correspondente no cadastro. O Financeiro
   * mostra caixa e retirada dos sócios: quem não tem acesso nem vê o atalho.
   */
  restrito?: "financeiro";
  /**
   * As abas moram na própria página (a faixa do artefato do Financeiro), e o
   * cabeçalho não repete o menu no desktop. A gaveta do celular continua
   * listando os itens.
   */
  navNaPagina?: boolean;
}

export const PRODUTOS: Produto[] = [
  {
    key: "operacoes",
    label: "Operações",
    descricao: "Propostas, aprovações, tarefas e apontamentos",
    home: "/",
    icone: Wrench,
    nav: [
      { href: "/", label: "Nova proposta", exato: true, tambem: ["/nova"] },
      { href: "/propostas", label: "Propostas" },
      { href: "/aprovacoes", label: "Aprovações" },
      { href: "/tarefas", label: "Tarefas" },
      { href: "/apontamentos", label: "Apontamentos" },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    descricao: "Funil de vendas, negociações, contatos e clientes",
    home: "/crm",
    icone: Handshake,
    nav: [
      { href: "/crm", label: "Início", exato: true },
      { href: "/crm/funil", label: "Funil" },
      { href: "/crm/negociacoes", label: "Negociações" },
      { href: "/crm/contatos", label: "Contatos" },
      // "Clientes", e não "Empresas" como no RD Station: é o nome que a GTA
      // sempre usou — a mesma entidade que os configuradores autocompletam.
      { href: "/crm/clientes", label: "Clientes" },
      { href: "/crm/tarefas", label: "Tarefas" },
      { href: "/crm/relatorios", label: "Relatórios" },
    ],
    config: { href: "/crm/configuracoes", label: "Configurações" },
  },
  {
    key: "financeiro",
    label: "Financeiro",
    descricao: "Fluxo de caixa, contas a pagar e receber, e DRE",
    home: "/financeiro",
    icone: Wallet,
    // As mesmas abas do artefato "GTA Controle Financeiro", mais o DRE.
    nav: [
      { href: "/financeiro", label: "Visão geral", exato: true },
      { href: "/financeiro/contas", label: "Contas fixas e a pagar" },
      { href: "/financeiro/dia-a-dia", label: "Dia a dia" },
      { href: "/financeiro/lancamentos", label: "Lançamentos" },
      { href: "/financeiro/graficos", label: "Gráficos" },
      { href: "/financeiro/dre", label: "DRE" },
    ],
    config: { href: "/financeiro/configuracoes", label: "Configurações" },
    restrito: "financeiro",
    navNaPagina: true,
  },
];

/** As ferramentas que esta pessoa enxerga no seletor. */
export function produtosVisiveis(acesso: { financeiro?: boolean }): Produto[] {
  return PRODUTOS.filter((p) => !p.restrito || acesso[p.restrito] === true);
}

/**
 * `true` se a rota está dentro do prefixo. Compara o segmento inteiro, e não o
 * texto: `/crmx` não pertence a `/crm`, e `/tarefas-outra` não pertence a
 * `/tarefas`.
 */
export function rotaSob(pathname: string, prefixo: string): boolean {
  if (prefixo === "/") return pathname === "/";
  return pathname === prefixo || pathname.startsWith(prefixo + "/");
}

/** O item do menu que deve aparecer aceso para a rota atual. */
export function itemAtivo(pathname: string, item: ItemNav): boolean {
  const casa = item.exato ? pathname === item.href : rotaSob(pathname, item.href);
  return casa || (item.tambem ?? []).some((p) => rotaSob(pathname, p));
}

/**
 * A ferramenta ativa vem da URL, não de estado guardado. Assim um link colado
 * no WhatsApp e um F5 abrem na ferramenta certa, sem localStorage nem cookie
 * para dessincronizar.
 */
export function produtoDaRota(pathname: string): Produto {
  if (rotaSob(pathname, "/crm")) return PRODUTOS.find((p) => p.key === "crm")!;
  if (rotaSob(pathname, "/financeiro")) return PRODUTOS.find((p) => p.key === "financeiro")!;
  return PRODUTOS.find((p) => p.key === "operacoes")!;
}

export function getProduto(key: ProdutoKey): Produto | undefined {
  return PRODUTOS.find((p) => p.key === key);
}
