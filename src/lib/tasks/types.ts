import { z } from "zod";

/** Modelo e validação do módulo de Tarefas. */

export const STATUS_TAREFA = [
  { value: "afazer", label: "A Fazer" },
  { value: "andamento", label: "Em Andamento" },
  { value: "atraso", label: "Em Atraso" },
  { value: "continuo", label: "Contínuo" },
  { value: "concluida", label: "Concluída" },
] as const;

export const PRIORIDADES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
] as const;

/** Origem da demanda: dois casos fixos. */
export const DEMANDANTES = [
  { value: "operacional", label: "Operacional" },
  { value: "comercial", label: "Comercial" },
] as const;

/**
 * Categorias padrão da tarefa — texto livre (como `cliente`), não um enum fixo:
 * a lista exibida no dropdown é esta semente + qualquer valor já usado em
 * alguma tarefa. Basta criar/editar uma tarefa com uma categoria nova para ela
 * passar a aparecer no dropdown de todo mundo, sem precisar mexer no código.
 */
export const CATEGORIAS_PADRAO_TAREFA = ["Administrativo", "Orçamentos", "Projetos"] as const;

export type StatusTarefa = (typeof STATUS_TAREFA)[number]["value"];
export type Prioridade = (typeof PRIORIDADES)[number]["value"];
/** "" = ainda não classificado (tarefas antigas). */
export type Demandante = (typeof DEMANDANTES)[number]["value"] | "";

export interface Comentario {
  id: string;
  /** Nome (ou e-mail) de quem comentou — vem da sessão, não do cliente. */
  autor: string;
  texto: string;
  /** ISO datetime */
  em: string;
}

export interface Task {
  id: string;
  titulo: string;
  descricao: string;
  /** Cliente/obra relacionada à tarefa (texto livre). */
  cliente: string;
  /** Categoria da tarefa (texto livre — ver CATEGORIAS_PADRAO_TAREFA). */
  categoria: string;
  /** De onde veio a demanda: operacional ou comercial. */
  demandante: Demandante;
  /** E-mail do responsável (usuário cadastrado na plataforma). */
  responsavel: string;
  status: StatusTarefa;
  prioridade: Prioridade;
  /** yyyy-mm-dd (opcional) — LEGADO: exibido como Prazo operacional (fallback). */
  prazo: string;
  /** Prazo comercial — yyyy-mm-dd (opcional). Tratado de forma isolada. */
  prazoComercial: string;
  /** Prazo operacional — yyyy-mm-dd (opcional). Tratado de forma isolada. */
  prazoOperacional: string;
  /** Hora do prazo comercial — HH:mm (opcional). */
  horaComercial: string;
  /** Hora do prazo operacional — HH:mm (opcional). */
  horaOperacional: string;
  /**
   * Esforço estimado, em MINUTOS. `0` = não informado (nunca "não dá
   * trabalho"): sem estimativa a plataforma cai na média da categoria em vez de
   * tratar a tarefa como instantânea. Ver lib/capacidade/motor.ts.
   */
  estimativaMin: number;
  comentarios: Comentario[];
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

const statusEnum = z.enum(["afazer", "andamento", "atraso", "continuo", "concluida"]);
const prioridadeEnum = z.enum(["baixa", "media", "alta"]);

/** Verifica se yyyy-mm-dd é uma data real do calendário (rejeita 2026-02-31). */
function isDataReal(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Prazo: yyyy-mm-dd válido no calendário, ou vazio. */
const prazoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine(isDataReal, "Data inexistente")
  .or(z.literal(""))
  .default("");

/** Hora: HH:mm (24h) válida, ou vazio. */
const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida")
  .or(z.literal(""))
  .default("");

/** Payload de criação de tarefa. */
export const createTaskSchema = z.object({
  titulo: z.string().trim().min(1, "Informe o título").max(300),
  descricao: z.string().trim().max(4000).default(""),
  cliente: z.string().trim().max(200).default(""),
  categoria: z.string().trim().max(60).default(""),
  demandante: z.enum(["operacional", "comercial"]).or(z.literal("")).default(""),
  responsavel: z.string().trim().min(1, "Informe o responsável"),
  status: statusEnum.default("afazer"),
  prioridade: prioridadeEnum.default("media"),
  prazo: prazoSchema,
  prazoComercial: prazoSchema,
  prazoOperacional: prazoSchema,
  horaComercial: horaSchema,
  horaOperacional: horaSchema,
  // Teto de 400 h: acima disso é um projeto, não uma tarefa — e um dígito a
  // mais digitado por engano tomaria a agenda da pessoa por meses.
  estimativaMin: z.coerce.number().int().min(0).max(400 * 60).default(0),
});

/** Payload de atualização parcial. */
export const updateTaskSchema = createTaskSchema.partial();

/** Payload de novo comentário. */
export const createComentarioSchema = z.object({
  texto: z.string().trim().min(1, "Escreva o comentário").max(2000),
});

export function statusLabel(s: StatusTarefa): string {
  return STATUS_TAREFA.find((x) => x.value === s)?.label ?? s;
}

export function prioridadeLabel(p: Prioridade): string {
  return PRIORIDADES.find((x) => x.value === p)?.label ?? p;
}

export function demandanteLabel(d: Demandante): string {
  return DEMANDANTES.find((x) => x.value === d)?.label ?? "";
}
