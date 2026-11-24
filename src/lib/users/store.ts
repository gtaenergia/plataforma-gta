import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { Role, User } from "./types";
import { hashPassword } from "./password";
import { getDbUrl } from "../tasks/postgres-store";
import { ehSocioComAcessoInicial } from "../financeiro/acesso-inicial";

/**
 * Camada de dados de Usuários. Mesma estratégia das Tarefas:
 * - Produção: PostgresUserStore (banco na nuvem).
 * - Desenvolvimento: JsonUserStore (data/users.json).
 * A tabela/arquivo é semeada uma vez a partir de APP_USERS (os usuários iniciais
 * viram administradores). Depois, o gerenciamento é feito dentro da plataforma.
 */

export class EmailEmUsoError extends Error {
  constructor() {
    super("EMAIL_EXISTS");
    this.name = "EmailEmUsoError";
  }
}

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  cargoId?: string;
  comercial?: boolean;
  financeiro?: boolean;
  mustChangePassword: boolean;
  active: boolean;
}

/** `cargoId: null` limpa o cargo; ausente = não altera. */
export type UserPatch = Partial<Pick<User, "name" | "role" | "active" | "avatarUrl" | "comercial" | "financeiro">> & { cargoId?: string | null };

export interface UserStore {
  list(): Promise<User[]>;
  count(): Promise<number>;
  getByEmail(email: string): Promise<User | null>;
  getById(id: string): Promise<User | null>;
  create(u: NewUser): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User | null>;
  setPassword(id: string, passwordHash: string, mustChangePassword: boolean): Promise<User | null>;
  remove(id: string): Promise<boolean>;
}

const norm = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------- JSON (dev)

