import fs from "node:fs";
import path from "node:path";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { InscricaoPush, NovaInscricao } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados das inscrições de push. Mesmo padrão das demais:
 * Postgres em produção, arquivo JSON local em desenvolvimento.
 *
 * A chave é o ENDPOINT, não o e-mail: uma pessoa tem uma inscrição por
 * aparelho, e o mesmo aparelho pode trocar de dono (computador compartilhado).
 * Salvar é sempre um "upsert" pelo endpoint, o que também conserta sozinho o
 * caso de alguém entrar com outra conta no mesmo navegador.
 */

export interface PushStore {
  /** Inscrições de uma pessoa — todos os aparelhos dela. */
  listPara(email: string): Promise<InscricaoPush[]>;
  /** Cria ou atualiza pelo endpoint. */
  salvar(data: NovaInscricao): Promise<void>;
  /** Remove um aparelho. Usado no cancelamento e na limpeza de inscrição morta. */
  remover(endpoint: string): Promise<boolean>;
  /** Quantos aparelhos a pessoa tem ativos — alimenta o interruptor em /conta. */
  contarPara(email: string): Promise<number>;
}

const norm = (email: string) => email.trim().toLowerCase();

// ------------------------------------------------------------- JSON (dev)

class JsonPushStore implements PushStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): InscricaoPush[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as InscricaoPush[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: InscricaoPush[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: InscricaoPush[]) => { items: InscricaoPush[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listPara(email: string) {
    const alvo = norm(email);
    return this.readAll().filter((i) => norm(i.email) === alvo);
  }
  async salvar(data: NovaInscricao) {
    await this.mutate((items) => {
      const semEste = items.filter((i) => i.endpoint !== data.endpoint);
      return { items: [...semEste, { ...data, criadoEm: new Date().toISOString() }], result: undefined };
    });
  }
  async remover(endpoint: string) {
    return this.mutate((items) => {
      const next = items.filter((i) => i.endpoint !== endpoint);
      return { items: next, result: next.length !== items.length };
    });
  }
  async contarPara(email: string) {
    return (await this.listPara(email)).length;
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  endpoint: string;
  p256dh: string;
  auth: string;
  email: string;
  aparelho: string;
  criado_em: string;
}
const rowTo = (r: Row): InscricaoPush => ({
  endpoint: r.endpoint,
  p256dh: r.p256dh,
  auth: r.auth,
  email: r.email,
  aparelho: r.aparelho ?? "",
  criadoEm: new Date(r.criado_em).toISOString(),
});

class PostgresPushStore implements PushStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint text PRIMARY KEY,
          p256dh text NOT NULL,
          auth text NOT NULL,
          email text NOT NULL,
          aparelho text NOT NULL DEFAULT '',
          criado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS push_subscriptions_email_idx ON push_subscriptions (lower(email))`)
        .then(() => undefined)
        // Blip transitório no cold start não pode virar rejeição cacheada para sempre.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async listPara(email: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`
      SELECT * FROM push_subscriptions WHERE lower(email) = ${norm(email)}
    `;
    return rows.map(rowTo);
  }
  async salvar(data: NovaInscricao) {
    await this.ensureSchema();
    // O mesmo navegador reemite o mesmo endpoint; o conflito é o caso normal,
    // não a exceção — inclusive quando outra pessoa entra no mesmo aparelho.
    await this.pool.sql`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, email, aparelho, criado_em)
      VALUES (${data.endpoint}, ${data.p256dh}, ${data.auth}, ${data.email}, ${data.aparelho}, ${new Date().toISOString()})
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        email = EXCLUDED.email,
        aparelho = EXCLUDED.aparelho
    `;
  }
  async remover(endpoint: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
    return (rowCount ?? 0) > 0;
  }
  async contarPara(email: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<{ n: number }>`
      SELECT count(*)::int AS n FROM push_subscriptions WHERE lower(email) = ${norm(email)}
    `;
    return rows[0]?.n ?? 0;
  }
}

const g = globalThis as unknown as { __gtaPushStore?: PushStore };

export function getPushStore(): PushStore {
  if (!g.__gtaPushStore) {
    g.__gtaPushStore = getDbUrl()
      ? new PostgresPushStore()
      : new JsonPushStore(path.join(process.cwd(), "data", "push-subscriptions.json"));
  }
  return g.__gtaPushStore;
}
