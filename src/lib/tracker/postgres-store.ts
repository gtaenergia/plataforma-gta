import { createPool, type VercelPool } from "@vercel/postgres";
import crypto from "node:crypto";
import type { TimeEntry } from "./types";
import type { TrackerStore, ListFiltro, UpdatePatch } from "./store";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Implementação Postgres do Tracker. Mesmo padrão dual-backend dos demais
 * módulos (Tarefas, Orçamentos): `getDbUrl()` reaproveitado de tasks/postgres-store.
 *
 * Sentinela de limpeza (`LIMPAR = ""`) só se aplica a `tarefaId`: é o único
 * campo opcional que faz sentido "desvincular" depois de criado. `fim` nunca é
 * limpo pela UI (uma vez parado, o lançamento não volta a rodar), mas o SQL
 * trata os dois com o mesmo cuidado — NULLIF ANTES do cast — porque
 * `''::timestamptz` derruba a query inteira (bug já visto neste projeto em
 * orçamentos: ver commit da correção de "reabrir").
 */

export interface Row {
  id: string;
  usuario_email: string;
  descricao: string;
  tarefa_id: string | null;
  cliente: string;
  categoria: string;
  tags: string[];
  inicio: string;
  fim: string | null;
  criado_em: string;
  atualizado_em: string;
}

export const rowTo = (r: Row): TimeEntry => ({
  id: r.id,
  usuarioEmail: r.usuario_email,
  descricao: r.descricao ?? "",
  tarefaId: r.tarefa_id ?? undefined,
  cliente: r.cliente ?? "",
  categoria: r.categoria ?? "",
  tags: r.tags ?? [],
  inicio: new Date(r.inicio).toISOString(),
  fim: r.fim ? new Date(r.fim).toISOString() : undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

export class PostgresTrackerStore implements TrackerStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;

  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }

  /**
   * Bancos criados antes de 08/2026 ainda têm a coluna "billable" (conceito de
   * "faturável", removido). Ela não é dropada — a plataforma nunca apaga
   * coluna — e como é NOT NULL DEFAULT false, os INSERTs que a omitem seguem
   * válidos. Fica só como peso morto.
   */
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .sql`
        CREATE TABLE IF NOT EXISTS tracker_entries (
          id uuid PRIMARY KEY,
          usuario_email text NOT NULL,
          descricao text NOT NULL DEFAULT '',
          tarefa_id text,
          cliente text NOT NULL DEFAULT '',
          categoria text NOT NULL DEFAULT '',
          tags jsonb NOT NULL DEFAULT '[]',
          inicio timestamptz NOT NULL,
          fim timestamptz,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS tracker_entries_usuario_inicio_idx ON tracker_entries (usuario_email, inicio DESC)`)
        .then(() => undefined)
        // Blip transitório no cold start não pode virar rejeição cacheada pra sempre.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }

  /**
   * Sobreposição com [desde, ate), não contenção do `inicio` — ver `ListFiltro`.
   * `fim IS NULL` é o cronômetro em andamento: ele alcança o presente, então
   * basta ter começado antes do fim da janela.
   */
  async list(filtro: ListFiltro): Promise<TimeEntry[]> {
    await this.ensureSchema();
    const { rows } = filtro.usuarioEmail
      ? await this.pool.sql<Row>`
          SELECT * FROM tracker_entries
          WHERE usuario_email = ${filtro.usuarioEmail}
            AND inicio < ${filtro.ate} AND (fim IS NULL OR fim > ${filtro.desde})
          ORDER BY inicio DESC
        `
      : await this.pool.sql<Row>`
          SELECT * FROM tracker_entries
          WHERE inicio < ${filtro.ate} AND (fim IS NULL OR fim > ${filtro.desde})
          ORDER BY inicio DESC
        `;
    return rows.map(rowTo);
  }

  async get(id: string): Promise<TimeEntry | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM tracker_entries WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async getRodando(usuarioEmail: string): Promise<TimeEntry | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`
      SELECT * FROM tracker_entries WHERE usuario_email = ${usuarioEmail} AND fim IS NULL
      ORDER BY inicio DESC LIMIT 1
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async create(data: Omit<TimeEntry, "id" | "criadoEm" | "atualizadoEm">): Promise<TimeEntry> {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO tracker_entries
        (id, usuario_email, descricao, tarefa_id, cliente, categoria, tags, inicio, fim, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.usuarioEmail}, ${data.descricao}, ${data.tarefaId ?? null}, ${data.cliente}, ${data.categoria},
         ${JSON.stringify(data.tags)}::jsonb, ${data.inicio}, ${data.fim ?? null}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }

  async update(id: string, patch: UpdatePatch): Promise<TimeEntry | null> {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const tarefaId = patch.tarefaId ?? null;
    const fim = patch.fim ?? null;
    const tagsJson = patch.tags === undefined ? null : JSON.stringify(patch.tags);
    const { rows } = await this.pool.sql<Row>`
      UPDATE tracker_entries SET
        descricao = COALESCE(${patch.descricao ?? null}::text, descricao),
        tarefa_id = CASE WHEN ${tarefaId}::text IS NULL THEN tarefa_id ELSE NULLIF(${tarefaId}::text, '') END,
        cliente = COALESCE(${patch.cliente ?? null}::text, cliente),
        categoria = COALESCE(${patch.categoria ?? null}::text, categoria),
        tags = COALESCE(${tagsJson}::jsonb, tags),
        inicio = COALESCE(${patch.inicio ?? null}::timestamptz, inicio),
        fim = CASE WHEN ${fim}::text IS NULL THEN fim ELSE NULLIF(${fim}::text, '')::timestamptz END,
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM tracker_entries WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}
