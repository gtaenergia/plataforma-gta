import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";
import { ipDaRequisicao } from "../login/limite";
import type { User } from "../users/types";
import type { RegistroAuditoria } from "./auditoria-tipos";

export { ACAO_TEXTO, type AcaoAuditoria, type RegistroAuditoria } from "./auditoria-tipos";

/**
 * Auditoria do Financeiro: quem fez o quê, quando, de onde — e o valor antes
 * e depois.
 *
 * ## Só inclusão
 *
 * Não existe rota para editar ou apagar registro, e no Postgres um gatilho
 * RECUSA qualquer UPDATE ou DELETE na tabela: nem um bug, nem uma rota nova
 * mal escrita, nem alguém com o console SQL na mão apaga o rastro sem antes
 * desligar o gatilho de propósito.
 *
 * ## Antes da mudança
 *
 * Quem altera dinheiro grava a auditoria ANTES de gravar a mudança. Se a
 * auditoria falhar, a mudança não acontece (falha fechada): não existe
 * alteração no Financeiro sem rastro. Exclusão guarda o documento inteiro em
 * `antes` — é por aqui que um lançamento apagado por engano (ou de má-fé)
 * volta.
 */

export type NovoRegistro = Omit<RegistroAuditoria, "id" | "quando" | "email" | "nome" | "ip" | "agente">;

export interface AuditoriaStore {
  inserir(r: RegistroAuditoria): Promise<void>;
  listar(limite: number): Promise<RegistroAuditoria[]>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonAuditoriaStore implements AuditoriaStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  private ler(): RegistroAuditoria[] {
    try {
      const p = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  async inserir(r: RegistroAuditoria) {
    const run = this.queue.then(() => {
      const todos = [...this.ler(), r];
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(todos, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
  async listar(limite: number) {
    return this.ler()
      .sort((a, b) => b.quando.localeCompare(a.quando))
      .slice(0, limite);
  }
}

// --------------------------------------------------------- Postgres (prod)

class PostgresAuditoriaStore implements AuditoriaStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.pool.sql`
          CREATE TABLE IF NOT EXISTS fin_auditoria (
            id uuid PRIMARY KEY,
            quando timestamptz NOT NULL,
            email text NOT NULL,
            nome text NOT NULL DEFAULT '',
            acao text NOT NULL,
            alvo text NOT NULL DEFAULT '',
            resumo text NOT NULL DEFAULT '',
            antes jsonb,
            depois jsonb,
            ip text NOT NULL DEFAULT '',
            agente text NOT NULL DEFAULT ''
          )
        `;
        await this.pool.sql`CREATE INDEX IF NOT EXISTS fin_auditoria_quando ON fin_auditoria (quando DESC)`;
        // O gatilho que torna a tabela só-inclusão.
        await this.pool.query(`
          CREATE OR REPLACE FUNCTION fin_auditoria_imutavel() RETURNS trigger AS $$
          BEGIN
            RAISE EXCEPTION 'fin_auditoria aceita só inclusão: registros não podem ser alterados nem apagados';
          END;
          $$ LANGUAGE plpgsql
        `);
        try {
          await this.pool.query(`
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fin_auditoria_sem_alterar') THEN
                CREATE TRIGGER fin_auditoria_sem_alterar BEFORE UPDATE OR DELETE OR TRUNCATE ON fin_auditoria
                  FOR EACH STATEMENT EXECUTE FUNCTION fin_auditoria_imutavel();
              END IF;
            END $$
          `);
        } catch (e) {
          // Duas instâncias criando o gatilho ao mesmo tempo: a outra já criou.
          if ((e as { code?: string }).code !== "42710") throw e;
        }
      })();
      this.ready.catch(() => {
        this.ready = null;
      });
    }
    return this.ready;
  }
  async inserir(r: RegistroAuditoria) {
    await this.ensureSchema();
    await this.pool.sql`
      INSERT INTO fin_auditoria (id, quando, email, nome, acao, alvo, resumo, antes, depois, ip, agente)
      VALUES (${r.id}, ${r.quando}, ${r.email}, ${r.nome}, ${r.acao}, ${r.alvo}, ${r.resumo},
        ${r.antes === undefined ? null : JSON.stringify(r.antes)}::jsonb,
        ${r.depois === undefined ? null : JSON.stringify(r.depois)}::jsonb,
        ${r.ip}, ${r.agente})
    `;
  }
  async listar(limite: number) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<RegistroAuditoria & { quando: string | Date }>`
      SELECT id, quando, email, nome, acao, alvo, resumo, antes, depois, ip, agente
      FROM fin_auditoria ORDER BY quando DESC LIMIT ${limite}
    `;
    return rows.map((r) => ({ ...r, quando: new Date(r.quando).toISOString() }));
  }
}

const g = globalThis as unknown as { __gtaFinAuditoria?: AuditoriaStore };

export function getAuditoriaStore(): AuditoriaStore {
  if (!g.__gtaFinAuditoria) {
    g.__gtaFinAuditoria = getDbUrl()
      ? new PostgresAuditoriaStore()
      : new JsonAuditoriaStore(path.join(process.cwd(), "data", "financeiro-auditoria.json"));
  }
  return g.__gtaFinAuditoria;
}

/**
 * Grava um registro. LANÇA se não conseguir: quem chama antes de mudar
 * dinheiro deve deixar o erro subir e não fazer a mudança.
 */
export async function auditar(
  quem: Pick<User, "email" | "name">,
  req: Request | null,
  r: NovoRegistro,
  store = getAuditoriaStore(),
): Promise<void> {
  await store.inserir({
    id: crypto.randomUUID(),
    quando: new Date().toISOString(),
    email: quem.email,
    nome: quem.name || quem.email,
    acao: r.acao,
    alvo: r.alvo.slice(0, 200),
    resumo: r.resumo.slice(0, 300),
    antes: r.antes,
    depois: r.depois,
    ip: req ? ipDaRequisicao(req.headers).slice(0, 64) : "",
    agente: req ? (req.headers.get("user-agent") ?? "").slice(0, 200) : "",
  });
}

/** Versão que nunca lança — para eventos de acesso, onde o fluxo principal não pode parar. */
export async function auditarSemFalhar(...args: Parameters<typeof auditar>): Promise<void> {
  try {
    await auditar(...args);
  } catch (e) {
    console.error("Auditoria do Financeiro: falha ao gravar —", e);
  }
}
