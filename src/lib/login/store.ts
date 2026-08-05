import fs from "node:fs";
import path from "node:path";
import { createPool, type VercelPool } from "@vercel/postgres";
import { JANELA_ESQUECIMENTO } from "./limite";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Contagem de tentativas de login. Mesmo padrão das demais camadas de dados:
 * Postgres em produção, arquivo JSON local em desenvolvimento.
 *
 * ## Por que no banco e não em memória
 *
 * Cada função sem servidor tem a própria memória e morre a qualquer momento.
 * Um contador em memória seria zerado a cada instância nova — e o atacante
 * ganharia tentativas de graça só por bater de novo. No banco, a contagem
 * vale para toda a aplicação.
 *
 * O custo é uma escrita por tentativa ERRADA. Login certo não escreve nada,
 * só apaga o que houver.
 */

export interface TentativaLogin {
  falhas: number;
  /** Instante (ms) até o qual está bloqueado. 0 = livre. */
  bloqueadoAteMs: number;
  ultimaFalhaMs: number;
}

export interface LoginLimiteStore {
  ler(chaves: readonly string[]): Promise<Map<string, TentativaLogin>>;
  gravar(chave: string, dados: TentativaLogin): Promise<void>;
  limpar(chaves: readonly string[]): Promise<void>;
}

const VAZIO: TentativaLogin = { falhas: 0, bloqueadoAteMs: 0, ultimaFalhaMs: 0 };

// ------------------------------------------------------------- JSON (dev)

class JsonLoginLimiteStore implements LoginLimiteStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Record<string, TentativaLogin> {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  private writeAll(dados: Record<string, TentativaLogin>): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate(fn: (d: Record<string, TentativaLogin>) => Record<string, TentativaLogin>): Promise<void> {
    const run = this.queue.then(() => {
      this.writeAll(fn(this.readAll()));
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async ler(chaves: readonly string[]) {
    const todos = this.readAll();
    return new Map(chaves.map((c) => [c, todos[c] ?? VAZIO]));
  }
  async gravar(chave: string, dados: TentativaLogin) {
    await this.mutate((d) => ({ ...d, [chave]: dados }));
  }
  async limpar(chaves: readonly string[]) {
    await this.mutate((d) => {
      const next = { ...d };
      for (const c of chaves) delete next[c];
      return next;
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  chave: string;
  falhas: number;
  bloqueado_ate: string | null;
  ultima_falha: string;
}

class PostgresLoginLimiteStore implements LoginLimiteStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS login_attempts (
          chave text PRIMARY KEY,
          falhas integer NOT NULL DEFAULT 0,
          bloqueado_ate timestamptz,
          ultima_falha timestamptz NOT NULL
        )
      `
        .then(() => undefined)
        // Blip transitório no cold start não pode virar rejeição cacheada.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }

  async ler(chaves: readonly string[]) {
    await this.ensureSchema();
    const { rows } = await this.pool.query<Row>(
      `SELECT * FROM login_attempts WHERE chave = ANY($1)`,
      [chaves as string[]],
    );
    const mapa = new Map<string, TentativaLogin>(chaves.map((c) => [c, VAZIO]));
    for (const r of rows) {
      mapa.set(r.chave, {
        falhas: Number(r.falhas ?? 0),
        bloqueadoAteMs: r.bloqueado_ate ? new Date(r.bloqueado_ate).getTime() : 0,
        ultimaFalhaMs: new Date(r.ultima_falha).getTime(),
      });
    }
    return mapa;
  }

  async gravar(chave: string, dados: TentativaLogin) {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO login_attempts (chave, falhas, bloqueado_ate, ultima_falha)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chave) DO UPDATE SET
         falhas = EXCLUDED.falhas,
         bloqueado_ate = EXCLUDED.bloqueado_ate,
         ultima_falha = EXCLUDED.ultima_falha`,
      [
        chave,
        dados.falhas,
        dados.bloqueadoAteMs ? new Date(dados.bloqueadoAteMs).toISOString() : null,
        new Date(dados.ultimaFalhaMs).toISOString(),
      ],
    );
    // Varre o que já não conta mais. Um atacante trocando de IP criaria uma
    // linha nova a cada tentativa; sem isto a tabela cresceria para sempre.
    // Só roda em tentativa ERRADA, que é rara em uso normal.
    await this.pool
      .query(`DELETE FROM login_attempts WHERE ultima_falha < now() - ($1 || ' seconds')::interval`, [
        String(JANELA_ESQUECIMENTO * 2),
      ])
      .catch(() => undefined);
  }

  async limpar(chaves: readonly string[]) {
    await this.ensureSchema();
    await this.pool.query(`DELETE FROM login_attempts WHERE chave = ANY($1)`, [chaves as string[]]);
  }
}

const g = globalThis as unknown as { __gtaLoginLimiteStore?: LoginLimiteStore };

export function getLoginLimiteStore(): LoginLimiteStore {
  if (!g.__gtaLoginLimiteStore) {
    g.__gtaLoginLimiteStore = getDbUrl()
      ? new PostgresLoginLimiteStore()
      : new JsonLoginLimiteStore(path.join(process.cwd(), "data", "login-attempts.json"));
  }
  return g.__gtaLoginLimiteStore;
}
