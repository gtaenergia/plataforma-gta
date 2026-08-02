import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Comentario, Task } from "./types";
import { PostgresTaskStore, getDbUrl } from "./postgres-store";

/**
 * Camada de dados das Tarefas.
 *
 * A interface `TaskStore` é o contrato usado pelas rotas da API. A implementação
 * atual (`JsonTaskStore`) grava em `data/tasks.json` com escrita atômica e fila
 * de gravação — suficiente para uso local/rede interna.
 *
 * DEPLOY: na Vercel o filesystem é efêmero. Na fase de deploy, criar uma
 * `SupabaseTaskStore` com esta MESMA interface e trocar apenas `getTaskStore()`.
 */

export interface TaskStore {
  list(): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  create(data: Omit<Task, "id" | "comentarios" | "criadoEm" | "atualizadoEm">): Promise<Task>;
  update(id: string, patch: Partial<Omit<Task, "id" | "comentarios">>): Promise<Task | null>;
  remove(id: string): Promise<boolean>;
  addComment(id: string, comentario: Omit<Comentario, "id" | "em">): Promise<Task | null>;
}

class JsonTaskStore implements TaskStore {
  private file: string;
  /** Fila de escrita: serializa operações de gravação concorrentes. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  private readAll(): Task[] {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Tarefa gravada antes de um campo existir volta sem ele. O equivalente
      // no Postgres é o DEFAULT da coluna; aqui é este preenchimento.
      return (parsed as Task[]).map((t) => ({ ...t, estimativaMin: Number(t.estimativaMin ?? 0) || 0 }));
    } catch {
      return []; // arquivo inexistente ou corrompido -> lista vazia
    }
  }

  private writeAll(tasks: Task[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2), "utf8");
    fs.renameSync(tmp, this.file); // troca atômica
  }

  /** Executa uma mutação serializada (lê -> transforma -> grava). */
  private mutate<T>(fn: (tasks: Task[]) => { tasks: Task[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { tasks, result } = fn(this.readAll());
      this.writeAll(tasks);
      return result;
    });
    // A fila nunca deve travar por causa de um erro anterior
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<Task[]> {
    return this.readAll();
  }

  async get(id: string): Promise<Task | null> {
    return this.readAll().find((t) => t.id === id) ?? null;
  }

  async create(
    data: Omit<Task, "id" | "comentarios" | "criadoEm" | "atualizadoEm">,
  ): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = { ...data, id: crypto.randomUUID(), comentarios: [], criadoEm: now, atualizadoEm: now };
    return this.mutate((tasks) => ({ tasks: [...tasks, task], result: task }));
  }

  async update(
    id: string,
    patch: Partial<Omit<Task, "id" | "comentarios">>,
  ): Promise<Task | null> {
    return this.mutate((tasks) => {
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0) return { tasks, result: null };
      const updated: Task = { ...tasks[idx], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...tasks];
      next[idx] = updated;
      return { tasks: next, result: updated };
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.mutate((tasks) => {
      const next = tasks.filter((t) => t.id !== id);
      return { tasks: next, result: next.length !== tasks.length };
    });
  }

  async addComment(id: string, comentario: Omit<Comentario, "id" | "em">): Promise<Task | null> {
    return this.mutate((tasks) => {
      const idx = tasks.findIndex((t) => t.id === id);
      if (idx < 0) return { tasks, result: null };
      const novo: Comentario = { ...comentario, id: crypto.randomUUID(), em: new Date().toISOString() };
      const updated: Task = {
        ...tasks[idx],
        comentarios: [...tasks[idx].comentarios, novo],
        atualizadoEm: novo.em,
      };
      const next = [...tasks];
      next[idx] = updated;
      return { tasks: next, result: updated };
    });
  }
}

// Singleton por processo (sobrevive ao hot-reload do dev via globalThis)
const g = globalThis as unknown as { __gtaTaskStore?: TaskStore };

/**
 * Escolhe a implementação do store:
 * - Produção/Vercel: `POSTGRES_URL` presente -> PostgresTaskStore (banco na nuvem).
 * - Desenvolvimento local: arquivo `data/tasks.json`.
 * Trocar de backend não afeta a API nem a UI (mesma interface `TaskStore`).
 */
export function getTaskStore(): TaskStore {
  if (!g.__gtaTaskStore) {
    if (getDbUrl()) {
      g.__gtaTaskStore = new PostgresTaskStore();
    } else {
      g.__gtaTaskStore = new JsonTaskStore(path.join(process.cwd(), "data", "tasks.json"));
    }
  }
  return g.__gtaTaskStore;
}
