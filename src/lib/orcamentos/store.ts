import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createPool, type VercelPool } from "@vercel/postgres";
import type { AnexoRef, ComentarioOrcamento, FichaExterna, Orcamento, OrcamentoMeta, OrcamentoOneDrive, RegistroValidacao } from "./types";
import { getDbUrl } from "../tasks/postgres-store";
import { buildReference } from "../format";

/**
 * Camada de dados dos Orçamentos (fluxo de aprovação). Mesmo padrão de Propostas:
 * Postgres em produção, arquivo JSON local em desenvolvimento.
 */

const PREFIXO = "ORC";

function maiorSeq(items: Orcamento[], year: number): number {
  let max = 0;
  for (const o of items) {
    if (new Date(o.criadoEm).getFullYear() !== year) continue;
    const m = o.referencia?.match(/-(\d+)$/);
    const n = m ? parseInt(m[1], 10) : 0;
    if (n > max) max = n;
  }
  return max;
}

type CreateInput = Omit<Orcamento, "id" | "referencia" | "comentarios" | "historico" | "anexos" | "criadoEm" | "atualizadoEm">;
type UpdatePatch = Partial<Omit<Orcamento, "id" | "comentarios" | "historico" | "anexos" | "criadoEm" | "criadoPor">>;

/**
 * Contrato do patch — vale IGUAL nos dois backends:
 *   campo ausente (undefined) → não mexe
 *   ""                        → LIMPA o campo
 *   qualquer outro valor      → grava
 *
 * O sentinela `""` existe porque no Postgres o idioma `COALESCE(x, coluna)`
 * trata NULL como "não mexer" — sem ele não havia como APAGAR uma decisão
 * (o que a reabertura de um orçamento exige). Aplica-se a decididoPor,
 * decididoEm e expiraEm.
 */
export const LIMPAR = "";

/** Traduz o sentinela para o formato do store JSON (o Postgres trata no SQL). */
export function limparSentinelas(patch: UpdatePatch): UpdatePatch {
  const out: UpdatePatch = { ...patch };
  if (out.decididoPor === LIMPAR) out.decididoPor = undefined;
  if (out.decididoEm === LIMPAR) out.decididoEm = undefined;
  if (out.expiraEm === LIMPAR) out.expiraEm = null;
  return out;
}

export interface OrcamentoStore {
  list(): Promise<Orcamento[]>;
  get(id: string): Promise<Orcamento | null>;
  create(data: CreateInput): Promise<Orcamento>;
  update(id: string, patch: UpdatePatch): Promise<Orcamento | null>;
  /**
   * Aplica uma transição de estado: grava o patch E o registro de histórico numa
   * única operação atômica — evita histórico dizendo "Aprovado" com a estação
   * antiga (ou vice-versa) se algo falhar no meio.
   */
  transicionar(id: string, patch: UpdatePatch, registro: Omit<RegistroValidacao, "id" | "em">): Promise<Orcamento | null>;
  addComentario(id: string, c: Omit<ComentarioOrcamento, "id" | "em">): Promise<Orcamento | null>;
  appendHistorico(id: string, r: Omit<RegistroValidacao, "id" | "em">): Promise<Orcamento | null>;
  addAnexo(id: string, anexo: AnexoRef): Promise<Orcamento | null>;
  /** Substitui a lista de anexos (usado ao remover um anexo ou limpar na retenção). */
  setAnexos(id: string, anexos: AnexoRef[]): Promise<Orcamento | null>;
  /** Orçamentos cuja retenção venceu e que ainda têm anexos (para o cron limpar). */
  listExpirados(nowISO: string): Promise<Orcamento[]>;
  nextSeq(): Promise<number>;
  remove(id: string): Promise<boolean>;
}

// ------------------------------------------------------------- JSON (dev)

