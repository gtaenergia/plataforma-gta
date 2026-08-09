import type { Negociacao, TarefaCrm } from "./types";
import { TIPO_TAREFA_LABEL } from "./types";

/**
 * O que cobrar de cada pessoa na manhã seguinte (puro, sem I/O).
 *
 * A disciplina que faz um CRM funcionar não é a tela: é a cobrança. No RD
 * Station a regra é "toda negociação em aberto tem sempre uma próxima tarefa
 * agendada", e o produto insiste nisso. Aqui o aviso saía só na criação — a
 * tarefa vencia e ficava vermelha esperando alguém abrir a tela. Quem vende
 * passa o dia em campo; o que não é cobrado, não acontece.
 *
 * Dois sinais, um recado só por pessoa:
 *
 * - **tarefas vencidas** — o compromisso passou da data e não foi concluído;
 * - **negociações sem próximo passo** — em aberto, sem nenhuma tarefa
 *   pendente. É o buraco silencioso: nada avisa, e a negociação apodrece na
 *   etapa até alguém reparar.
 *
 * Um recado por pessoa, e não um por item, de propósito: dez notificações às
 * 7h da manhã ensinam a ignorar o sino.
 */

export interface Cobranca {
  email: string;
  nome: string;
  vencidas: TarefaCrm[];
  /** Em aberto e sem tarefa pendente — ordenadas da mais parada para a menos. */
  semProximoPasso: Negociacao[];
}

/** `hoje` em YYYY-MM-DD chega de fora: mantém a função testável com data fixa. */
export function cobrancasDoDia(
  negociacoes: readonly Negociacao[],
  tarefas: readonly TarefaCrm[],
  hoje: string,
): Cobranca[] {
  const pendentes = tarefas.filter((t) => !t.concluida);
  const comTarefaPendente = new Set(pendentes.map((t) => t.negociacaoId));

  const porPessoa = new Map<string, Cobranca>();
  const de = (email: string, nome: string): Cobranca => {
    const chave = email.trim().toLowerCase();
    if (!porPessoa.has(chave)) porPessoa.set(chave, { email, nome: nome || email, vencidas: [], semProximoPasso: [] });
    return porPessoa.get(chave)!;
  };

  for (const t of pendentes) {
    // Vencida é a de ONTEM para trás. A de hoje ainda pode ser feita hoje —
    // cobrá-la de manhã seria cobrar antes da hora.
    if (t.data && t.data < hoje && t.responsavel) {
      de(t.responsavel, t.responsavelNome).vencidas.push(t);
    }
  }

  const emAberto = negociacoes.filter((n) => n.situacao === "aberta");
  for (const n of emAberto) {
    if (comTarefaPendente.has(n.id)) continue;
    // Pausada fica de fora: pausar é dizer "não mexa agora", e cobrar quem já
    // avisou que ia esperar é ruído.
    const dono = n.responsavel || n.criadoPor;
    if (dono) de(dono, n.responsavelNome || n.criadoPorNome || "").semProximoPasso.push(n);
  }

  for (const c of porPessoa.values()) {
    c.vencidas.sort((a, b) => a.data.localeCompare(b.data));
    // Mais parada primeiro: é a que corre mais risco de já ter esfriado.
    c.semProximoPasso.sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm));
  }

  return Array.from(porPessoa.values())
    .filter((c) => c.vencidas.length > 0 || c.semProximoPasso.length > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O texto do recado. Curto: ele chega no sino e no celular. */
export function textoDaCobranca(c: Cobranca): { titulo: string; mensagem: string } {
  const partes: string[] = [];

  if (c.vencidas.length > 0) {
    const exemplo = c.vencidas[0];
    partes.push(
      c.vencidas.length === 1
        ? `1 tarefa atrasada: ${TIPO_TAREFA_LABEL[exemplo.tipo]} — ${exemplo.assunto} (${exemplo.negociacaoNome}).`
        : `${c.vencidas.length} tarefas atrasadas, a mais antiga de ${dataBR(exemplo.data)}: ${exemplo.assunto}.`,
    );
  }

  if (c.semProximoPasso.length > 0) {
    const nomes = c.semProximoPasso.slice(0, 2).map((n) => `"${n.nome}"`).join(", ");
    const resto = c.semProximoPasso.length > 2 ? ` e mais ${c.semProximoPasso.length - 2}` : "";
    partes.push(
      `${c.semProximoPasso.length} ${c.semProximoPasso.length === 1 ? "negociação" : "negociações"} sem próximo passo agendado: ${nomes}${resto}.`,
    );
  }

  const titulo =
    c.vencidas.length > 0 && c.semProximoPasso.length > 0
      ? "Seu comercial precisa de atenção"
      : c.vencidas.length > 0
        ? c.vencidas.length === 1 ? "Você tem 1 tarefa atrasada" : `Você tem ${c.vencidas.length} tarefas atrasadas`
        : "Negociações sem próximo passo";

  return { titulo, mensagem: partes.join(" ") };
}

function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}
