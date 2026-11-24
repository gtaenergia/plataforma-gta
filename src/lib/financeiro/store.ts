import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";
import {
  CONFIG_PADRAO,
  configSchema,
  type ConfigFinanceiro,
  type HistoricoBanco,
  type Lancamento,
  type Recorrente,
  type SaldoConferido,
} from "./tipos";

/**
 * Camada de dados do Financeiro: documentos JSON em coleções, como o banco do
 * artefato de onde o módulo veio (`lanc/<id>`, `rec/<id>`, `config/saldo`,
 * `config/historico`). Mesma estratégia das demais camadas: Postgres em
 * produção, arquivo JSON local em desenvolvimento.
 *
 * Documento, e não colunas, porque o modelo veio pronto e é pequeno (dezenas
 * de lançamentos por mês): o ganho de colunas tipadas não paga uma migração a
 * cada campo novo. A validação mora nas rotas (zod), antes de gravar.
 */

export type Colecao = "lanc" | "rec" | "config";

export interface Doc {
  id: string;
  dados: Record<string, unknown>;
}

export interface FinanceiroStore {
  list(colecao: Colecao): Promise<Doc[]>;
  get(colecao: Colecao, id: string): Promise<Record<string, unknown> | null>;
  put(colecao: Colecao, id: string, dados: Record<string, unknown>, por: string): Promise<void>;
  /** Grava vários de uma vez (importação, conferência de saldo). */
  putMany(colecao: Colecao, docs: Doc[], por: string): Promise<void>;
  remove(colecao: Colecao, id: string): Promise<boolean>;
}

export const novoId = () => crypto.randomUUID();

// ------------------------------------------------------------- JSON (dev)

type Arquivo = Partial<Record<Colecao, Record<string, Record<string, unknown>>>>;

