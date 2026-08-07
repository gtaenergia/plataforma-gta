import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { EtapaFunil, Funil } from "./types";
import { ETAPAS_PADRAO } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados dos funis de venda. As etapas moram DENTRO do funil (jsonb):
 * são detalhe de apresentação dele — renomear ou reordenar etapa é editar o
 * funil, não uma entidade à parte.
 */

type CreateInput = Omit<Funil, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Pick<Funil, "nome" | "etapas">>;

export interface FunilStore {
  list(): Promise<Funil[]>;
  get(id: string): Promise<Funil | null>;
  create(data: CreateInput): Promise<Funil>;
  update(id: string, patch: UpdatePatch): Promise<Funil | null>;
  remove(id: string): Promise<boolean>;
}

/** Etapas novas ganham id aqui — a negociação aponta para o id, não para o nome. */
export function novaEtapa(nome: string): EtapaFunil {
  return { id: crypto.randomUUID(), nome };
}

/** O funil semeado na primeira visita de uma conta vazia. */
export function funilPadrao(): CreateInput {
  return { nome: "Funil de vendas", etapas: ETAPAS_PADRAO.map(novaEtapa) };
}

// ------------------------------------------------------------- JSON (dev)

class JsonFunilStore implements FunilStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Funil[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Funil[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: Funil[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Funil[]) => { items: Funil[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    // Ordem de criação: o primeiro funil da conta é o padrão do quadro.
    return this.readAll().sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  }
  async get(id: string) {
    return this.readAll().find((f) => f.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const f: Funil = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, f], result: f }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((f) => f.id === id);
      if (i < 0) return { items, result: null };
      const updated: Funil = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((f) => f.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  nome: string;
  etapas: EtapaFunil[] | string;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): Funil => ({
  id: r.id,
  nome: r.nome,
  etapas: typeof r.etapas === "string" ? (JSON.parse(r.etapas) as EtapaFunil[]) : (r.etapas ?? []),
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresFunilStore implements FunilStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_funis (
          id uuid PRIMARY KEY,
          nome text NOT NULL,
          etapas jsonb NOT NULL DEFAULT '[]',
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => undefined)
        // Blip transitório no cold start não pode virar rejeição cacheada para sempre.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_funis ORDER BY criado_em ASC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_funis WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_funis (id, nome, etapas, criado_em, atualizado_em)
      VALUES (${id}, ${data.nome}, ${JSON.stringify(data.etapas)}::jsonb, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_funis SET
        nome = COALESCE(${patch.nome ?? null}::text, nome),
        etapas = COALESCE(${patch.etapas ? JSON.stringify(patch.etapas) : null}::jsonb, etapas),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM crm_funis WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaCrmFunilStore?: FunilStore };

export function getFunilStore(): FunilStore {
  if (!g.__gtaCrmFunilStore) {
    g.__gtaCrmFunilStore = getDbUrl()
      ? new PostgresFunilStore()
      : new JsonFunilStore(path.join(process.cwd(), "data", "crm-funis.json"));
  }
  return g.__gtaCrmFunilStore;
}
