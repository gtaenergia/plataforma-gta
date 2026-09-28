import type { User } from "./types";

/**
 * Quem pode ser responsável no CRM (puro, sem I/O).
 *
 * O seletor de responsável listava TODOS os usuários ativos: a negociação
 * podia nascer em nome do engenheiro de campo, e o follow-up ir para quem nunca
 * abre o CRM. A marcação "Equipe comercial", no cadastro de usuários, é que diz
 * quem recebe venda.
 */

export interface OpcaoResponsavel {
  email: string;
  name: string;
}

export interface EquipeComercial {
  usuarios: OpcaoResponsavel[];
  /**
   * `false` quando ninguém foi marcado ainda — e a lista é a de todos os
   * ativos. Sem essa volta, o dia da publicação deixaria todos os seletores do
   * CRM vazios até alguém lembrar de marcar a equipe; a tela usa o sinal para
   * explicar de onde vem a lista.
   */
  marcada: boolean;
}

export function equipeComercial(usuarios: readonly Pick<User, "email" | "name" | "active" | "comercial">[]): EquipeComercial {
  const ativos = usuarios.filter((u) => u.active);
  const marcados = ativos.filter((u) => u.comercial);
  const base = marcados.length > 0 ? marcados : ativos;
  return {
    usuarios: base
      .map((u) => ({ email: u.email, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    marcada: marcados.length > 0,
  };
}

/**
 * O responsável que um formulário novo já traz marcado.
 *
 * Quem está criando, se ele estiver na lista; senão, o primeiro da lista. O
 * formulário antigo usava sempre quem estava logado — mas, com a lista
 * restrita ao comercial, o `<select>` mostraria o primeiro nome enquanto o
 * valor guardado era outro, e a negociação seria gravada sem responsável.
 */
export function responsavelPadrao(opcoes: readonly OpcaoResponsavel[], usuarioAtual: string): string {
  const atual = usuarioAtual.trim().toLowerCase();
  const doAtual = opcoes.find((o) => o.email.trim().toLowerCase() === atual);
  return doAtual?.email ?? opcoes[0]?.email ?? usuarioAtual;
}
