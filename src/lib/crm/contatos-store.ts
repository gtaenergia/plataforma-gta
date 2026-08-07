import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { Contato } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/** Camada de dados dos contatos do CRM — as pessoas com quem se negocia. */

type CreateInput = Omit<Contato, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<Contato, "id" | "criadoEm" | "criadoPor">>;

export interface ContatoStore {
  list(): Promise<Contato[]>;
  get(id: string): Promise<Contato | null>;
  create(data: CreateInput): Promise<Contato>;
  update(id: string, patch: UpdatePatch): Promise<Contato | null>;
  remove(id: string): Promise<boolean>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonContatoStore implements ContatoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Contato[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Contato[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: Contato[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Contato[]) => { items: Contato[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return this.readAll().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  async get(id: string) {
    return this.readAll().find((c) => c.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const c: Contato = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, c], result: c }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((c) => c.id === id);
      if (i < 0) return { items, result: null };
      const updated: Contato = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((c) => c.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  nome: string;
  cargo: string;
  email: string;
  telefone: string;
  empresa_id: string;
  empresa_nome: string;
  observacoes: string;
  criado_por: string;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): Contato => ({
  id: r.id,
  nome: r.nome,
  cargo: r.cargo ?? "",
  email: r.email ?? "",
  telefone: r.telefone ?? "",
  empresaId: r.empresa_id ?? "",
  empresaNome: r.empresa_nome ?? "",
  observacoes: r.observacoes ?? "",
  criadoPor: r.criado_por,
  criadoPorNome: r.criado_por_nome ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresContatoStore implements ContatoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_contatos (
          id uuid PRIMARY KEY,
          nome text NOT NULL,
          cargo text NOT NULL DEFAULT '',
          email text NOT NULL DEFAULT '',
          telefone text NOT NULL DEFAULT '',
          empresa_id text NOT NULL DEFAULT '',
          empresa_nome text NOT NULL DEFAULT '',
          observacoes text NOT NULL DEFAULT '',
          criado_por text NOT NULL,
          criado_por_nome text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => undefined)
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_contatos ORDER BY nome ASC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_contatos WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_contatos
        (id, nome, cargo, email, telefone, empresa_id, empresa_nome, observacoes,
         criado_por, criado_por_nome, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.nome}, ${data.cargo}, ${data.email}, ${data.telefone}, ${data.empresaId},
         ${data.empresaNome}, ${data.observacoes}, ${data.criadoPor}, ${data.criadoPorNome ?? null}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_contatos SET
        nome = COALESCE(${patch.nome ?? null}::text, nome),
        cargo = COALESCE(${patch.cargo ?? null}::text, cargo),
        email = COALESCE(${patch.email ?? null}::text, email),
        telefone = COALESCE(${patch.telefone ?? null}::text, telefone),
        empresa_id = COALESCE(${patch.empresaId ?? null}::text, empresa_id),
        empresa_nome = COALESCE(${patch.empresaNome ?? null}::text, empresa_nome),
        observacoes = COALESCE(${patch.observacoes ?? null}::text, observacoes),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM crm_contatos WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaCrmContatoStore?: ContatoStore };

export function getContatoStore(): ContatoStore {
  if (!g.__gtaCrmContatoStore) {
    g.__gtaCrmContatoStore = getDbUrl()
      ? new PostgresContatoStore()
      : new JsonContatoStore(path.join(process.cwd(), "data", "crm-contatos.json"));
  }
  return g.__gtaCrmContatoStore;
}
