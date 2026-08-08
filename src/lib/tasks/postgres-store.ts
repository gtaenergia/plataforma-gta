import { createPool, type VercelPool } from "@vercel/postgres";
import crypto from "node:crypto";
import type { Comentario, Task } from "./types";
import type { TaskStore } from "./store";

/**
 * Implementação do TaskStore em PostgreSQL (Vercel Postgres / Neon).
 *
 * Usada em produção. A conexão vem de uma das variáveis de ambiente injetadas
 * pela Vercel ao vincular o banco (o nome varia entre POSTGRES_URL e
 * DATABASE_URL conforme o provedor) — por isso escolhemos a primeira disponível.
 * Mantém a MESMA interface do JsonTaskStore — API e UI não mudam.
 */

/**
 * Remove o parâmetro `channel_binding` da URL. O Neon o inclui por padrão, mas o
 * driver serverless (@vercel/postgres) pode falhar com `channel_binding=require`.
 * Tirá-lo torna a conexão TLS opcional para binding — mais compatível, sem perda
 * de segurança (a conexão continua por SSL).
 */
function sanitize(url: string): string {
  return url
    .replace(/([?&])channel_binding=[^&]*/gi, "$1")
    .replace(/\?&/, "?")
    .replace(/&&/g, "&")
    .replace(/[?&]$/, "");
}

/** Primeira URL de conexão disponível (compatível com Vercel Postgres e Neon). */
export function getDbUrl(): string {
  const url =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
  return url ? sanitize(url) : "";
}

/** Exportada para o teste: é aqui que produção diverge de desenvolvimento. */
export interface Row {
  id: string;
  titulo: string;
  descricao: string;
  cliente: string;
  categoria: string;
  tipo_demanda: string;
  demandante: string;
  responsavel: string;
  status: string;
  prioridade: string;
  prazo: string;
  prazo_comercial: string;
  prazo_operacional: string;
  hora_comercial: string;
  hora_operacional: string;
  /** integer, não numeric: `numeric` volta como STRING pelo driver. */
  estimativa_min: number;
  /** Opcionais: a réplica que ainda não rodou o ALTER devolve a linha sem elas. */
  negociacao_id?: string | null;
  service_key?: string | null;
  comentarios: Comentario[];
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

export function rowToTask(r: Row): Task {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    cliente: r.cliente ?? "",
    categoria: r.categoria ?? "",
    tipoDemanda: r.tipo_demanda ?? "",
    demandante: (r.demandante ?? "") as Task["demandante"],
    responsavel: r.responsavel,
    status: r.status as Task["status"],
    prioridade: r.prioridade as Task["prioridade"],
    prazo: r.prazo,
    prazoComercial: r.prazo_comercial ?? "",
    prazoOperacional: r.prazo_operacional ?? "",
    horaComercial: r.hora_comercial ?? "",
    horaOperacional: r.hora_operacional ?? "",
    // Linha anterior à coluna existir devolve null; `Number(null)` é 0, mas o
    // explícito documenta a intenção e cobre um eventual valor textual.
    estimativaMin: Number(r.estimativa_min ?? 0) || 0,
    negociacaoId: r.negociacao_id ?? "",
    serviceKey: r.service_key ?? "",
    comentarios: r.comentarios ?? [],
    criadoPor: r.criado_por,
    criadoEm: new Date(r.criado_em).toISOString(),
    atualizadoEm: new Date(r.atualizado_em).toISOString(),
  };
}

