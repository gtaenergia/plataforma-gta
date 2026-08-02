import type { Task } from "@/lib/tasks/types";
import { notificar } from "@/lib/notificacoes/store";
import { getConfigCapacidade } from "./config";
import {
  capacidadeDe,
  entraNaFila,
  estimativaDaTarefa,
  folgaNaJanela,
  OCUPACAO_LIMITE_PCT,
} from "./motor";
import { DIAS_JANELA_CURTA, fimJanelaCurta, type Ymd } from "./datas";

/**
 * Avisa quando uma tarefa nova acabou de estourar a semana de quem vai
 * executá-la.
 *
 * Dispara só na TRAVESSIA (estava abaixo de 100%, passou de 100%). Notificar a
 * cada tarefa de uma agenda já cheia transformaria o alerta em ruído, e a
 * décima notificação de "você está sobrecarregado" não informa nada que a
 * primeira não tenha informado.
 *
 * Só o responsável recebe. Quem criou já viu o aviso em âmbar no formulário,
 * antes de salvar — repetir por notificação seria contar duas vezes a mesma
 * coisa para a mesma pessoa.
 *
 * Somente servidor (lê a configuração) e best-effort: roda dentro de `after()`,
 * então uma falha aqui não pode derrubar a criação da tarefa, que já foi
 * respondida com sucesso.
 */

/** Data de hoje no fuso de operação da GTA — o servidor roda em UTC. */
function hojeNoBrasil(): Ymd {
  // "en-CA" formata como yyyy-mm-dd, que é exatamente o formato do domínio.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export async function avisarSeEstourou(nova: Task, antesDaCriacao: Task[]): Promise<void> {
  try {
    if (!nova.responsavel) return;

    const config = await getConfigCapacidade();
    const capacidade = capacidadeDe(config, nova.responsavel);
    if (capacidade.minutosPorDia <= 0) return;

    const hoje = hojeNoBrasil();
    const ate = fimJanelaCurta(hoje);
    const daPessoa = antesDaCriacao.filter((t) => t.responsavel === nova.responsavel && entraNaFila(t.status));
    const pendenteAntes = daPessoa.reduce((s, t) => s + estimativaDaTarefa(t, config).minutos, 0);
    const desta = estimativaDaTarefa(nova, config).minutos;
    if (desta <= 0) return;

    const antes = folgaNaJanela({ capacidade, config, de: hoje, ate, pendenteMin: pendenteAntes });
    const depois = folgaNaJanela({ capacidade, config, de: hoje, ate, pendenteMin: pendenteAntes + desta });
    if (antes.ocupacaoPct === null || depois.ocupacaoPct === null) return;
    if (!(antes.ocupacaoPct < OCUPACAO_LIMITE_PCT && depois.ocupacaoPct >= OCUPACAO_LIMITE_PCT)) return;

    const h = (min: number) => (min / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    await notificar({
      paraEmail: nova.responsavel,
      tipo: "capacidade_estourada",
      titulo: "Carga de trabalho acima da capacidade",
      mensagem:
        `Com a inclusão de “${nova.titulo}”, sua demanda em aberto soma ${h(depois.comprometidoMin)} h ` +
        `para uma capacidade de ${h(depois.capacidadeMin)} h nos próximos ${DIAS_JANELA_CURTA} dias ` +
        `(${Math.round(depois.ocupacaoPct)}%). Recomenda-se revisar prioridades ou solicitar a ` +
        `redistribuição da demanda.`,
      link: "/tarefas",
    });
  } catch (e) {
    console.error("Capacidade: falha ao avaliar estouro —", e);
  }
}
