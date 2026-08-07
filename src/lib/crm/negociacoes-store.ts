import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { Anotacao, Negociacao, ProdutoNegociado } from "./types";
import { getDbUrl } from "../tasks/postgres-store";

/**
 * Camada de dados das negociações — a entidade central do CRM.
 *
 * Produtos, anotações e contatos vinculados moram em jsonb na própria linha
 * (mesmo padrão de orcamentos.comentarios/historico): são detalhes da
 * negociação, não entidades com vida própria.
 *
 * `appendAnotacao` é a ÚNICA porta de escrita do histórico — acrescenta, nunca
 * substitui. O patch de `update` não aceita `anotacoes` de propósito: aceitar
 * seria permitir que um PATCH reescrevesse o passado.
 */

type CreateInput = Omit<Negociacao, "id" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<Negociacao, "id" | "criadoEm" | "criadoPor" | "anotacoes">>;

export interface NegociacaoStore {
  list(): Promise<Negociacao[]>;
  get(id: string): Promise<Negociacao | null>;
  create(data: CreateInput): Promise<Negociacao>;
  update(id: string, patch: UpdatePatch): Promise<Negociacao | null>;
  appendAnotacao(id: string, anotacao: Anotacao): Promise<Negociacao | null>;
  remove(id: string): Promise<boolean>;
}

/** Fábrica de anotação — o id e o carimbo nascem aqui, não em quem chama. */
export function novaAnotacao(dados: Omit<Anotacao, "id" | "criadoEm">): Anotacao {
  return { ...dados, id: crypto.randomUUID(), criadoEm: new Date().toISOString() };
}

// ------------------------------------------------------------- JSON (dev)

