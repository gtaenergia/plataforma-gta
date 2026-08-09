import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { CampoPersonalizado } from "./campos";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados dos campos personalizados da negociação.
 *
 * Sem `remove()`: campo se ARQUIVA. Excluir apagaria a definição de um dado que
 * já foi digitado em negociações — o valor continuaria no jsonb sem rótulo,
 * sem tipo e sem como exibir. Mesma regra do catálogo de produtos.
 */

type CreateInput = Omit<CampoPersonalizado, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<CampoPersonalizado, "id" | "criadoEm" | "tipo">>;

export interface CampoStore {
  list(): Promise<CampoPersonalizado[]>;
  create(data: CreateInput): Promise<CampoPersonalizado>;
  update(id: string, patch: UpdatePatch): Promise<CampoPersonalizado | null>;
}

/** Ordem da tela: `ordem` e, no empate, a criação — para não dançar a cada render. */
const ordenar = (a: CampoPersonalizado, b: CampoPersonalizado) =>
  a.ordem - b.ordem || a.criadoEm.localeCompare(b.criadoEm);

// ------------------------------------------------------------- JSON (dev)

class JsonCampoStore implements CampoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): CampoPersonalizado[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      // Campo novo em arquivo antigo volta `undefined`; normalizar aqui evita
      // `<select value={undefined}>` e componente descontrolado na tela.
      return Array.isArray(parsed)
        ? (parsed as CampoPersonalizado[]).map((c) => ({
            ...c,
            opcoes: c.opcoes ?? [],
            obrigatorio: !!c.obrigatorio,
            obrigatorioNaEtapaId: c.obrigatorioNaEtapaId ?? "",
            ajuda: c.ajuda ?? "",
            ordem: Number(c.ordem ?? 0),
            arquivado: !!c.arquivado,
          }))
        : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: CampoPersonalizado[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: CampoPersonalizado[]) => { items: CampoPersonalizado[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return this.readAll().sort(ordenar);
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const c: CampoPersonalizado = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, c], result: c }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((c) => c.id === id);
      if (i < 0) return { items, result: null };
      const updated: CampoPersonalizado = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  rotulo: string;
  tipo: string;
  opcoes: string[] | string;
  obrigatorio: boolean;
  obrigatorio_na_etapa_id: string;
  ajuda: string;
  ordem: number;
  arquivado: boolean;
  criado_em: string;
  atualizado_em: string;
}
const rowTo = (r: Row): CampoPersonalizado => ({
  id: r.id,
  rotulo: r.rotulo,
  tipo: (r.tipo as CampoPersonalizado["tipo"]) ?? "texto",
  opcoes: typeof r.opcoes === "string" ? (JSON.parse(r.opcoes) as string[]) : (r.opcoes ?? []),
  obrigatorio: !!r.obrigatorio,
  obrigatorioNaEtapaId: r.obrigatorio_na_etapa_id ?? "",
  ajuda: r.ajuda ?? "",
  ordem: Number(r.ordem ?? 0),
  arquivado: !!r.arquivado,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresCampoStore implements CampoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_campos (
          id uuid PRIMARY KEY,
          rotulo text NOT NULL,
          tipo text NOT NULL DEFAULT 'texto',
          opcoes jsonb NOT NULL DEFAULT '[]',
          obrigatorio boolean NOT NULL DEFAULT false,
          obrigatorio_na_etapa_id text NOT NULL DEFAULT '',
          ajuda text NOT NULL DEFAULT '',
          ordem integer NOT NULL DEFAULT 0,
          arquivado boolean NOT NULL DEFAULT false,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
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
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_campos ORDER BY ordem ASC, criado_em ASC`;
    return rows.map(rowTo);
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_campos
        (id, rotulo, tipo, opcoes, obrigatorio, obrigatorio_na_etapa_id, ajuda, ordem, arquivado, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.rotulo}, ${data.tipo}, ${JSON.stringify(data.opcoes)}::jsonb, ${data.obrigatorio},
         ${data.obrigatorioNaEtapaId}, ${data.ajuda}, ${data.ordem}, ${data.arquivado}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    // `tipo` fora do UPDATE de propósito: trocá-lo transformaria o que já foi
    // gravado em lixo silencioso (ver o comentário em campos.ts).
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_campos SET
        rotulo = COALESCE(${patch.rotulo ?? null}::text, rotulo),
        opcoes = COALESCE(${patch.opcoes ? JSON.stringify(patch.opcoes) : null}::jsonb, opcoes),
        obrigatorio = COALESCE(${patch.obrigatorio ?? null}::boolean, obrigatorio),
        obrigatorio_na_etapa_id = COALESCE(${patch.obrigatorioNaEtapaId ?? null}::text, obrigatorio_na_etapa_id),
        ajuda = COALESCE(${patch.ajuda ?? null}::text, ajuda),
        ordem = COALESCE(${patch.ordem ?? null}::integer, ordem),
        arquivado = COALESCE(${patch.arquivado ?? null}::boolean, arquivado),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
}

const g = globalThis as unknown as { __gtaCrmCampoStore?: CampoStore };

export function getCampoStore(): CampoStore {
  if (!g.__gtaCrmCampoStore) {
    g.__gtaCrmCampoStore = getDbUrl()
      ? new PostgresCampoStore()
      : new JsonCampoStore(path.join(process.cwd(), "data", "crm-campos.json"));
  }
  return g.__gtaCrmCampoStore;
}