class JsonUserStore implements UserStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): User[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as User[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(users: User[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (users: User[]) => { users: User[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { users, result } = fn(this.readAll());
      this.writeAll(users);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return this.readAll();
  }
  async count() {
    return this.readAll().length;
  }
  async getByEmail(email: string) {
    const e = norm(email);
    return this.readAll().find((u) => u.email === e) ?? null;
  }
  async getById(id: string) {
    return this.readAll().find((u) => u.id === id) ?? null;
  }
  async create(u: NewUser) {
    const now = new Date().toISOString();
    const user: User = { ...u, email: norm(u.email), id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((users) => {
      if (users.some((x) => x.email === user.email)) throw new EmailEmUsoError();
      return { users: [...users, user], result: user };
    });
  }
  async update(id: string, patch: UserPatch) {
    return this.mutate((users) => {
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return { users, result: null };
      const merged = { ...users[i], ...patch, atualizadoEm: new Date().toISOString() };
      // cargoId null (limpar) -> sem cargo (undefined)
      const updated: User = { ...merged, cargoId: merged.cargoId ?? undefined };
      const next = [...users];
      next[i] = updated;
      return { users: next, result: updated };
    });
  }
  async setPassword(id: string, passwordHash: string, mustChangePassword: boolean) {
    return this.mutate((users) => {
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return { users, result: null };
      const updated = { ...users[i], passwordHash, mustChangePassword, atualizadoEm: new Date().toISOString() };
      const next = [...users];
      next[i] = updated;
      return { users: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((users) => {
      const next = users.filter((u) => u.id !== id);
      return { users: next, result: next.length !== users.length };
    });
  }
}

// ------------------------------------------------------------ Postgres (prod)

interface Row {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  cargo_id: string | null;
  comercial: boolean | null;
  financeiro: boolean | null;
  must_change_password: boolean;
  active: boolean;
  avatar_url: string | null;
  criado_em: string;
  atualizado_em: string;
}
const rowToUser = (r: Row): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  passwordHash: r.password_hash,
  role: r.role as Role,
  cargoId: r.cargo_id ?? undefined,
  comercial: r.comercial ?? false,
  financeiro: r.financeiro ?? false,
  mustChangePassword: r.must_change_password,
  active: r.active,
  avatarUrl: r.avatar_url ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresUserStore implements UserStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS users (
          id uuid PRIMARY KEY,
          email text UNIQUE NOT NULL,
          name text NOT NULL,
          password_hash text NOT NULL,
          role text NOT NULL DEFAULT 'member',
          must_change_password boolean NOT NULL DEFAULT false,
          active boolean NOT NULL DEFAULT true,
          avatar_url text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        // Garante a coluna cargo_id em tabelas criadas antes do RBAC por cargos
        .then(() => this.pool.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS cargo_id text`)
        .then(() => this.pool.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text`)
        // Quem já existia nasce fora do time comercial: marcar é decisão do
        // administrador, não palpite da migração.
        .then(() => this.pool.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS comercial boolean NOT NULL DEFAULT false`)
        .then(() => this.migrarFinanceiro())
        .then(() => undefined);
    }
    return this.ready;
  }
  /**
   * Cria a coluna `financeiro` e, SÓ na criação, dá o acesso aos três sócios
   * que já usavam o controle financeiro (Tito, Paulo Vitor e Gabriel). Depois
   * disso, quem acessa é decidido em Gerenciar usuários — a migração não
   * volta a mexer, nem se alguém desmarcar um deles.
   */
  private async migrarFinanceiro(): Promise<void> {
    const { rows: existe } = await this.pool.sql`
      SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'financeiro'
    `;
    if (existe.length) return;
    await this.pool.sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS financeiro boolean NOT NULL DEFAULT false`;
    const { rows } = await this.pool.sql<{ id: string; name: string }>`SELECT id, name FROM users WHERE active`;
    for (const u of rows.filter((r) => ehSocioComAcessoInicial(r.name))) {
      await this.pool.sql`UPDATE users SET financeiro = true WHERE id = ${u.id}`;
    }
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM users ORDER BY name ASC`;
    return rows.map(rowToUser);
  }
  async count() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<{ n: number }>`SELECT COUNT(*)::int AS n FROM users`;
    return rows[0]?.n ?? 0;
  }
  async getByEmail(email: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM users WHERE email = ${norm(email)}`;
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  async getById(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM users WHERE id = ${id}`;
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  async create(u: NewUser) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const { rows } = await this.pool.sql<Row>`
        INSERT INTO users (id, email, name, password_hash, role, cargo_id, comercial, financeiro, must_change_password, active, criado_em, atualizado_em)
        VALUES (${id}, ${norm(u.email)}, ${u.name}, ${u.passwordHash}, ${u.role}, ${u.cargoId ?? null}, ${u.comercial ?? false}, ${u.financeiro ?? false}, ${u.mustChangePassword}, ${u.active}, ${now}, ${now})
        RETURNING *
      `;
      return rowToUser(rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new EmailEmUsoError();
      throw e;
    }
  }
  async update(id: string, patch: UserPatch) {
    await this.ensureSchema();
    const cur = await this.getById(id);
    if (!cur) return null;
    const merged = { ...cur, ...patch };
    const cargoId = merged.cargoId ?? null; // null (limpar) -> sem cargo
    const atualizadoEm = new Date().toISOString();
    await this.pool.sql`
      UPDATE users SET name = ${merged.name}, role = ${merged.role}, cargo_id = ${cargoId},
        comercial = ${merged.comercial ?? false}, financeiro = ${merged.financeiro ?? false}, active = ${merged.active}, avatar_url = ${merged.avatarUrl ?? null},
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
    `;
    return { ...cur, ...patch, cargoId: cargoId ?? undefined, atualizadoEm };
  }
  async setPassword(id: string, passwordHash: string, mustChangePassword: boolean) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`
      UPDATE users SET password_hash = ${passwordHash}, must_change_password = ${mustChangePassword}, atualizado_em = ${new Date().toISOString()}
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM users WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

// ------------------------------------------------------------------ seleção

const g = globalThis as unknown as { __gtaUserStore?: UserStore; __gtaUserSeed?: Promise<void> };

function getUserStore(): UserStore {
  if (!g.__gtaUserStore) {
    g.__gtaUserStore = getDbUrl()
      ? new PostgresUserStore()
      : new JsonUserStore(path.join(process.cwd(), "data", "users.json"));
  }
  return g.__gtaUserStore;
}

/** Usuários iniciais a partir de APP_USERS (viram admin). Sem depender de auth.ts. */
function seedSource(): { email: string; name: string; password: string }[] {
  const raw = process.env.APP_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { email: string; name?: string; password: string }[];
      if (Array.isArray(parsed)) return parsed.map((u) => ({ email: u.email, name: u.name ?? u.email, password: u.password }));
    } catch {
      // ignora JSON inválido
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return [{ email: "admin@gta.com", name: "Administrador", password: "gta123" }];
  }
  return [];
}

async function seed(store: UserStore): Promise<void> {
  if ((await store.count()) > 0) return;
  for (const s of seedSource()) {
    try {
      await store.create({
        email: s.email,
        name: s.name,
        passwordHash: hashPassword(s.password),
        role: "admin",
        mustChangePassword: false,
        active: true,
      });
    } catch {
      // e-mail duplicado (semeadura concorrente) — ignora
    }
  }
}

/** Acessa o store garantindo a semeadura inicial (idempotente). */
export async function users(): Promise<UserStore> {
  const store = getUserStore();
  if (!g.__gtaUserSeed) g.__gtaUserSeed = seed(store);
  await g.__gtaUserSeed;
  return store;
}