export class PostgresTaskStore implements TaskStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;

  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }

  /** Cria a tabela na primeira operação (idempotente). */
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool
        .sql`
        CREATE TABLE IF NOT EXISTS tasks (
          id uuid PRIMARY KEY,
          titulo text NOT NULL,
          descricao text NOT NULL DEFAULT '',
          cliente text NOT NULL DEFAULT '',
          demandante text NOT NULL DEFAULT '',
          responsavel text NOT NULL,
          status text NOT NULL,
          prioridade text NOT NULL,
          prazo text NOT NULL DEFAULT '',
          prazo_comercial text NOT NULL DEFAULT '',
          prazo_operacional text NOT NULL DEFAULT '',
          hora_comercial text NOT NULL DEFAULT '',
          hora_operacional text NOT NULL DEFAULT '',
          comentarios jsonb NOT NULL DEFAULT '[]',
          criado_por text NOT NULL,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        // Garante as colunas em tabelas criadas antes desses campos existirem
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cliente text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS demandante text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prazo_comercial text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prazo_operacional text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hora_comercial text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hora_operacional text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimativa_min integer NOT NULL DEFAULT 0`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo_demanda text NOT NULL DEFAULT ''`)
        // O fio de volta para a negociação do CRM. Tarefa nascida em Operações
        // guarda "" — a coluna existe para as que o comercial pediu.
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS negociacao_id text NOT NULL DEFAULT ''`)
        .then(() => this.pool.sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS service_key text NOT NULL DEFAULT ''`)
        .then(() => undefined);
    }
    return this.ready;
  }

  async list(): Promise<Task[]> {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM tasks ORDER BY atualizado_em DESC`;
    return rows.map(rowToTask);
  }

  async get(id: string): Promise<Task | null> {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM tasks WHERE id = ${id}`;
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async create(
    data: Omit<Task, "id" | "comentarios" | "criadoEm" | "atualizadoEm">,
  ): Promise<Task> {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO tasks
        (id, titulo, descricao, cliente, categoria, tipo_demanda, demandante, responsavel, status, prioridade, prazo, prazo_comercial, prazo_operacional, hora_comercial, hora_operacional, estimativa_min, negociacao_id, service_key, comentarios, criado_por, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.titulo}, ${data.descricao}, ${data.cliente}, ${data.categoria}, ${data.tipoDemanda ?? ""}, ${data.demandante}, ${data.responsavel}, ${data.status},
         ${data.prioridade}, ${data.prazo}, ${data.prazoComercial}, ${data.prazoOperacional}, ${data.horaComercial}, ${data.horaOperacional}, ${data.estimativaMin ?? 0}, ${data.negociacaoId ?? ""}, ${data.serviceKey ?? ""}, '[]'::jsonb, ${data.criadoPor}, ${now}, ${now})
    `;
    return { ...data, id, comentarios: [], criadoEm: now, atualizadoEm: now };
  }

  async update(
    id: string,
    patch: Partial<Omit<Task, "id" | "comentarios">>,
  ): Promise<Task | null> {
    await this.ensureSchema();
    // UPDATE atômico (sem read-then-write): COALESCE mantém o valor atual quando
    // o campo não foi enviado (null), evitando que edições simultâneas se
    // sobrescrevam em campos diferentes. RETURNING devolve a linha final.
    //
    // Vale para estimativa_min também: como `0 ?? null` é 0, zerar a estimativa
    // grava zero de verdade — só o campo AUSENTE do patch preserva o valor.
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE tasks SET
        titulo = COALESCE(${patch.titulo ?? null}::text, titulo),
        descricao = COALESCE(${patch.descricao ?? null}::text, descricao),
        cliente = COALESCE(${patch.cliente ?? null}::text, cliente),
        categoria = COALESCE(${patch.categoria ?? null}::text, categoria),
        tipo_demanda = COALESCE(${patch.tipoDemanda ?? null}::text, tipo_demanda),
        demandante = COALESCE(${patch.demandante ?? null}::text, demandante),
        responsavel = COALESCE(${patch.responsavel ?? null}::text, responsavel),
        status = COALESCE(${patch.status ?? null}::text, status),
        prioridade = COALESCE(${patch.prioridade ?? null}::text, prioridade),
        prazo = COALESCE(${patch.prazo ?? null}::text, prazo),
        prazo_comercial = COALESCE(${patch.prazoComercial ?? null}::text, prazo_comercial),
        prazo_operacional = COALESCE(${patch.prazoOperacional ?? null}::text, prazo_operacional),
        hora_comercial = COALESCE(${patch.horaComercial ?? null}::text, hora_comercial),
        hora_operacional = COALESCE(${patch.horaOperacional ?? null}::text, hora_operacional),
        estimativa_min = COALESCE(${patch.estimativaMin ?? null}::int, estimativa_min),
        negociacao_id = COALESCE(${patch.negociacaoId ?? null}::text, negociacao_id),
        service_key = COALESCE(${patch.serviceKey ?? null}::text, service_key),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM tasks WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }

  async addComment(id: string, comentario: Omit<Comentario, "id" | "em">): Promise<Task | null> {
    await this.ensureSchema();
    const novo: Comentario = { ...comentario, id: crypto.randomUUID(), em: new Date().toISOString() };
    // Append atômico no jsonb + atualiza timestamp
    const { rows } = await this.pool.sql<Row>`
      UPDATE tasks SET
        comentarios = comentarios || ${JSON.stringify([novo])}::jsonb,
        atualizado_em = ${novo.em}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowToTask(rows[0]) : null;
  }
}
