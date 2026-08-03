import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import { SERVICO_OUTRO, type Proposta } from "./types";
import { getDbUrl } from "../tasks/postgres-store";
import { buildReference, clientSlug } from "../format";
import { getService } from "@/services/registry";

const prefixo = (serviceKey: string) => getService(serviceKey)?.referencePrefix ?? serviceKey.toUpperCase();

/**
 * Prefixo da referência. Nos 12 serviços vem do registro; na proposta avulsa
 * ("outro") vem do nome que a pessoa digitou, senão o código sairia
 * GTA-2026-CLIENTE-OUTRO-001 e não diria de que serviço se trata.
 *
 * Usa a PRIMEIRA palavra, e não o nome inteiro cortado: "Consultoria
 * tarifária" vira CONSULTORIA, não CONSULTORIAT. Cortar no meio da palavra
 * deixa o código com cara de defeito, e os prefixos do registro são curtos e
 * inteiros ("SOLAR", "PROJSE", "EV").
 */
function prefixoDe(serviceKey: string, dados: Record<string, unknown>): string {
  if (serviceKey === SERVICO_OUTRO) {
    const bruto = typeof dados?.servicoOutro === "string" ? dados.servicoOutro : "";
    const nome = clientSlug(bruto.trim().split(/\s+/)[0] ?? "").slice(0, 12);
    if (nome) return nome;
  }
  return prefixo(serviceKey);
}

/** Maior sequencial já usado por (serviço, ano) a partir das referências existentes. */
function maiorSeq(items: Proposta[], serviceKey: string, year: number): number {
  let max = 0;
  for (const p of items) {
    if (p.serviceKey !== serviceKey) continue;
    if (new Date(p.criadoEm).getFullYear() !== year) continue;
    const m = p.referencia?.match(/-(\d+)$/);
    const n = m ? parseInt(m[1], 10) : 0;
    if (n > max) max = n;
  }
  return max;
}

/**
 * Gera a referência automaticamente (GTA-ANO-CLIENTE-PREFIXO-00N) quando o
 * chamador não informou uma. Usa o seq já presente em `dados.referenciaSeq`
 * (mantendo consistência com o .docx) ou o próximo sequencial do serviço/ano.
 */
function referenciaAuto(
  serviceKey: string,
  cliente: string,
  dados: Record<string, unknown>,
  proximoSeq: number,
): string {
  const seqForm = Number(dados?.referenciaSeq);
  const seq = Number.isFinite(seqForm) && seqForm > 0 ? seqForm : proximoSeq;
  return buildReference(prefixoDe(serviceKey, dados), cliente || "cliente", seq, new Date().getFullYear());
}

/**
 * Camada de dados das Propostas (histórico/rascunhos). Mesmo padrão de Tarefas:
 * Postgres em produção, arquivo JSON local em desenvolvimento.
 */

