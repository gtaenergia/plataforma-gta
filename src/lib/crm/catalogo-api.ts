import { NextResponse } from "next/server";
import type { CatalogoStore } from "./catalogo-store";
import { getNegociacaoStore } from "./negociacoes-store";
import { atualizarItemCatalogoSchema, criarItemCatalogoSchema, type Negociacao } from "./types";

/**
 * Handlers compartilhados dos catálogos simples (fontes e motivos de perda).
 * As duas rotas são idênticas fora o store, a semente e o rótulo do erro —
 * então os handlers são fabricados aqui e as rotas só os exportam.
 */

interface ConfigCatalogo {
  store: () => CatalogoStore;
  /** Nomes semeados quando o catálogo está vazio na primeira visita. */
  sementes: readonly string[];
  /** "fonte" / "motivo de perda" — entra nas mensagens de erro. */
  rotulo: string;
  /** Campo da negociação que referencia o item — trava a exclusão de item em uso. */
  campoEmUso: keyof Pick<Negociacao, "fonteId" | "motivoPerdaId">;
  /** Chave do objeto na resposta ({ fontes } / { motivos }). */
  chaveLista: string;
  chaveItem: string;
}

export function catalogoHandlers(cfg: ConfigCatalogo) {
  async function GET() {
    const store = cfg.store();
    let itens = await store.list();
    if (itens.length === 0) {
      for (const nome of cfg.sementes) await store.create({ nome, descricao: "" });
      itens = await store.list();
    }
    return NextResponse.json({ [cfg.chaveLista]: itens });
  }

  async function POST(req: Request) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }
    const parsed = criarItemCatalogoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
    }
    const item = await cfg.store().create(parsed.data);
    return NextResponse.json({ [cfg.chaveItem]: item }, { status: 201 });
  }

  async function PATCH(req: Request, id: string) {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
    }
    const parsed = atualizarItemCatalogoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
    }
    const item = await cfg.store().update(id, parsed.data);
    if (!item) return NextResponse.json({ error: `Item de ${cfg.rotulo} não encontrado.` }, { status: 404 });
    return NextResponse.json({ [cfg.chaveItem]: item });
  }

  async function DELETE(id: string) {
    // Item referenciado por negociação não sai: o nome denormalizado seguiria
    // nas fichas, mas o filtro e o relatório perderiam a chave.
    const negociacoes = await getNegociacaoStore().list();
    if (negociacoes.some((n) => n[cfg.campoEmUso] === id)) {
      return NextResponse.json({ error: `Há negociações usando esta ${cfg.rotulo}.` }, { status: 409 });
    }
    const ok = await cfg.store().remove(id);
    if (!ok) return NextResponse.json({ error: `Item de ${cfg.rotulo} não encontrado.` }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return { GET, POST, PATCH, DELETE };
}
