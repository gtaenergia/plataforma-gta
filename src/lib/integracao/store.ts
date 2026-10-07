import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Registro de toda chamada à integração — o livro de portaria.
 *
 * Serve a três coisas de uma vez: auditoria (quem bateu, de onde, o que
 * gravou), freio (as contagens por janela saem daqui) e prova do que foi
 * recusado. No banco, e não em memória, pela mesma razão do limite de login:
 * cada função sem servidor tem memória própria e o contador zeraria a cada
 * instância nova.
 *
 * Não guarda dado pessoal do cliente — só a referência da proposta e os ids
 * criados. O conteúdo em si já está nos cadastros.
 */

export type AcaoIntegracao = "verificar-cliente" | "simular" | "registrar" | "auth";
export type ResultadoIntegracao = "ok" | "recusado" | "erro" | "auth_falhou" | "limitado";

export interface EventoIntegracao {
  id: string;
  criadoEm: string;
  ip: string;
  acao: AcaoIntegracao;
  resultado: ResultadoIntegracao;
  referencia: string;
  /** Texto curto: motivo da recusa, ou os ids criados. */
  detalhe: string;
}

export interface FiltroContagem {
  desdeMs: number;
  ip?: string;
  acao?: AcaoIntegracao;
  resultado?: ResultadoIntegracao;
  /** Só chamadas que passaram pela autenticação (exclui as falhas de token). */
  autenticadas?: boolean;
}

export interface IntegracaoLogStore {
  registrar(e: Omit<EventoIntegracao, "id" | "criadoEm">): Promise<void>;
  contar(f: FiltroContagem): Promise<number>;
}

const casa = (e: EventoIntegracao, f: FiltroContagem) =>
  new Date(e.criadoEm).getTime() >= f.desdeMs &&
  (!f.ip || e.ip === f.ip) &&
  (!f.acao || e.acao === f.acao) &&
  (!f.resultado || e.resultado === f.resultado) &&
  (!f.autenticadas || e.acao !== "auth");

// ------------------------------------------------------------- JSON (dev)

class JsonIntegracaoLogStore implements IntegracaoLogStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): EventoIntegracao[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as EventoIntegracao[]) : [];
    } catch {
      return [];
    }
  }

  async registrar(e: Omit<EventoIntegracao, "id" | "criadoEm">) {
    const evento: EventoIntegracao = { ...e, id: crypto.randomUUID(), criadoEm: new Date().toISOString() };
    const run = this.queue.then(() => {
      const items = [...this.readAll(), evento];
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    });
    this.queue = run.catch(() => undefined);
    await run;
  }

  async contar(f: FiltroContagem) {
    await this.queue;
    return this.readAll().filter((e) => casa(e, f)).length;
  }
}

// --------------------------------------------------------- Postgres (prod)

class PostgresIntegracaoLogStore implements IntegracaoLogStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.pool.sql`
          CREATE TABLE IF NOT EXISTS integracao_log (
            id uuid PRIMARY KEY,
            criado_em timestamptz NOT NULL,
            ip text NOT NULL DEFAULT '',
            acao text NOT NULL,
            resultado text NOT NULL,
            referencia text NOT NULL DEFAULT '',
            detalhe text NOT NULL DEFAULT ''
          )
        `;
        await this.pool.sql`CREATE INDEX IF NOT EXISTS integracao_log_criado_idx ON integracao_log (criado_em)`;
      })().catch((e) => {
        // Blip transitório no cold start não pode virar rejeição cacheada.
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  async registrar(e: Omit<EventoIntegracao, "id" | "criadoEm">) {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO integracao_log (id, criado_em, ip, acao, resultado, referencia, detalhe)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        crypto.randomUUID(),
        new Date().toISOString(),
        e.ip.slice(0, 100),
        e.acao,
        e.resultado,
        e.referencia.slice(0, 120),
        e.detalhe.slice(0, 1000),
      ],
    );
  }

  async contar(f: FiltroContagem) {
    await this.ensureSchema();
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM integracao_log
        WHERE criado_em >= $1
          AND ($2::text IS NULL OR ip = $2)
          AND ($3::text IS NULL OR acao = $3)
          AND ($4::text IS NULL OR resultado = $4)
          AND (NOT $5::boolean OR acao <> 'auth')`,
      [new Date(f.desdeMs).toISOString(), f.ip ?? null, f.acao ?? null, f.resultado ?? null, !!f.autenticadas],
    );
    return Number(rows[0]?.n ?? 0);
  }
}

// ---------------------------------------------------------------- Fábrica

const g = globalThis as unknown as { __gtaIntegracaoLogStore?: IntegracaoLogStore };

export function getIntegracaoLogStore(): IntegracaoLogStore {
  if (!g.__gtaIntegracaoLogStore) {
    g.__gtaIntegracaoLogStore = getDbUrl()
      ? new PostgresIntegracaoLogStore()
      : new JsonIntegracaoLogStore(path.join(process.cwd(), "data", "integracao-log.json"));
  }
  return g.__gtaIntegracaoLogStore;
}