class JsonOrcamentoStore implements OrcamentoStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): Orcamento[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!Array.isArray(parsed)) return [];
      // Normaliza registros anteriores à Fase 2 (sem `anexos`) e arrays ausentes.
      return (parsed as Orcamento[]).map((o) => ({
        ...o,
        comentarios: Array.isArray(o.comentarios) ? o.comentarios : [],
        historico: Array.isArray(o.historico) ? o.historico : [],
        anexos: Array.isArray(o.anexos) ? o.anexos : [],
      }));
    } catch {
      return [];
    }
  }
  private writeAll(items: Orcamento[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  private mutate<T>(fn: (items: Orcamento[]) => { items: Orcamento[]; result: T }): Promise<T> {
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
    return this.readAll().find((o) => o.id === id) ?? null;
  }
  async nextSeq() {
    return maiorSeq(this.readAll(), new Date().getFullYear()) + 1;
  }
  async create(data: CreateInput) {
    const now = new Date().toISOString();
    return this.mutate((items) => {
      const seq = maiorSeq(items, new Date().getFullYear()) + 1;
      const referencia = buildReference(PREFIXO, data.cliente || "cliente", seq, new Date().getFullYear());
      const o: Orcamento = {
        ...data,
        id: crypto.randomUUID(),
        referencia,
        comentarios: [],
        historico: [],
        anexos: [],
        criadoEm: now,
        atualizadoEm: now,
      };
      return { items: [...items, o], result: o };
    });
  }
  async update(id: string, patch: UpdatePatch) {
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      const updated: Orcamento = { ...items[i], ...limparSentinelas(patch), id, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async transicionar(id: string, patch: UpdatePatch, registro: Omit<RegistroValidacao, "id" | "em">) {
    const novo: RegistroValidacao = { ...registro, id: crypto.randomUUID(), em: new Date().toISOString() };
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      const updated: Orcamento = { ...items[i], ...limparSentinelas(patch), id, historico: [...items[i].historico, novo], atualizadoEm: novo.em };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async addComentario(id: string, c: Omit<ComentarioOrcamento, "id" | "em">) {
    const novo: ComentarioOrcamento = { ...c, id: crypto.randomUUID(), em: new Date().toISOString() };
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      const updated = { ...items[i], comentarios: [...items[i].comentarios, novo], atualizadoEm: novo.em };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async appendHistorico(id: string, r: Omit<RegistroValidacao, "id" | "em">) {
    const novo: RegistroValidacao = { ...r, id: crypto.randomUUID(), em: new Date().toISOString() };
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      const updated = { ...items[i], historico: [...items[i].historico, novo], atualizadoEm: novo.em };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async addAnexo(id: string, anexo: AnexoRef) {
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      // Unicidade de revisão verificada DENTRO da seção serializada (evita corrida).
      if (items[i].anexos.some((a) => a.revisao === anexo.revisao)) return { items, result: null };
      const updated = { ...items[i], anexos: [...items[i].anexos, anexo], atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async setAnexos(id: string, anexos: AnexoRef[]) {
    return this.mutate((items) => {
      const i = items.findIndex((o) => o.id === id);
      if (i < 0) return { items, result: null };
      const updated = { ...items[i], anexos, atualizadoEm: new Date().toISOString() };
      const next = [...items];
      next[i] = updated;
      return { items: next, result: updated };
    });
  }
  async listExpirados(nowISO: string) {
    return this.readAll().filter(
      (o) => o.expiraEm != null && o.expiraEm < nowISO && (o.anexos?.length ?? 0) > 0,
    );
  }
  async remove(id: string) {
    return this.mutate((items) => {
      const next = items.filter((o) => o.id !== id);
      return { items: next, result: next.length !== items.length };
    });
  }
}

// --------------------------------------------------------- Postgres (prod)

export interface Row {
  id: string;
  referencia: string;
  cliente: string;
  fonte: string;
  estacao: string;
  service_key: string;
  proposta_id: string | null;
  descricao: string;
  meta: OrcamentoMeta | null;
  /** `numeric` chega como STRING do Postgres — ver a conversão em `rowTo`. */
  valor: number | string | null;
  ficha: FichaExterna | null;
  comentarios: ComentarioOrcamento[];
  historico: RegistroValidacao[];
  anexos: AnexoRef[];
  parecer: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  expira_em: string | null;
  one_drive: OrcamentoOneDrive | null;
  criado_por: string;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}
/**
 * Converte a linha do Postgres no modelo da aplicação. Exportado porque é a
 * FRONTEIRA onde produção diverge do dev: aqui os tipos crus do driver
 * (numeric como string, timestamptz como Date) viram os tipos que o app espera.
 */
export const rowTo = (r: Row): Orcamento => ({
  id: r.id,
  referencia: r.referencia,
  cliente: r.cliente,
  fonte: r.fonte as Orcamento["fonte"],
  estacao: r.estacao as Orcamento["estacao"],
  serviceKey: r.service_key ?? "",
  propostaId: r.proposta_id ?? undefined,
  descricao: r.descricao ?? "",
  meta: r.meta ?? undefined,
  // O driver devolve `numeric` como string (o pg-types não registra parser
  // para o OID 1700, para não perder precisão). Sem converter aqui, o valor
  // sairia como "R$ 1500.00" em vez de "R$ 1.500,00": String.toLocaleString
  // ignora as opções de formatação de número.
  valor: r.valor == null ? undefined : Number(r.valor),
  ficha: r.ficha ?? undefined,
  comentarios: r.comentarios ?? [],
  historico: r.historico ?? [],
  anexos: r.anexos ?? [],
  parecer: r.parecer ?? undefined,
  decididoPor: r.decidido_por ?? undefined,
  decididoEm: r.decidido_em ? new Date(r.decidido_em).toISOString() : undefined,
  expiraEm: r.expira_em ? new Date(r.expira_em).toISOString() : null,
  oneDrive: r.one_drive ?? undefined,
  criadoPor: r.criado_por,
  criadoPorNome: r.criado_por_nome ?? undefined,
  criadoEm: new Date(r.criado_em).toISOString(),
  atualizadoEm: new Date(r.atualizado_em).toISOString(),
});

class PostgresOrcamentoStore implements OrcamentoStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS orcamentos (
          id uuid PRIMARY KEY,
          referencia text NOT NULL DEFAULT '',
          cliente text NOT NULL,
          fonte text NOT NULL,
          estacao text NOT NULL DEFAULT 'rascunho',
          service_key text NOT NULL DEFAULT '',
          proposta_id uuid,
          descricao text NOT NULL DEFAULT '',
          meta jsonb,
          valor numeric,
          ficha jsonb,
          comentarios jsonb NOT NULL DEFAULT '[]',
          historico jsonb NOT NULL DEFAULT '[]',
          anexos jsonb NOT NULL DEFAULT '[]',
          parecer text,
          decidido_por text,
          decidido_em timestamptz,
          expira_em timestamptz,
          one_drive jsonb,
          criado_por text NOT NULL,
          criado_por_nome text,
          criado_em timestamptz NOT NULL,
          atualizado_em timestamptz NOT NULL
        )
      `
        // Garante colunas adicionadas depois da criação inicial da tabela
        .then(() => this.pool.sql`ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'`)
        .then(() => this.pool.sql`ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS meta jsonb`)
        .then(() => this.pool.sql`ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS one_drive jsonb`)
        // Unicidade da referência (nº comercial): fecha a corrida nextSeq→INSERT.
        // Best-effort: se dados antigos já tiverem duplicata, o índice não é criado
        // e o app segue como antes (o retry do create simplesmente nunca dispara).
        .then(() =>
          this.pool
            .sql`CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_referencia_uidx ON orcamentos (referencia) WHERE referencia <> ''`.then(
              () => undefined,
              () => undefined,
            ),
        )
        .then(() => undefined)
        // Falha transitória (blip de rede no cold start) não pode virar rejeição
        // cacheada para sempre: limpa para a próxima chamada tentar de novo.
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    }
    return this.ready;
  }
  async list() {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM orcamentos ORDER BY atualizado_em DESC`;
    return rows.map(rowTo);
  }
  async get(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`SELECT * FROM orcamentos WHERE id = ${id}`;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async nextSeq() {
    await this.ensureSchema();
    const year = new Date().getFullYear();
    const { rows } = await this.pool.sql<{ referencia: string }>`
      SELECT referencia FROM orcamentos WHERE date_part('year', criado_em) = ${year}
    `;
    let max = 0;
    for (const r of rows) {
      const m = r.referencia?.match(/-(\d+)$/);
      const n = m ? parseInt(m[1], 10) : 0;
      if (n > max) max = n;
    }
    return max + 1;
  }
  async create(data: CreateInput) {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    // nextSeq → INSERT não é atômico: dois envios simultâneos podem calcular o
    // mesmo sequencial. O índice único em referencia acusa (23505); recalculamos
    // o próximo número e tentamos de novo.
    for (let tentativa = 0; ; tentativa++) {
      const seq = await this.nextSeq();
      const referencia = buildReference(PREFIXO, data.cliente || "cliente", seq, new Date().getFullYear());
      try {
        await this.pool.sql`
          INSERT INTO orcamentos
            (id, referencia, cliente, fonte, estacao, service_key, proposta_id, descricao, meta, valor, ficha,
             comentarios, historico, anexos, parecer, decidido_por, decidido_em, expira_em, criado_por, criado_por_nome, criado_em, atualizado_em)
          VALUES
            (${id}, ${referencia}, ${data.cliente}, ${data.fonte}, ${data.estacao}, ${data.serviceKey},
             ${data.propostaId ?? null}, ${data.descricao}, ${data.meta ? JSON.stringify(data.meta) : null}::jsonb, ${data.valor ?? null},
             ${data.ficha ? JSON.stringify(data.ficha) : null}::jsonb,
             '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${data.parecer ?? null}, ${data.decididoPor ?? null}, ${data.decididoEm ?? null},
             ${data.expiraEm ?? null}, ${data.criadoPor}, ${data.criadoPorNome ?? null}, ${now}, ${now})
        `;
        return { ...data, id, referencia, comentarios: [], historico: [], anexos: [], criadoEm: now, atualizadoEm: now };
      } catch (e) {
        const colisao =
          (e as { code?: string })?.code === "23505" || /duplicate key/i.test(e instanceof Error ? e.message : "");
        if (!colisao || tentativa >= 3) throw e;
      }
    }
  }
  /**
   * UPDATE único com os campos do patch e, opcionalmente, um registro novo de
   * histórico — `historico || NULL` é NULL, então o COALESCE preserva o array
   * quando não há registro (mesmo idioma dos demais campos).
   */
  private async updateRow(id: string, patch: UpdatePatch, novoHistorico: RegistroValidacao | null) {
    await this.ensureSchema();
    const atualizadoEm = novoHistorico?.em ?? new Date().toISOString();
    const fichaJson = patch.ficha === undefined ? null : JSON.stringify(patch.ficha);
    const metaJson = patch.meta === undefined ? null : JSON.stringify(patch.meta);
    const oneDriveJson = patch.oneDrive === undefined ? null : JSON.stringify(patch.oneDrive);
    const historicoJson = novoHistorico ? JSON.stringify([novoHistorico]) : null;
    // Campos "limpáveis": NULL = não mexe, "" = limpa (ver LIMPAR). O NULLIF
    // roda ANTES do cast — ''::timestamptz seria erro de sintaxe no Postgres.
    const dPor = patch.decididoPor ?? null;
    const dEm = patch.decididoEm ?? null;
    const exp = patch.expiraEm ?? null;
    const { rows } = await this.pool.sql<Row>`
      UPDATE orcamentos SET
        cliente = COALESCE(${patch.cliente ?? null}::text, cliente),
        estacao = COALESCE(${patch.estacao ?? null}::text, estacao),
        descricao = COALESCE(${patch.descricao ?? null}::text, descricao),
        meta = COALESCE(${metaJson}::jsonb, meta),
        valor = COALESCE(${patch.valor ?? null}::numeric, valor),
        ficha = COALESCE(${fichaJson}::jsonb, ficha),
        parecer = COALESCE(${patch.parecer ?? null}::text, parecer),
        decidido_por = CASE WHEN ${dPor}::text IS NULL THEN decidido_por ELSE NULLIF(${dPor}::text, '') END,
        decidido_em = CASE WHEN ${dEm}::text IS NULL THEN decidido_em ELSE NULLIF(${dEm}::text, '')::timestamptz END,
        expira_em = CASE WHEN ${exp}::text IS NULL THEN expira_em ELSE NULLIF(${exp}::text, '')::timestamptz END,
        one_drive = COALESCE(${oneDriveJson}::jsonb, one_drive),
        historico = COALESCE(historico || ${historicoJson}::jsonb, historico),
        atualizado_em = ${atualizadoEm}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async update(id: string, patch: UpdatePatch) {
    return this.updateRow(id, patch, null);
  }
  async transicionar(id: string, patch: UpdatePatch, registro: Omit<RegistroValidacao, "id" | "em">) {
    const novo: RegistroValidacao = { ...registro, id: crypto.randomUUID(), em: new Date().toISOString() };
    return this.updateRow(id, patch, novo);
  }
  async addComentario(id: string, c: Omit<ComentarioOrcamento, "id" | "em">) {
    await this.ensureSchema();
    const novo: ComentarioOrcamento = { ...c, id: crypto.randomUUID(), em: new Date().toISOString() };
    const { rows } = await this.pool.sql<Row>`
      UPDATE orcamentos SET
        comentarios = comentarios || ${JSON.stringify([novo])}::jsonb,
        atualizado_em = ${novo.em}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async appendHistorico(id: string, r: Omit<RegistroValidacao, "id" | "em">) {
    await this.ensureSchema();
    const novo: RegistroValidacao = { ...r, id: crypto.randomUUID(), em: new Date().toISOString() };
    const { rows } = await this.pool.sql<Row>`
      UPDATE orcamentos SET
        historico = historico || ${JSON.stringify([novo])}::jsonb,
        atualizado_em = ${novo.em}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async addAnexo(id: string, anexo: AnexoRef) {
    await this.ensureSchema();
    const now = new Date().toISOString();
    // Append condicional: só insere se a revisão ainda não existir (fecha a corrida).
    const { rows } = await this.pool.sql<Row>`
      UPDATE orcamentos SET anexos = anexos || ${JSON.stringify([anexo])}::jsonb, atualizado_em = ${now}
      WHERE id = ${id} AND NOT (anexos @> ${JSON.stringify([{ revisao: anexo.revisao }])}::jsonb)
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async setAnexos(id: string, anexos: AnexoRef[]) {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const { rows } = await this.pool.sql<Row>`
      UPDATE orcamentos SET anexos = ${JSON.stringify(anexos)}::jsonb, atualizado_em = ${now}
      WHERE id = ${id}
      RETURNING *
    `;
    return rows[0] ? rowTo(rows[0]) : null;
  }
  async listExpirados(nowISO: string) {
    await this.ensureSchema();
    const { rows } = await this.pool.sql<Row>`
      SELECT * FROM orcamentos
      WHERE expira_em IS NOT NULL AND expira_em < ${nowISO} AND jsonb_array_length(anexos) > 0
    `;
    return rows.map(rowTo);
  }
  async remove(id: string) {
    await this.ensureSchema();
    const { rowCount } = await this.pool.sql`DELETE FROM orcamentos WHERE id = ${id}`;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaOrcamentoStore?: OrcamentoStore };

export function getOrcamentoStore(): OrcamentoStore {
  if (!g.__gtaOrcamentoStore) {
    g.__gtaOrcamentoStore = getDbUrl()
      ? new PostgresOrcamentoStore()
      : new JsonOrcamentoStore(path.join(process.cwd(), "data", "orcamentos.json"));
  }
  return g.__gtaOrcamentoStore;
}

/**
 * Prepara o orçamento para sair da API. Duas redações:
 *
 * 1. A URL crua dos anexos. O download sempre passa pela rota autenticada (que
 *    relê a URL do store), então o cliente nunca precisa da URL do Blob —
 *    evitando que ela vaze ou seja repassada sem auth.
 *
 * 2. A FICHA (custo, markup, margem), quando quem pediu não tem
 *    `financeiro.ver`. É o quanto a GTA paga e o quanto ganha: informação que
 *    não pode viajar na resposta só porque a tela não a desenha.
 *
 * `verFinanceiro` é OBRIGATÓRIO de propósito. Um valor padrão faria a ficha
 * vazar por esquecimento no próximo endpoint que alguém escrever; assim o
 * compilador obriga cada chamada a decidir.
 */
export function redigirOrcamento(orc: Orcamento | null, verFinanceiro: boolean): Orcamento | null {
  if (!orc) return null;
  const semUrls = { ...orc, anexos: orc.anexos.map((a) => ({ ...a, url: "" })) };
  if (verFinanceiro) return semUrls;
  const { ficha: _ficha, ...semFicha } = semUrls;
  void _ficha;
  return semFicha as Orcamento;
}
