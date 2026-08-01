import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "@/lib/tasks/postgres-store";
import type { Armazenamento } from "./types";

/**
 * Consumo de armazenamento dos dois serviços que a plataforma usa: o banco
 * (Neon/Vercel Postgres) e o Blob (anexos de orçamento e fotos de perfil).
 *
 * Serve para responder "estamos perto do limite?" e, principalmente, "o que
 * está ocupando espaço?" — por isso cada serviço vem com a quebra por tabela
 * e por pasta, não só o total.
 *
 * Em desenvolvimento nenhum dos dois está configurado (o app usa JSON em
 * data/ e uploads em data/uploads), e cada bloco devolve `configurado: false`.
 */

/**
 * Referência de plano para desenhar a barra de uso — NÃO é lida do provedor,
 * porque nem o Neon nem o Blob expõem a cota na conexão. Os valores abaixo são
 * os do plano gratuito; se a conta mudar de plano, ajuste aqui.
 */
export const LIMITE_REFERENCIA = {
  bancoBytes: 512 * 1024 * 1024, // 0,5 GB
  blobBytes: 1024 * 1024 * 1024, // 1 GB
};

/** Identificador de tabela seguro para interpolar (só vem do catálogo, mas confere). */
const NOME_TABELA_OK = /^[a-z_][a-z0-9_]*$/;

/**
 * Pool reaproveitado entre requisições, como os demais stores do projeto — um
 * pool novo a cada chamada deixaria conexões penduradas no contêiner serverless.
 */
const g = globalThis as unknown as { __gtaArmazenamentoPool?: VercelPool };

function getPool(url: string): VercelPool {
  if (!g.__gtaArmazenamentoPool) g.__gtaArmazenamentoPool = createPool({ connectionString: url });
  return g.__gtaArmazenamentoPool;
}

async function medirBanco(): Promise<Armazenamento["banco"]> {
  const url = getDbUrl();
  if (!url) return { configurado: false };

  const pool = getPool(url);

  // Tamanho ocupado por tabela, já incluindo índices e TOAST
  // (pg_total_relation_size) — é o que de fato conta para a cota.
  const { rows } = await pool.sql<{ nome: string; bytes: string }>`
    SELECT c.relname AS nome, pg_total_relation_size(c.oid)::text AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `;

  const nomes = rows.map((r) => r.nome).filter((n) => NOME_TABELA_OK.test(n));

  // Contagem exata numa única ida ao banco. `reltuples` seria mais barato, mas
  // é estimativa e vem -1 em tabela que nunca passou por ANALYZE — apareceria
  // quebrado justamente nas tabelas novas. Aqui as tabelas são pequenas.
  const linhasPorTabela = new Map<string, number>();
  if (nomes.length) {
    const uniao = nomes.map((n) => `SELECT '${n}' AS nome, count(*)::text AS linhas FROM "${n}"`).join(" UNION ALL ");
    const contagem = await pool.query<{ nome: string; linhas: string }>(uniao);
    for (const r of contagem.rows) linhasPorTabela.set(r.nome, Number(r.linhas));
  }

  const totalRes = await pool.sql<{ bytes: string }>`SELECT pg_database_size(current_database())::text AS bytes`;

  return {
    configurado: true,
    totalBytes: Number(totalRes.rows[0]?.bytes ?? 0),
    limiteBytes: LIMITE_REFERENCIA.bancoBytes,
    tabelas: rows.map((r) => ({
      nome: r.nome,
      bytes: Number(r.bytes),
      linhas: linhasPorTabela.get(r.nome) ?? 0,
    })),
  };
}

/** Teto de arquivos percorridos — evita uma página lenta se o Blob crescer muito. */
const MAX_BLOBS = 5000;

async function medirBlob(): Promise<Armazenamento["blob"]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { configurado: false };

  const { list } = await import("@vercel/blob");
  const arquivos: { pathname: string; size: number; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  let truncado = false;

  do {
    const pagina = await list({ cursor, limit: 1000 });
    arquivos.push(...pagina.blobs.map((b) => ({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })));
    cursor = pagina.hasMore ? pagina.cursor : undefined;
    if (arquivos.length >= MAX_BLOBS) {
      truncado = Boolean(cursor);
      break;
    }
  } while (cursor);

  // A primeira parte do caminho é a "pasta" que o código usa ao gravar:
  // orcamentos/<id>/... e avatares/<userId>.<ext>.
  const porPasta = new Map<string, { bytes: number; arquivos: number }>();
  for (const a of arquivos) {
    const pasta = a.pathname.includes("/") ? a.pathname.split("/")[0] : "(raiz)";
    const atual = porPasta.get(pasta) ?? { bytes: 0, arquivos: 0 };
    atual.bytes += a.size;
    atual.arquivos += 1;
    porPasta.set(pasta, atual);
  }

  return {
    configurado: true,
    totalBytes: arquivos.reduce((s, a) => s + a.size, 0),
    limiteBytes: LIMITE_REFERENCIA.blobBytes,
    arquivos: arquivos.length,
    pastas: [...porPasta.entries()]
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.bytes - a.bytes),
    maiores: [...arquivos]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map((a) => ({ nome: a.pathname, bytes: a.size, enviadoEm: new Date(a.uploadedAt).toISOString() })),
    truncado,
  };
}

/**
 * Mede os dois serviços. Uma falha num deles (banco fora do ar, token do Blob
 * revogado) não derruba o outro: o bloco que falhou volta como não configurado
 * e a mensagem sobe em `erro`.
 */
export async function medirArmazenamento(): Promise<Armazenamento> {
  const [banco, blob] = await Promise.allSettled([medirBanco(), medirBlob()]);
  const falhas: string[] = [];

  if (banco.status === "rejected") falhas.push(`Banco: ${mensagem(banco.reason)}`);
  if (blob.status === "rejected") falhas.push(`Blob: ${mensagem(blob.reason)}`);

  return {
    banco: banco.status === "fulfilled" ? banco.value : { configurado: false },
    blob: blob.status === "fulfilled" ? blob.value : { configurado: false },
    ...(falhas.length ? { erro: falhas.join(" · ") } : {}),
  };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : "falha ao consultar";
}
