import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";
import type { DadosProjeto, ProjetoEng } from "./tipos";
import type { DadosRisco } from "./risco/tipos";
import type { DadosQuadro } from "./quadro/tipos";

/**
 * Projetos de engenharia (análise de risco e quadro de cargas). Mesmo padrão
 * dos demais módulos: Postgres em produção, arquivo JSON em desenvolvimento.
 *
 * O conteúdo de cada ferramenta vai inteiro num jsonb: é um documento que a
 * tela edita e o laudo lê, sem consulta por dentro — colunas só para o que a
 * lista filtra e ordena.
 */

export interface PatchProjeto {
  dados?: DadosProjeto;
  risco?: DadosRisco | null;
  quadro?: DadosQuadro | null;
}

export interface ProjetoEngStore {
  list(): Promise<ProjetoEng[]>;
  get(id: string): Promise<ProjetoEng | null>;
  create(dados: DadosProjeto, criadoPor: string): Promise<ProjetoEng>;
  update(id: string, patch: PatchProjeto): Promise<ProjetoEng | null>;
  remove(id: string): Promise<boolean>;
}

class JsonStore implements ProjetoEngStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): ProjetoEng[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as ProjetoEng[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: ProjetoEng[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: ProjetoEng[]) => { items: ProjetoEng[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return this.readAll().sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1));
  }
  async get(id: string) {
    return this.readAll().find((p) => p.id === id) ?? null;
  }
  async create(dados: DadosProjeto, criadoPor: string) {
    const now = new Date().toISOString();
    const p: ProjetoEng = { id: crypto.randomUUID(), dados, risco: null, quadro: null, criadoPor, criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, p], result: p }));
  }
  async update(id: string, patch: PatchProjeto) {
    return this.mutate((items) => {
      const i = items.findIndex((p) => p.id === id);
      if (i < 0) return { items, result: null };
      const atual = items[i];
      const novo: ProjetoEng = {
        ...atual,
        dados: patch.dados ?? atual.dados,
        risco: patch.risco !== undefined ? patch.risco : atual.risco,
        quadro: patch.quadro !== undefined ? patch.quadro : atual.quadro,
        atualizadoEm: new Date().toISOString(),
      };
      const next = [...items];
      next[i] = novo;
      return { items: next, result: novo };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((p) => p.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

interface Row {
  id: string;
  dados: DadosProjeto;
  risco: DadosRisco | null;
  quadro: DadosQuadro | null;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}

const rowTo = (r: Row): ProjetoEng => ({
  id: r.id,
  dados: r.dados,
  risco: r.risco ?? null,
  quadro: r.quadro ?? null,
  criadoPor: r.criado_por,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresStore implements ProjetoEngStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS engenharia_projetos (
          id uuid PRIMARY KEY,
          dados jsonb NOT NULL,
          risco jsonb,
          quadro jsonb,
          criado_por text NOT NULL,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `.then(() => undefined);
    }
    return this.ready;
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM engenharia_projetos ORDER BY atualizado_em DESC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM engenharia_projetos WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(dados: DadosProjeto, criadoPor: string) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO engenharia_projetos (id, dados, risco, quadro, criado_por, criado_em, atualizado_em)
      VALUES (${id}, ${JSON.stringify(dados)}::jsonb, NULL, NULL, ${criadoPor}, ${now}, ${now})
    `;
    return { id, dados, risco: null, quadro: null, criadoPor, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: PatchProjeto) {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const dados = patch.dados === undefined ? null : JSON.stringify(patch.dados);
    // `null` explícito apaga a ferramenta; `undefined` mantém. Por isso o
    // COALESCE não serve para risco/quadro — um CASE distingue os dois.
    const mexeRisco = patch.risco !== undefined;
    const risco = patch.risco == null ? null : JSON.stringify(patch.risco);
    const mexeQuadro = patch.quadro !== undefined;
    const quadro = patch.quadro == null ? null : JSON.stringify(patch.quadro);
    const { rows } = await this.pool.sql<Row>`
      UPDATE engenharia_projetos SET
        dados = COALESCE(${dados}::jsonb, dados),
        risco = CASE WHEN ${mexeRisco} THEN ${risco}::jsonb ELSE risco END,
        quadro = CASE WHEN ${mexeQuadro} THEN ${quadro}::jsonb ELSE quadro END,
        atualizado_em = ${now}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM engenharia_projetos WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaEngStore?: ProjetoEngStore };

export function getProjetoEngStore(): ProjetoEngStore {
  if (!g.__gtaEngStore) {
    g.__gtaEngStore = getDbUrl() ? new PostgresStore() : new JsonStore(path.join(process.cwd(), "data", "engenharia.json"));
  }
  return g.__gtaEngStore;
}
