import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { ItemCatalogo } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados dos catálogos simples do CRM — fontes de negociação e
 * motivos de perda. As duas entidades têm exatamente a mesma forma (nome +
 * descrição), então a implementação é uma só, parametrizada pela tabela;
 * duplicá-la seria duplicar qualquer defeito futuro.
 */

/** Tabelas permitidas — o nome entra na SQL por interpolação, então é fechado num union. */
type TabelaCatalogo = "crm_fontes" | "crm_motivos_perda";

type CreateInput = Omit<ItemCatalogo, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Pick<ItemCatalogo, "nome" | "descricao">>;

export interface CatalogoStore {
  list(): Promise<ItemCatalogo[]>;
  get(id: string): Promise<ItemCatalogo | null>;
  create(data: CreateInput): Promise<ItemCatalogo>;
  update(id: string, patch: UpdatePatch): Promise<ItemCatalogo | null>;
  remove(id: string): Promise<boolean>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonCatalogoStore implements CatalogoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): ItemCatalogo[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as ItemCatalogo[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: ItemCatalogo[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: ItemCatalogo[]) => { items: ItemCatalogo[]; result: T }): Promise<T> {
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
    const item: ItemCatalogo = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, item], result: item }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((c) => c.id === id);
      if (i < 0) return { items, result: null };
      const updated: ItemCatalogo = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
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
  descricao: string;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): ItemCatalogo => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao ?? "",
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresCatalogoStore implements CatalogoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor(private table: TabelaCatalogo) {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      // `query` (e não o template `sql`) porque o nome da tabela é dinâmico;
      // ele vem do union fechado `TabelaCatalogo`, nunca de entrada do usuário.
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS ${this.table} (
            id uuid PRIMARY KEY,
            nome text NOT NULL,
            descricao text NOT NULL DEFAULT '',
            criado_em timestamptz NOT NULL,
            atualizado_em timestamptz NOT NULL
          )`,
        )
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
    const { rows } = await this.pool.query<Row>(`SELECT * FROM ${this.table} ORDER BY nome ASC`);
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.query<Row>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO ${this.table} (id, nome, descricao, criado_em, atualizado_em) VALUES ($1, $2, $3, $4, $5)`,
      [id, data.nome, data.descricao, now, now],
    );
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.query<Row>(
      `UPDATE ${this.table} SET
        nome = COALESCE($2::text, nome),
        descricao = COALESCE($3::text, descricao),
        atualizado_em = $4
      WHERE id = $1
      RETURNING *`,
      [id, patch.nome ?? null, patch.descricao ?? null, atualizadoEm],
    );
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.query(`DELETE FROM ${this.table} WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as {
  __gtaCrmFonteStore?: CatalogoStore;
  __gtaCrmMotivoStore?: CatalogoStore;
};

export function getFonteStore(): CatalogoStore {
  if (!g.__gtaCrmFonteStore) {
    g.__gtaCrmFonteStore = getDbUrl()
      ? new PostgresCatalogoStore("crm_fontes")
      : new JsonCatalogoStore(path.join(process.cwd(), "data", "crm-fontes.json"));
  }
  return g.__gtaCrmFonteStore;
}

export function getMotivoPerdaStore(): CatalogoStore {
  if (!g.__gtaCrmMotivoStore) {
    g.__gtaCrmMotivoStore = getDbUrl()
      ? new PostgresCatalogoStore("crm_motivos_perda")
      : new JsonCatalogoStore(path.join(process.cwd(), "data", "crm-motivos-perda.json"));
  }
  return g.__gtaCrmMotivoStore;
}
