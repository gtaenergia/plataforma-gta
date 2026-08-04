import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { Notificacao, NovaNotificacao } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados das Notificações in-app. Mesmo padrão das demais:
 * Postgres em produção, arquivo JSON local em desenvolvimento.
 */

const LIMITE_PADRAO = 30;

export interface NotificacaoStore {
  /** Notificações do usuário, mais recentes primeiro. */
  listPara(email: string, limite?: number): Promise<Notificacao[]>;
  criar(data: NovaNotificacao): Promise<Notificacao>;
  /** Marca uma como lida (só se pertencer ao usuário). */
  marcarLida(id: string, email: string): Promise<boolean>;
  /** Marca todas as não-lidas do usuário como lidas; retorna quantas. */
  marcarTodasLidas(email: string): Promise<number>;
}

const norm = (email: string) => email.trim().toLowerCase();

// ------------------------------------------------------------- JSON (dev)

class JsonNotificacaoStore implements NotificacaoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Notificacao[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Notificacao[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: Notificacao[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Notificacao[]) => { items: Notificacao[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listPara(email: string, limite = LIMITE_PADRAO) {
    const alvo = norm(email);
    return this.readAll()
      .filter((n) => norm(n.paraEmail) === alvo)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
      .slice(0, limite);
  }
  async criar(data: NovaNotificacao) {
    const nova: Notificacao = { ...data, id: crypto.randomUUID(), lida: false, criadoEm: new Date().toISOString() };
    return this.mutate((items) => ({ items: [...items, nova], result: nova }));
  }
  async marcarLida(id: string, email: string) {
    const alvo = norm(email);
    return this.mutate((items) => {
      const i = items.findIndex((n) => n.id === id && norm(n.paraEmail) === alvo);
      if (i < 0) return { items, result: false };
      const next = [...items];
      next[i] = { ...next[i], lida: true };
      return { items: next, result: true };
    });
  }
  async marcarTodasLidas(email: string) {
    const alvo = norm(email);
    return this.mutate((items) => {
      let n = 0;
      const next = items.map((it) => {
        if (norm(it.paraEmail) === alvo && !it.lida) { n++; return { ...it, lida: true }; }
        return it;
      });
      return { items: next, result: n };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  para_email: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string;
  lida: boolean;
  criado_em: string;
}
const rowTo = (r: Row): Notificacao => ({
  id: r.id,
  paraEmail: r.para_email,
  tipo: r.tipo ?? "",
  titulo: r.titulo,
  mensagem: r.mensagem ?? "",
  link: r.link ?? "",
  lida: !!r.lida,
  criadoEm: new Date(r.criado_em).toISOString(),
});

class PostgresNotificacaoStore implements NotificacaoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS notificacoes (
          id uuid PRIMARY KEY,
          para_email text NOT NULL,
          tipo text NOT NULL DEFAULT '',
          titulo text NOT NULL,
          mensagem text NOT NULL DEFAULT '',
          link text NOT NULL DEFAULT '',
          lida boolean NOT NULL DEFAULT false,
          criado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS notificacoes_para_email_idx ON notificacoes (lower(para_email), criado_em DESC)`)
        .then(() => undefined)
        // Blip transitório no cold start não pode virar rejeição cacheada para sempre.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async listPara(email: string, limite = LIMITE_PADRAO) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`
      SELECT * FROM notificacoes WHERE lower(para_email) = ${norm(email)}
      ORDER BY criado_em DESC LIMIT ${limite}
    `;
    return rows.map(rowTo);
  }
  async criar(data: NovaNotificacao) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO notificacoes (id, para_email, tipo, titulo, mensagem, link, lida, criado_em)
      VALUES (${id}, ${data.paraEmail}, ${data.tipo}, ${data.titulo}, ${data.mensagem}, ${data.link}, false, ${now})
    `;
    return { ...data, id, lida: false, criadoEm: now };
  }
  async marcarLida(id: string, email: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`
      UPDATE notificacoes SET lida = true WHERE id = ${id} AND lower(para_email) = ${norm(email)}
    `;
    return (rowCount ?? 0) > 0;
  }
  async marcarTodasLidas(email: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`
      UPDATE notificacoes SET lida = true WHERE lower(para_email) = ${norm(email)} AND lida = false
    `;
    return rowCount ?? 0;
  }
}

const g = globalThis as unknown as { __gtaNotificacaoStore?: NotificacaoStore };

export function getNotificacaoStore(): NotificacaoStore {
  if (!g.__gtaNotificacaoStore) {
    g.__gtaNotificacaoStore = getDbUrl()
      ? new PostgresNotificacaoStore()
      : new JsonNotificacaoStore(path.join(process.cwd(), "data", "notificacoes.json"));
  }
  return g.__gtaNotificacaoStore;
}

/**
 * Cria uma notificação sem nunca lançar (best-effort): um efeito colateral de
 * notificação jamais deve quebrar o fluxo principal (ex.: aprovar/rejeitar).
 *
 * O sino é o registro; o push é o aviso. Os dois saem daqui, mas o push é
 * carregado sob demanda: o `web-push` só existe no runtime Node, e importá-lo
 * no topo arrastaria a dependência para qualquer rota que notifique.
 */
export async function notificar(data: NovaNotificacao): Promise<void> {
  try {
    // Não notifica se o destinatário for vazio.
    if (!data.paraEmail?.trim()) return;
    await getNotificacaoStore().criar(data);
  } catch (e) {
    console.error("Notificação in-app: falha ao criar —", e);
  }
  // Fora do try acima de propósito: o sino ter falhado não é motivo para o
  // celular também ficar mudo, e vice-versa.
  try {
    const { enviarPush } = await import("../push/enviar");
    await enviarPush(data);
  } catch (e) {
    console.error("Push: falha ao despachar —", e);
  }
}
