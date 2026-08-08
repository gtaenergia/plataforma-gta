import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { ProdutoCrm } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados do catálogo de produtos e serviços do CRM.
 *
 * Não existe `remove()` de propósito: produto não se exclui, se oculta (regra
 * herdada do RD — excluir apagaria o passado das negociações e dos relatórios).
 */

type CreateInput = Omit<ProdutoCrm, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Pick<ProdutoCrm, "nome" | "descricao" | "precoBase" | "oculto" | "serviceKey">>;

export interface ProdutoCrmStore {
  list(): Promise<ProdutoCrm[]>;
  get(id: string): Promise<ProdutoCrm | null>;
  create(data: CreateInput): Promise<ProdutoCrm>;
  update(id: string, patch: UpdatePatch): Promise<ProdutoCrm | null>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonProdutoCrmStore implements ProdutoCrmStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): ProdutoCrm[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as ProdutoCrm[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: ProdutoCrm[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: ProdutoCrm[]) => { items: ProdutoCrm[]; result: T }): Promise<T> {
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
    return this.readAll().find((p) => p.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const p: ProdutoCrm = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, p], result: p }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((p) => p.id === id);
      if (i < 0) return { items, result: null };
      const updated: ProdutoCrm = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  nome: string;
  descricao: string;
  preco_base: string | number;
  oculto: boolean;
  service_key: string | null;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): ProdutoCrm => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao ?? "",
  precoBase: Number(r.preco_base ?? 0),
  oculto: !!r.oculto,
  serviceKey: r.service_key ?? "",
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresProdutoCrmStore implements ProdutoCrmStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_produtos (
          id uuid PRIMARY KEY,
          nome text NOT NULL,
          descricao text NOT NULL DEFAULT '',
          preco_base numeric NOT NULL DEFAULT 0,
          oculto boolean NOT NULL DEFAULT false,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        // Coluna acrescentada depois: catálogos já em produção continuam
        // válidos, com o elo vazio até alguém preenchê-lo.
        .then(() => this.pool.sql`ALTER TABLE crm_produtos ADD COLUMN IF NOT EXISTS service_key text NOT NULL DEFAULT ''`)
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
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_produtos ORDER BY nome ASC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_produtos WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_produtos (id, nome, descricao, preco_base, oculto, service_key, criado_em, atualizado_em)
      VALUES (${id}, ${data.nome}, ${data.descricao}, ${data.precoBase}, ${data.oculto}, ${data.serviceKey}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_produtos SET
        nome = COALESCE(${patch.nome ?? null}::text, nome),
        descricao = COALESCE(${patch.descricao ?? null}::text, descricao),
        preco_base = COALESCE(${patch.precoBase ?? null}::numeric, preco_base),
        oculto = COALESCE(${patch.oculto ?? null}::boolean, oculto),
        service_key = COALESCE(${patch.serviceKey ?? null}::text, service_key),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
}

const g = globalThis as unknown as { __gtaCrmProdutoStore?: ProdutoCrmStore };

export function getProdutoCrmStore(): ProdutoCrmStore {
  if (!g.__gtaCrmProdutoStore) {
    g.__gtaCrmProdutoStore = getDbUrl()
      ? new PostgresProdutoCrmStore()
      : new JsonProdutoCrmStore(path.join(process.cwd(), "data", "crm-produtos.json"));
  }
  return g.__gtaCrmProdutoStore;
}
