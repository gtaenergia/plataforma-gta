import fs from "node:fs";
import path from "node:path";
import { createPool, type VercelPool } from "@vercel/postgres";
import { getDbUrl } from "../tasks/postgres-store";
import { notificar } from "./store";
import { users } from "../users/store";

/**
 * Anúncio de novidade da plataforma: cada feature entregue ganha uma entrada
 * aqui, e `processarNovidades()` a envia (uma única vez, para todos os
 * usuários ativos) na primeira chamada após o deploy. `slug` é o identificador
 * estável que evita reenvio — nunca reutilize um slug já publicado.
 */
export interface Novidade {
  slug: string;
  titulo: string;
  mensagem: string;
  link: string;
}

export const NOVIDADES: Novidade[] = [
  {
    slug: "foto-perfil-2026-07",
    titulo: "Novidade: foto de perfil",
    mensagem: "Agora você pode adicionar (ou trocar) sua foto de perfil em Minha conta.",
    link: "/conta",
  },
  {
    slug: "tarefas-filtro-atraso-2026-07",
    titulo: "Novidade: filtro Em atraso nas Tarefas",
    mensagem: "Agora dá pra filtrar as tarefas com prazo vencido direto no dropdown de status.",
    link: "/tarefas",
  },
  {
    slug: "tarefas-clique-linha-2026-07",
    titulo: "Novidade: abrir a tarefa clicando na linha",
    mensagem: "Não precisa mais acertar o nome da tarefa — clique em qualquer ponto da linha para expandir.",
    link: "/tarefas",
  },
  {
    slug: "solar-microinversor-2026-07",
    titulo: "Novidade: Solar agora monta sistema com microinversor",
    mensagem: "Escolha o microinversor (W × módulos) e o configurador calcula a quantidade, a potência CA total, os ramais e a lista de materiais.",
    link: "/nova/solar",
  },
  {
    slug: "solar-lista-materiais-kits-2026-07",
    titulo: "Novidade: lista de materiais do Solar mais enxuta",
    mensagem: "Os itens miúdos viraram kits (fixação, cabeamento, proteção, aterramento, acabamento) — bem menos linhas para ajustar antes de cotar.",
    link: "/nova/solar",
  },
  {
    slug: "solar-micro-livre-2026-07",
    titulo: "Novidade: microinversor com entrada livre",
    mensagem: "Agora dá para digitar a potência do microinversor (opção \"Outra...\") e fixar a quantidade à mão — o cálculo vira sugestão, não trava.",
    link: "/nova/solar",
  },
  {
    slug: "mobile-area-de-toque-2026-07",
    titulo: "Novidade: plataforma mais confortável no celular",
    mensagem: "Botões, filtros e seletores ganharam área de toque maior no celular — menos toque errado. No computador nada mudou.",
    link: "/",
  },
  {
    slug: "login-continuar-conectado-2026-07",
    titulo: "Novidade: continuar conectado",
    mensagem: "A plataforma agora mantém você logado por até 30 dias. Em computador compartilhado, desmarque \"Continuar conectado\" ao entrar.",
    link: "/conta",
  },
  {
    slug: "solar-micro-kw-telhados-2026-07",
    titulo: "Novidade: microinversor em kW e novas estruturas",
    mensagem: "O microinversor agora é escolhido em kW (3 a 25) e a sugestão já mostra quantas unidades. Estruturas de fixação atualizadas (shingle, telha, colonial, laje, solo e mais).",
    link: "/nova/solar",
  },
];

interface NovidadeStore {
  /** Tenta reservar o slug; true = ninguém enviou ainda (e agora é sua vez). */
  reservar(slug: string): Promise<boolean>;
}

class JsonNovidadeStore implements NovidadeStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private readAll(): string[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  private writeAll(slugs: string[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(slugs, null, 2), "utf8");
    fs.renameSync(tmp, this.file);
  }
  reservar(slug: string): Promise<boolean> {
    const run = this.queue.then(() => {
      const atuais = this.readAll();
      if (atuais.includes(slug)) return false;
      this.writeAll([...atuais, slug]);
      return true;
    });
    this.queue = run.catch(() => false);
    return run;
  }
}

class PostgresNovidadeStore implements NovidadeStore {
  private pool: VercelPool;
  private ready: Promise<void> | null = null;
  constructor() {
    this.pool = createPool({ connectionString: getDbUrl() });
  }
  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.sql`
        CREATE TABLE IF NOT EXISTS novidades_enviadas (
          slug text PRIMARY KEY,
          enviado_em timestamptz NOT NULL
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
  async reservar(slug: string): Promise<boolean> {
    await this.ensureSchema();
    // ON CONFLICT DO NOTHING: se duas requisições concorrentes chegarem aqui,
    // só uma ganha a linha (e portanto só uma dispara o broadcast).
    const { rowCount } = await this.pool.sql`
      INSERT INTO novidades_enviadas (slug, enviado_em) VALUES (${slug}, ${new Date().toISOString()})
      ON CONFLICT (slug) DO NOTHING
    `;
    return (rowCount ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __gtaNovidadeStore?: NovidadeStore };

function getNovidadeStore(): NovidadeStore {
  if (!g.__gtaNovidadeStore) {
    g.__gtaNovidadeStore = getDbUrl()
      ? new PostgresNovidadeStore()
      : new JsonNovidadeStore(path.join(process.cwd(), "data", "novidades-enviadas.json"));
  }
  return g.__gtaNovidadeStore;
}

/**
 * Envia as novidades ainda não publicadas para todos os usuários ativos.
 * Best-effort e idempotente — seguro de chamar a cada requisição.
 */
export async function processarNovidades(): Promise<void> {
  try {
    const store = getNovidadeStore();
    for (const novidade of NOVIDADES) {
      const minhaVez = await store.reservar(novidade.slug);
      if (!minhaVez) continue;
      const ativos = (await (await users()).list()).filter((u) => u.active);
      await Promise.all(
        ativos.map((u) =>
          notificar({ paraEmail: u.email, tipo: "novidade", titulo: novidade.titulo, mensagem: novidade.mensagem, link: novidade.link })
        )
      );
    }
  } catch (e) {
    console.error("Novidades: falha ao processar —", e);
  }
}
