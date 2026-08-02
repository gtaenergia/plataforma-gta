import { prioridadeLabel, statusLabel, type Prioridade, type StatusTarefa } from "@/lib/tasks/types";

/**
 * Marcadores de prioridade e status.
 *
 * Ponto colorido + texto, em vez de pílula de fundo colorido. O ponto dá a
 * leitura por varredura — os três níveis se distinguem sem ler —, e o texto
 * fica no tom normal da tabela, legível. A pílula fazia o contrário: pintava a
 * linha inteira de cor e deixava o rótulo em corpo pequeno sobre fundo tingido.
 *
 * Cor é redundante de propósito: o rótulo sempre acompanha, para quem não
 * distingue vermelho de âmbar continuar lendo a informação.
 */

const PONTO_PRIORIDADE: Record<Prioridade, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baixa: "bg-slate-400 dark:bg-slate-500",
};

const TEXTO_PRIORIDADE: Record<Prioridade, string> = {
  alta: "font-medium text-slate-800 dark:text-slate-100",
  media: "text-slate-700 dark:text-slate-300",
  baixa: "text-slate-500 dark:text-slate-400",
};

export function MarcaPrioridade({ valor, className = "" }: { valor: Prioridade; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO_PRIORIDADE[valor]}`} aria-hidden />
      <span className={TEXTO_PRIORIDADE[valor]}>{prioridadeLabel(valor)}</span>
    </span>
  );
}

const PONTO_STATUS: Record<StatusTarefa, string> = {
  afazer: "bg-slate-400 dark:bg-slate-500",
  andamento: "bg-gta-indigo dark:bg-indigo-400",
  atraso: "bg-red-500",
  continuo: "bg-amber-500",
  concluida: "bg-green-500",
};

export function MarcaStatus({ valor, className = "" }: { valor: StatusTarefa; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO_STATUS[valor]}`} aria-hidden />
      <span className="text-slate-700 dark:text-slate-300">{statusLabel(valor)}</span>
    </span>
  );
}

/** O ponto sozinho, para dentro de controles que já têm o rótulo (ex.: seletor). */
export function PontoStatus({ valor }: { valor: StatusTarefa }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO_STATUS[valor]}`} aria-hidden />;
}
