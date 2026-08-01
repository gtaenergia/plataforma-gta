import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { TimeEntry } from "./types";
import { PostgresTrackerStore } from "./postgres-store";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados do Tracker (registro de horas). Mesmo padrão dual-backend
 * das Tarefas: `JsonTrackerStore` em dev (data/tracker.json), Postgres em produção.
 */

export interface ListFiltro {
  /** Ausente = todos os usuários (só a rota decide quem pode pedir isso). */
  usuarioEmail?: string;
  /** Bounds ISO — filtra por `inicio` em [desde, ate). */
  desde: string;
  ate: string;
}

/** `tarefaId: ""` desvincula a tarefa (ver LIMPAR); demais campos ausentes = não altera. */
export type UpdatePatch = Partial<Omit<TimeEntry, "id" | "usuarioEmail" | "criadoEm" | "atualizadoEm">>;

/** Sentinela: "" em `tarefaId` limpa o vínculo (undefined = não mexe). */
export const LIMPAR = "";

export interface TrackerStore {
  list(filtro: ListFiltro): Promise<TimeEntry[]>;
  get(id: string): Promise<TimeEntry | null>;
  /** Lançamento em andamento (sem `fim`) de um usuário, se houver. */
  getRodando(usuarioEmail: string): Promise<TimeEntry | null>;
  create(data: Omit<TimeEntry, "id" | "criadoEm" | "atualizadoEm">): Promise<TimeEntry>;
  update(id: string, patch: UpdatePatch): Promise<TimeEntry | null>;
  remove(id: string): Promise<boolean>;
}

class JsonTrackerStore implements TrackerStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): TimeEntry[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as TimeEntry[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: TimeEntry[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: TimeEntry[]) => { items: TimeEntry[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(filtro: ListFiltro): Promise<TimeEntry[]> {
    return this.readAll()
      .filter((e) => (!filtro.usuarioEmail || e.usuarioEmail === filtro.usuarioEmail) && e.inicio >= filtro.desde && e.inicio < filtro.ate)
      .sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
  }
  async get(id: string): Promise<TimeEntry | null> {
    return this.readAll().find((e) => e.id === id) ?? null;
  }
  async getRodando(usuarioEmail: string): Promise<TimeEntry | null> {
    const rodando = this.readAll()
      .filter((e) => e.usuarioEmail === usuarioEmail && !e.fim)
      .sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
    return rodando[0] ?? null;
  }
  async create(data: Omit<TimeEntry, "id" | "criadoEm" | "atualizadoEm">): Promise<TimeEntry> {
    const now = new Date().toISOString();
    const entry: TimeEntry = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, entry], result: entry }));
  }
  async update(id: string, patch: UpdatePatch): Promise<TimeEntry | null> {
    return this.mutate((items) => {
      const i = items.findIndex((e) => e.id === id);
      if (i < 0) return { items, result: null };
      const merged: TimeEntry = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      // "" limpa o vínculo com a tarefa (mesmo contrato do backend Postgres).
      if (patch.tarefaId === LIMPAR) merged.tarefaId = undefined;
      const next = [...items];
      next[i] = merged;
      return { items: next, result: merged };
    });
  }
  async remove(id: string): Promise<boolean> {
    return this.mutate((items) => {
      const next = items.filter((e) => e.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

const g = globalThis as unknown as { __gtaTrackerStore?: TrackerStore };

export function getTrackerStore(): TrackerStore {
  if (!g.__gtaTrackerStore) {
    g.__gtaTrackerStore = getDbUrl()
      ? new PostgresTrackerStore()
      : new JsonTrackerStore(path.join(process.cwd(), "data", "tracker.json"));
  }
  return g.__gtaTrackerStore;
}