export interface PropostaStore {
  list(): Promise<Proposta[]>;
  get(id: string): Promise<Proposta | null>;
  create(data: Omit<Proposta, "id" | "criadoEm" | "atualizadoEm">): Promise<Proposta>;
  update(id: string, patch: Partial<Omit<Proposta, "id">>): Promise<Proposta | null>;
  remove(id: string): Promise<boolean>;
  /** Próximo sequencial de referência para o serviço (ano corrente). */
  nextSeq(serviceKey: string): Promise<number>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonPropostaStore implements PropostaStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Proposta[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as Proposta[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(items: Proposta[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Proposta[]) => { items: Proposta[]; result: T }): Promise<T> {
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
  async create(data: Omit<Proposta, "id" | "criadoEm" | "atualizadoEm">) {
    const now = new Date().toISOString();
    return this.mutate((items) => {
      const referencia = data.referencia?.trim()
        ? data.referencia
        : referenciaAuto(data.serviceKey, data.cliente, data.dados, maiorSeq(items, data.serviceKey, new Date().getFullYear()) + 1);
      const p: Proposta = { ...data, referencia, id: crypto.randomUUID(), criadoEm: now, atualizadoEm: now };
      return { items: [...items, p], result: p };
    });
  }
  async nextSeq(serviceKey: string) {
    return maiorSeq(this.readAll(), serviceKey, new Date().getFullYear()) + 1;
  }
  async update(id: string, patch: Partial<Omit<Proposta, "id">>) {
    return this.mutate((items) => {
      const i = items.findIndex((p) => p.id === id);
      if (i < 0) return { items, result: null };
      const updated = { ...items[i], ...patch, id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((p) => p.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

interface Row {
  id: string;
  service_key: string;
  cliente: string;
  referencia: string;
  status: string;
  dados: Record<string, unknown>;
  form_gerado: Record<string, unknown> | null;
  manual: boolean | null;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
}
const rowToProposta = (r: Row): Proposta => ({
  id: r.id,
  serviceKey: r.service_key,
  cliente: r.cliente,
  referencia: r.referencia,
  status: r.status as Proposta["status"],
  dados: r.dados ?? {},
  formGerado: r.form_gerado ?? undefined,
  // `?? false`: as linhas gravadas antes da coluna existir voltam null.
  manual: r.manual ?? false,
  criadoPor: r.criado_por,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresPropostaStore implements PropostaStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS propostas (
          id uuid PRIMARY KEY,
          service_key text NOT NULL,
          cliente text NOT NULL,
          referencia text NOT NULL DEFAULT '',
          status text NOT NULL DEFAULT 'rascunho',
          dados jsonb NOT NULL DEFAULT '{}',
          form_gerado jsonb,
          criado_por text NOT NULL,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        .then(() => this.pool.sql`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS form_gerado jsonb`)
        .then(() => this.pool.sql`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false`)
        .then(() => undefined);
    }
    return this.ready;
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM propostas ORDER BY atualizado_em DESC`;
    return rows.map(rowToProposta);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM propostas WHERE id = ${id}`;
    return rows[0] ? rowToProposta(rows[0]) : null;
  }
  async create(data: Omit<Proposta, "id" | "criadoEm" | "atualizadoEm">) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const referencia = data.referencia?.trim()
      ? data.referencia
      : referenciaAuto(data.serviceKey, data.cliente, data.dados, await this.nextSeq(data.serviceKey));
    await this.pool.sql`
      INSERT INTO propostas (id, service_key, cliente, referencia, status, dados, form_gerado, manual, criado_por, criado_em, atualizado_em)
      VALUES (${id}, ${data.serviceKey}, ${data.cliente}, ${referencia}, ${data.status},
              ${JSON.stringify(data.dados)}::jsonb, ${data.formGerado ? JSON.stringify(data.formGerado) : null}::jsonb,
              ${data.manual}, ${data.criadoPor}, ${now}, ${now})
    `;
    return { ...data, referencia, id, criadoEm: now, atualizadoEm: now };
  }
  async nextSeq(serviceKey: string) {
    await this.ensureSchema();
    const year = new Date().getFullYear();
    const { rows } = await this.pool.sql<{ referencia: string }>`
      SELECT referencia FROM propostas
      WHERE service_key = ${serviceKey} AND date_part('year', criado_em) = ${year}
    `;
    let max = 0;
    for (const r of rows) {
      const m = r.referencia?.match(/-(\d+)$/);
      const n = m ? parseInt(m[1], 10) : 0;
      if (n > max) max = n;
    }
    return max + 1;
  }
  async update(id: string, patch: Partial<Omit<Proposta, "id">>) {
    await this.ensureSchema();
    const atualizadoEm = new Date().toISOString();
    const dadosJson = patch.dados === undefined ? null : JSON.stringify(patch.dados);
    const formGeradoJson = patch.formGerado === undefined ? null : JSON.stringify(patch.formGerado);
    const { rows } = await this.pool.sql<Row>`
      UPDATE propostas SET
        service_key = COALESCE(${patch.serviceKey ?? null}::text, service_key),
        cliente = COALESCE(${patch.cliente ?? null}::text, cliente),
        referencia = COALESCE(${patch.referencia ?? null}::text, referencia),
        status = COALESCE(${patch.status ?? null}::text, status),
        dados = COALESCE(${dadosJson}::jsonb, dados),
        form_gerado = COALESCE(${formGeradoJson}::jsonb, form_gerado),
        manual = COALESCE(${patch.manual ?? null}::boolean, manual),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowToProposta(rows[0]) : null;
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM propostas WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaPropostaStore?: PropostaStore };

export function getPropostaStore(): PropostaStore {
  if (!g.__gtaPropostaStore) {
    g.__gtaPropostaStore = getDbUrl()
      ? new PostgresPropostaStore()
      : new JsonPropostaStore(path.join(process.cwd(), "data", "propostas.json"));
  }
  return g.__gtaPropostaStore;
}
