import { z } from "zod";

/**
 * Modelo do Tracker (registro de horas), inspirado no Clockify: cronômetro
 * ao vivo + lançamento manual, vinculado opcionalmente a uma Tarefa existente.
 */

export interface TimeEntry {
  id: string;
  /** Dono do lançamento — vem da sessão, nunca do cliente. */
  usuarioEmail: string;
  descricao: string;
  /** Vínculo opcional com uma Tarefa (src/lib/tasks). Ausente = lançamento avulso. */
  tarefaId?: string;
  /** Cliente do lançamento — herdado da tarefa vinculada, ou texto livre se avulso. */
  cliente: string;
  categoria: string;
  tags: string[];
  /** ISO datetime. */
  inicio: string;
  /** ISO datetime. Ausente = cronômetro em andamento. */
  fim?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Campos livres de um lançamento — usados tanto pra iniciar cronômetro quanto pra criar manual. */
const camposBase = {
  descricao: z.string().trim().max(500).default(""),
  tarefaId: z.string().trim().max(100).optional(),
  cliente: z.string().trim().max(200).default(""),
  categoria: z.string().trim().max(100).default(""),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
};

/** Inicia um cronômetro — sem `fim` (o servidor grava `inicio = agora`). */
export const startTimeEntrySchema = z.object(camposBase);

/** Lançamento manual completo — exige início e fim explícitos. */
export const createTimeEntrySchema = z
  .object({
    ...camposBase,
    inicio: z.string().min(1, "Informe o início"),
    fim: z.string().min(1, "Informe o fim"),
  })
  .refine((d) => new Date(d.fim) > new Date(d.inicio), {
    message: "O fim precisa ser depois do início.",
    path: ["fim"],
  });

/** Edição parcial — os mesmos campos, todos opcionais. Se `fim` vier, precisa ser depois de `inicio`. */
export const updateTimeEntrySchema = z
  .object({ ...camposBase, inicio: z.string().min(1).optional(), fim: z.string().min(1).optional() })
  .partial()
  .refine((d) => !d.inicio || !d.fim || new Date(d.fim) > new Date(d.inicio), {
    message: "O fim precisa ser depois do início.",
    path: ["fim"],
  });

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type StartTimeEntryInput = z.infer<typeof startTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

/** Duração em minutos — usa `agora` como fim quando o lançamento está rodando. */
export function duracaoMin(e: Pick<TimeEntry, "inicio" | "fim">, agora: Date = new Date()): number {
  const inicio = new Date(e.inicio).getTime();
  const fim = e.fim ? new Date(e.fim).getTime() : agora.getTime();
  return Math.max(0, Math.round((fim - inicio) / 60000));
}

/** "1h 30min" / "45min" / "2h" — formato compacto pt-BR. */
export function formatarDuracao(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
