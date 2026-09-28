import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { RegistroHistorico } from "./historico";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados do histórico do cliente — os registros escritos à mão ao
 * lado das propostas do operacional, e os pedidos avulsos.
 *
 * Uma proposta tem no máximo UM registro (índice único no Postgres, conferido
 * também no JSON): dois registros para a mesma proposta seriam duas versões
 * de "fechou ou não", e a tela teria que escolher uma.
 */

type CreateInput = Omit<RegistroHistorico, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<RegistroHistorico, "id" | "clienteId" | "propostaId" | "criadoEm" | "criadoPor">>;

export class PropostaJaRegistradaError extends Error {
  constructor() {
    super("PROPOSTA_JA_REGISTRADA");
    this.name = "PropostaJaRegistradaError";
  }
}

export interface HistoricoStore {
  list(): Promise<RegistroHistorico[]>;
  get(id: string): Promise<RegistroHistorico | null>;
  create(data: CreateInput): Promise<RegistroHistorico>;
  update(id: string, patch: UpdatePatch): Promise<RegistroHistorico | null>;
  remove(id: string): Promise<boolean>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonHistoricoStore implements HistoricoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): RegistroHistorico[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as RegistroHistorico[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: RegistroHistorico[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: RegistroHistorico[]) => { items: RegistroHistorico[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return this.readAll();
  }
  async get(id: string) {
    return this.readAll().find((r) => r.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const r: RegistroHistorico = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => {
      if (r.propostaId && items.some((x) => x.propostaId === r.propostaId)) throw new PropostaJaRegistradaError();
      return { items: [...items, r], result: r };
    });
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((r) => r.id === id);
      if (i < 0) return { items, result: null };
      const updated: RegistroHistorico = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((r) => r.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  cliente_id: string;
  cliente_nome: string;
  proposta_id: string;
  titulo: string;
  natureza: string;
  valor: string | number | null;
  solicitado_em: string;
  apresentado_em: string;
  resultado: string;
  decidido_em: string;
  movimento: string;
  observacoes: string;
  negociacao_id: string;
  criado_por: string;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): RegistroHistorico => ({
  id: r.id,
  clienteId: r.cliente_id,
  clienteNome: r.cliente_nome ?? "",
  propostaId: r.proposta_id ?? "",
  titulo: r.titulo ?? "",
  natureza: (r.natureza as RegistroHistorico["natureza"]) ?? "",
  // numeric volta como texto do driver; NULL é "sem valor escrito à mão".
  valor: r.valor === null || r.valor === undefined ? null : Number(r.valor),
  solicitadoEm: r.solicitado_em ?? "",
  apresentadoEm: r.apresentado_em ?? "",
  resultado: (r.resultado as RegistroHistorico["resultado"]) ?? "",
  decididoEm: r.decidido_em ?? "",
  movimento: (r.movimento as RegistroHistorico["movimento"]) ?? "",
  observacoes: r.observacoes ?? "",
  negociacaoId: r.negociacao_id ?? "",
  criadoPor: r.criado_por,
  criadoPorNome: r.criado_por_nome ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresHistoricoStore implements HistoricoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_historico (
          id uuid PRIMARY KEY,
          cliente_id text NOT NULL,
          cliente_nome text NOT NULL DEFAULT '',
          proposta_id text NOT NULL DEFAULT '',
          titulo text NOT NULL DEFAULT '',
          natureza text NOT NULL DEFAULT '',
          valor numeric,
          solicitado_em text NOT NULL DEFAULT '',
          apresentado_em text NOT NULL DEFAULT '',
          resultado text NOT NULL DEFAULT '',
          decidido_em text NOT NULL DEFAULT '',
          movimento text NOT NULL DEFAULT '',
          observacoes text NOT NULL DEFAULT '',
          negociacao_id text NOT NULL DEFAULT '',
          criado_por text NOT NULL,
          criado_por_nome text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS crm_historico_cliente_idx ON crm_historico (cliente_id)`)
        .then(
          () => this.pool.sql`
            CREATE UNIQUE INDEX IF NOT EXISTS crm_historico_proposta_idx ON crm_historico (proposta_id) WHERE proposta_id <> ''
          `,
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
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_historico ORDER BY criado_em ASC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_historico WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await this.pool.sql`
        INSERT INTO crm_historico
          (id, cliente_id, cliente_nome, proposta_id, titulo, natureza, valor, solicitado_em, apresentado_em,
           resultado, decidido_em, movimento, observacoes, negociacao_id, criado_por, criado_por_nome,
           criado_em, atualizado_em)
        VALUES
          (${id}, ${data.clienteId}, ${data.clienteNome}, ${data.propostaId}, ${data.titulo}, ${data.natureza},
           ${data.valor}, ${data.solicitadoEm}, ${data.apresentadoEm}, ${data.resultado}, ${data.decididoEm},
           ${data.movimento}, ${data.observacoes}, ${data.negociacaoId}, ${data.criadoPor},
           ${data.criadoPorNome ?? null}, ${now}, ${now})
      `;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new PropostaJaRegistradaError();
      throw e;
    }
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    // `valor` pode ser LIMPO (null = voltar ao automático), o que o COALESCE
    // dos outros campos não sabe fazer: ele trata null como "não mexer".
    const mexeNoValor = "valor" in patch;
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_historico SET
        cliente_nome = COALESCE(${patch.clienteNome ?? null}::text, cliente_nome),
        titulo = COALESCE(${patch.titulo ?? null}::text, titulo),
        natureza = COALESCE(${patch.natureza ?? null}::text, natureza),
        valor = CASE WHEN ${mexeNoValor}::boolean THEN ${patch.valor ?? null}::numeric ELSE valor END,
        solicitado_em = COALESCE(${patch.solicitadoEm ?? null}::text, solicitado_em),
        apresentado_em = COALESCE(${patch.apresentadoEm ?? null}::text, apresentado_em),
        resultado = COALESCE(${patch.resultado ?? null}::text, resultado),
        decidido_em = COALESCE(${patch.decididoEm ?? null}::text, decidido_em),
        movimento = COALESCE(${patch.movimento ?? null}::text, movimento),
        observacoes = COALESCE(${patch.observacoes ?? null}::text, observacoes),
        negociacao_id = COALESCE(${patch.negociacaoId ?? null}::text, negociacao_id),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM crm_historico WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaCrmHistoricoStore?: HistoricoStore };

export function getHistoricoStore(): HistoricoStore {
  if (!g.__gtaCrmHistoricoStore) {
    g.__gtaCrmHistoricoStore = getDbUrl()
      ? new PostgresHistoricoStore()
      : new JsonHistoricoStore(path.join(process.cwd(), "data", "crm-historico.json"));
  }
  return g.__gtaCrmHistoricoStore;
}
