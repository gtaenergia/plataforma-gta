import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { TarefaCrm } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados das tarefas do CRM (agenda comercial).
 *
 * Sem `remove()` de propósito: tarefa não se exclui (regra do RD) — conclui-se
 * ou adia-se. A única exceção mora na API: excluir a negociação leva junto as
 * tarefas dela, senão a agenda cobraria compromissos de um negócio que não
 * existe mais — para isso existe o `removeDaNegociacao`.
 */

type CreateInput = Omit<TarefaCrm, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<TarefaCrm, "id" | "criadoEm" | "criadoPor" | "negociacaoId">>;

export interface TarefaCrmStore {
  list(): Promise<TarefaCrm[]>;
  get(id: string): Promise<TarefaCrm | null>;
  create(data: CreateInput): Promise<TarefaCrm>;
  update(id: string, patch: UpdatePatch): Promise<TarefaCrm | null>;
  removeDaNegociacao(negociacaoId: string): Promise<number>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonTarefaCrmStore implements TarefaCrmStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): TarefaCrm[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as TarefaCrm[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: TarefaCrm[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: TarefaCrm[]) => { items: TarefaCrm[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    // Ordem de agenda: o compromisso mais próximo primeiro.
    return this.readAll().sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  }
  async get(id: string) {
    return this.readAll().find((t) => t.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const t: TarefaCrm = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, t], result: t }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((t) => t.id === id);
      if (i < 0) return { items, result: null };
      const updated: TarefaCrm = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async removeDaNegociacao(negociacaoId: string) {
    return this.mutate((items) => {
      const next = items.filter((t) => t.negociacaoId !== negociacaoId);
      return { items: next, result: items.length - next.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  negociacao_id: string;
  negociacao_nome: string;
  tipo: string;
  assunto: string;
  data: string;
  hora: string;
  notas: string;
  responsavel: string;
  responsavel_nome: string;
  concluida: boolean;
  concluida_em: string;
  criado_por: string;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): TarefaCrm => ({
  id: r.id,
  negociacaoId: r.negociacao_id,
  negociacaoNome: r.negociacao_nome ?? "",
  tipo: (r.tipo as TarefaCrm["tipo"]) ?? "tarefa",
  assunto: r.assunto ?? "",
  data: r.data ?? "",
  hora: r.hora ?? "",
  notas: r.notas ?? "",
  responsavel: r.responsavel ?? "",
  responsavelNome: r.responsavel_nome ?? "",
  concluida: !!r.concluida,
  concluidaEm: r.concluida_em ?? "",
  criadoPor: r.criado_por,
  criadoPorNome: r.criado_por_nome ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresTarefaCrmStore implements TarefaCrmStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_tarefas (
          id uuid PRIMARY KEY,
          negociacao_id text NOT NULL,
          negociacao_nome text NOT NULL DEFAULT '',
          tipo text NOT NULL DEFAULT 'tarefa',
          assunto text NOT NULL,
          data text NOT NULL,
          hora text NOT NULL DEFAULT '',
          notas text NOT NULL DEFAULT '',
          responsavel text NOT NULL DEFAULT '',
          responsavel_nome text NOT NULL DEFAULT '',
          concluida boolean NOT NULL DEFAULT false,
          concluida_em text NOT NULL DEFAULT '',
          criado_por text NOT NULL,
          criado_por_nome text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS crm_tarefas_negociacao_idx ON crm_tarefas (negociacao_id)`)
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
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_tarefas ORDER BY data ASC, hora ASC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_tarefas WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_tarefas
        (id, negociacao_id, negociacao_nome, tipo, assunto, data, hora, notas, responsavel,
         responsavel_nome, concluida, concluida_em, criado_por, criado_por_nome, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.negociacaoId}, ${data.negociacaoNome}, ${data.tipo}, ${data.assunto}, ${data.data},
         ${data.hora}, ${data.notas}, ${data.responsavel}, ${data.responsavelNome}, ${data.concluida},
         ${data.concluidaEm}, ${data.criadoPor}, ${data.criadoPorNome ?? null}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_tarefas SET
        negociacao_nome = COALESCE(${patch.negociacaoNome ?? null}::text, negociacao_nome),
        tipo = COALESCE(${patch.tipo ?? null}::text, tipo),
        assunto = COALESCE(${patch.assunto ?? null}::text, assunto),
        data = COALESCE(${patch.data ?? null}::text, data),
        hora = COALESCE(${patch.hora ?? null}::text, hora),
        notas = COALESCE(${patch.notas ?? null}::text, notas),
        responsavel = COALESCE(${patch.responsavel ?? null}::text, responsavel),
        responsavel_nome = COALESCE(${patch.responsavelNome ?? null}::text, responsavel_nome),
        concluida = COALESCE(${patch.concluida ?? null}::boolean, concluida),
        concluida_em = COALESCE(${patch.concluidaEm ?? null}::text, concluida_em),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async removeDaNegociacao(negociacaoId: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM crm_tarefas WHERE negociacao_id = ${negociacaoId}`;
    return rowCount ?? 0;
  }
}

const g = globalThis as unknown as { __gtaCrmTarefaStore?: TarefaCrmStore };

export function getTarefaCrmStore(): TarefaCrmStore {
  if (!g.__gtaCrmTarefaStore) {
    g.__gtaCrmTarefaStore = getDbUrl()
      ? new PostgresTarefaCrmStore()
      : new JsonTarefaCrmStore(path.join(process.cwd(), "data", "crm-tarefas.json"));
  }
  return g.__gtaCrmTarefaStore;
}