class JsonFinanceiroStore implements FinanceiroStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Arquivo {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return parsed && typeof parsed === "object" ? (parsed as Arquivo) : {};
    } catch {
      return {};
    }
  }
  private mutate<T>(fn: (all: Arquivo) => T): Promise<T> {
    const run = this.queue.then(() => {
      const all = this.readAll();
      const result = fn(all);
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(all, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list(colecao: Colecao) {
    return Object.entries(this.readAll()[colecao] ?? {}).map(([id, dados]) => ({ id, dados }));
  }
  async get(colecao: Colecao, id: string) {
    return this.readAll()[colecao]?.[id] ?? null;
  }
  async put(colecao: Colecao, id: string, dados: Record<string, unknown>) {
    await this.mutate((all) => {
      (all[colecao] ??= {})[id] = dados;
    });
  }
  async putMany(colecao: Colecao, docs: Doc[]) {
    await this.mutate((all) => {
      const c = (all[colecao] ??= {});
      for (const d of docs) c[d.id] = d.dados;
    });
  }
  async remove(colecao: Colecao, id: string) {
    return this.mutate((all) => {
      const c = all[colecao];
      if (!c || !(id in c)) return false;
      delete c[id];
      return true;
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

class PostgresFinanceiroStore implements FinanceiroStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS fin_docs (
          colecao text NOT NULL,
          id text NOT NULL,
          dados jsonb NOT NULL,
          atualizado_por text NOT NULL DEFAULT '',
          atualizado_em timestamptz NOT NULL,
          PRIMARY KEY (colecao, id)
        )
      `.then(() => undefined);
      // Falhou (banco fora do ar)? Tenta de novo na próxima chamada.
      this.ready.catch(() => {
        this.ready = null;
      });
    }
    return this.ready;
  }

  async list(colecao: Colecao) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<{ id: string; dados: Record<string, unknown> }>`
      SELECT id, dados FROM fin_docs WHERE colecao = ${colecao}
    `;
    return rows.map((r) => ({ id: r.id, dados: r.dados }));
  }
  async get(colecao: Colecao, id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<{ dados: Record<string, unknown> }>`
      SELECT dados FROM fin_docs WHERE colecao = ${colecao} AND id = ${id}
    `;
    return rows[0]?.dados ?? null;
  }
  async put(colecao: Colecao, id: string, dados: Record<string, unknown>, por: string) {
    await this.ensureSchema();
    await this.pool.sql`
      INSERT INTO fin_docs (colecao, id, dados, atualizado_por, atualizado_em)
      VALUES (${colecao}, ${id}, ${JSON.stringify(dados)}::jsonb, ${por}, ${new Date().toISOString()})
      ON CONFLICT (colecao, id) DO UPDATE
        SET dados = EXCLUDED.dados, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em
    `;
  }
  async putMany(colecao: Colecao, docs: Doc[], por: string) {
    if (!docs.length) return;
    await this.ensureSchema();
    // Um INSERT só, a partir de um array JSON: ou grava tudo, ou nada.
    const agora = new Date().toISOString();
    await this.pool.sql`
      INSERT INTO fin_docs (colecao, id, dados, atualizado_por, atualizado_em)
      SELECT ${colecao}, d->>'id', d->'dados', ${por}, ${agora}
      FROM jsonb_array_elements(${JSON.stringify(docs)}::jsonb) AS d
      ON CONFLICT (colecao, id) DO UPDATE
        SET dados = EXCLUDED.dados, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em
    `;
  }
  async remove(colecao: Colecao, id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM fin_docs WHERE colecao = ${colecao} AND id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaFinanceiroStore?: FinanceiroStore };

export function getFinanceiroStore(): FinanceiroStore {
  if (!g.__gtaFinanceiroStore) {
    g.__gtaFinanceiroStore = getDbUrl()
      ? new PostgresFinanceiroStore()
      : new JsonFinanceiroStore(path.join(process.cwd(), "data", "financeiro.json"));
  }
  return g.__gtaFinanceiroStore;
}

// ------------------------------------------------------------ leitura tipada

export interface DadosFinanceiro {
  lanc: Lancamento[];
  rec: Recorrente[];
  saldo: SaldoConferido | null;
  historico: HistoricoBanco | null;
  config: ConfigFinanceiro;
}

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Lê tudo do Financeiro. Os documentos passam por uma normalização tolerante
 * (e não por zod estrito): um campo estranho num documento antigo não pode
 * sumir com o lançamento inteiro da tela — o dinheiro dele existe.
 */
export async function carregarFinanceiro(store = getFinanceiroStore()): Promise<DadosFinanceiro> {
  const [lancDocs, recDocs, cfgDocs] = await Promise.all([store.list("lanc"), store.list("rec"), store.list("config")]);

  const lanc: Lancamento[] = lancDocs.map(({ id, dados: d }) => ({
    id,
    k: d.k === "r" ? "r" : "d",
    desc: str(d.desc),
    valor: num(d.valor),
    data: str(d.data),
    nat: d.nat === "fixo" ? "fixo" : "variavel",
    cat: str(d.cat) || "Outros",
    quem: str(d.quem),
    proj: str(d.proj),
    pago: d.pago === true,
    pagoEm: str(d.pagoEm) || undefined,
    rec: str(d.rec) || undefined,
    mes: str(d.mes) || undefined,
    skip: d.skip === true || undefined,
    negociacaoId: str(d.negociacaoId) || undefined,
    dre: (str(d.dre) || undefined) as Lancamento["dre"],
    by: str(d.by) || undefined,
    byNome: str(d.byNome) || undefined,
    ts: num(d.ts) || undefined,
  }));

  const rec: Recorrente[] = recDocs.map(({ id, dados: d }) => ({
    id,
    k: d.k === "r" ? "r" : "d",
    desc: str(d.desc),
    valor: num(d.valor),
    dia: Math.min(31, Math.max(1, Math.round(num(d.dia)) || 1)),
    ini: str(d.ini),
    fim: str(d.fim) || null,
    nat: "fixo",
    cat: str(d.cat) || "Outros",
    quem: str(d.quem),
    proj: str(d.proj),
    dre: (str(d.dre) || undefined) as Recorrente["dre"],
    by: str(d.by) || undefined,
    byNome: str(d.byNome) || undefined,
    ts: num(d.ts) || undefined,
  }));

  const cfg = new Map(cfgDocs.map((d) => [d.id, d.dados]));
  const s = cfg.get("saldo");
  const saldo: SaldoConferido | null =
    s && str(s.data) && isFinite(Number(s.valor))
      ? { data: str(s.data), valor: num(s.valor), byNome: str(s.byNome) || undefined, ts: num(s.ts) || undefined }
      : null;
  const h = cfg.get("historico");
  const historico: HistoricoBanco | null =
    h && Array.isArray(h.meses)
      ? {
          fonte: str(h.fonte),
          meses: (h.meses as Record<string, unknown>[]).map((x) => ({ m: str(x.m), ent: num(x.ent), sai: num(x.sai), fim: num(x.fim) })),
        }
      : null;
  const dre = configSchema.safeParse(cfg.get("dre") ?? {});
  const config: ConfigFinanceiro = dre.success && cfg.has("dre") ? dre.data : CONFIG_PADRAO;

  return { lanc, rec, saldo, historico, config };
}