class JsonNegociacaoStore implements NegociacaoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Negociacao[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Negociacao[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: Negociacao[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Negociacao[]) => { items: Negociacao[]; result: T }): Promise<T> {
    const run = this.queue.then(() => {
      const { items, result } = fn(this.readAll());
      this.writeAll(items);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    // Mais recentes primeiro — a lista abre no que está acontecendo agora.
    return this.readAll().sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }
  async get(id: string) {
    return this.readAll().find((n) => n.id === id) ?? null;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    const n: Negociacao = { ...data, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
    return this.mutate((items) => ({ items: [...items, n], result: n }));
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((n) => n.id === id);
      if (i < 0) return { items, result: null };
      const updated: Negociacao = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async appendAnotacao(id: string, anotacao: Anotacao) {
    return this.mutate((items) => {
      const i = items.findIndex((n) => n.id === id);
      if (i < 0) return { items, result: null };
      const updated: Negociacao = {
        ...items[i],
        anotacoes: [...items[i].anotacoes, anotacao],
        atualizadoEm: new Date().toISOString(),
      };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((n) => n.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  nome: string;
  funil_id: string;
  etapa_id: string;
  valor: string | number;
  empresa_id: string;
  empresa_nome: string;
  contato_ids: string[] | string;
  responsavel: string;
  responsavel_nome: string;
  fonte_id: string;
  fonte_nome: string;
  situacao: string;
  motivo_perda_id: string;
  motivo_perda_nome: string;
  previsao: string;
  qualificacao: number;
  produtos: ProdutoNegociado[] | string;
  anotacoes: Anotacao[] | string;
  fechado_em: string;
  fechado_por: string;
  criado_por: string;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

function jsonb<T>(v: T[] | string | null | undefined): T[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const rowTo = (r: Row): Negociacao => ({
  id: r.id,
  nome: r.nome,
  funilId: r.funil_id,
  etapaId: r.etapa_id,
  valor: Number(r.valor ?? 0),
  empresaId: r.empresa_id ?? "",
  empresaNome: r.empresa_nome ?? "",
  contatoIds: jsonb<string>(r.contato_ids),
  responsavel: r.responsavel ?? "",
  responsavelNome: r.responsavel_nome ?? "",
  fonteId: r.fonte_id ?? "",
  fonteNome: r.fonte_nome ?? "",
  situacao: (r.situacao as Negociacao["situacao"]) ?? "aberta",
  motivoPerdaId: r.motivo_perda_id ?? "",
  motivoPerdaNome: r.motivo_perda_nome ?? "",
  previsao: r.previsao ?? "",
  qualificacao: Number(r.qualificacao ?? 0),
  produtos: jsonb<ProdutoNegociado>(r.produtos),
  anotacoes: jsonb<Anotacao>(r.anotacoes),
  fechadoEm: r.fechado_em ?? "",
  fechadoPor: r.fechado_por ?? "",
  criadoPor: r.criado_por,
  criadoPorNome: r.criado_por_nome ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresNegociacaoStore implements NegociacaoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS crm_negociacoes (
          id uuid PRIMARY KEY,
          nome text NOT NULL,
          funil_id text NOT NULL,
          etapa_id text NOT NULL,
          valor numeric NOT NULL DEFAULT 0,
          empresa_id text NOT NULL DEFAULT '',
          empresa_nome text NOT NULL DEFAULT '',
          contato_ids jsonb NOT NULL DEFAULT '[]',
          responsavel text NOT NULL DEFAULT '',
          responsavel_nome text NOT NULL DEFAULT '',
          fonte_id text NOT NULL DEFAULT '',
          fonte_nome text NOT NULL DEFAULT '',
          situacao text NOT NULL DEFAULT 'aberta',
          motivo_perda_id text NOT NULL DEFAULT '',
          motivo_perda_nome text NOT NULL DEFAULT '',
          previsao text NOT NULL DEFAULT '',
          qualificacao integer NOT NULL DEFAULT 0,
          produtos jsonb NOT NULL DEFAULT '[]',
          anotacoes jsonb NOT NULL DEFAULT '[]',
          fechado_em text NOT NULL DEFAULT '',
          fechado_por text NOT NULL DEFAULT '',
          criado_por text NOT NULL,
          criado_por_nome text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`CREATE INDEX IF NOT EXISTS crm_negociacoes_funil_idx ON crm_negociacoes (funil_id, situacao)`)
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
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_negociacoes ORDER BY criado_em DESC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM crm_negociacoes WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO crm_negociacoes
        (id, nome, funil_id, etapa_id, valor, empresa_id, empresa_nome, contato_ids,
         responsavel, responsavel_nome, fonte_id, fonte_nome, situacao, motivo_perda_id,
         motivo_perda_nome, previsao, qualificacao, produtos, anotacoes, fechado_em,
         fechado_por, criado_por, criado_por_nome, criado_em, atualizado_em)
      VALUES
        (${id}, ${data.nome}, ${data.funilId}, ${data.etapaId}, ${data.valor}, ${data.empresaId},
         ${data.empresaNome}, ${JSON.stringify(data.contatoIds)}::jsonb, ${data.responsavel},
         ${data.responsavelNome}, ${data.fonteId}, ${data.fonteNome}, ${data.situacao},
         ${data.motivoPerdaId}, ${data.motivoPerdaNome}, ${data.previsao}, ${data.qualificacao},
         ${JSON.stringify(data.produtos)}::jsonb, ${JSON.stringify(data.anotacoes)}::jsonb,
         ${data.fechadoEm}, ${data.fechadoPor}, ${data.criadoPor}, ${data.criadoPorNome ?? null}, ${now}, ${now})
    `;
    return { ...data, id, criadoEm: now, atualizadoEm: now };
  }
  async update(id: string, patch: UpdatePatch) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_negociacoes SET
        nome = COALESCE(${patch.nome ?? null}::text, nome),
        funil_id = COALESCE(${patch.funilId ?? null}::text, funil_id),
        etapa_id = COALESCE(${patch.etapaId ?? null}::text, etapa_id),
        valor = COALESCE(${patch.valor ?? null}::numeric, valor),
        empresa_id = COALESCE(${patch.empresaId ?? null}::text, empresa_id),
        empresa_nome = COALESCE(${patch.empresaNome ?? null}::text, empresa_nome),
        contato_ids = COALESCE(${patch.contatoIds ? JSON.stringify(patch.contatoIds) : null}::jsonb, contato_ids),
        responsavel = COALESCE(${patch.responsavel ?? null}::text, responsavel),
        responsavel_nome = COALESCE(${patch.responsavelNome ?? null}::text, responsavel_nome),
        fonte_id = COALESCE(${patch.fonteId ?? null}::text, fonte_id),
        fonte_nome = COALESCE(${patch.fonteNome ?? null}::text, fonte_nome),
        situacao = COALESCE(${patch.situacao ?? null}::text, situacao),
        motivo_perda_id = COALESCE(${patch.motivoPerdaId ?? null}::text, motivo_perda_id),
        motivo_perda_nome = COALESCE(${patch.motivoPerdaNome ?? null}::text, motivo_perda_nome),
        previsao = COALESCE(${patch.previsao ?? null}::text, previsao),
        qualificacao = COALESCE(${patch.qualificacao ?? null}::integer, qualificacao),
        produtos = COALESCE(${patch.produtos ? JSON.stringify(patch.produtos) : null}::jsonb, produtos),
        fechado_em = COALESCE(${patch.fechadoEm ?? null}::text, fechado_em),
        fechado_por = COALESCE(${patch.fechadoPor ?? null}::text, fechado_por),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async appendAnotacao(id: string, anotacao: Anotacao) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE crm_negociacoes SET
        anotacoes = anotacoes || ${JSON.stringify([anotacao])}::jsonb,
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM crm_negociacoes WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaCrmNegociacaoStore?: NegociacaoStore };

export function getNegociacaoStore(): NegociacaoStore {
  if (!g.__gtaCrmNegociacaoStore) {
    g.__gtaCrmNegociacaoStore = getDbUrl()
      ? new PostgresNegociacaoStore()
      : new JsonNegociacaoStore(path.join(process.cwd(), "data", "crm-negociacoes.json"));
  }
  return g.__gtaCrmNegociacaoStore;
}
