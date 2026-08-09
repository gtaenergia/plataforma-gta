import { NextResponse } from "next/server";
import type { CatalogoStore } from "./catalogo-store";
import { getNegociacaoStore } from "./negociacoes-store";
import { atualizarItemCatalogoSchema, criarItemCatalogoSchema, type Negociacao } from "./types";
import { getSettingsStore } from "../settings/store";
import { requirePermissaoApi } from "../rbac/guards";

/**
 * "Este catálogo já foi semeado alguma vez?" — e marca que foi.
 *
 * Guardado em `settings`, como as demais decisões de conta. Devolve `true`
 * quando JÁ estava marcado (então não se deve semear), e marca ao devolver
 * `false`. Marcar ANTES de semear é de propósito: se duas requisições chegarem
 * juntas, a segunda encontra a marca e desiste, mesmo que a primeira ainda
 * esteja inserindo.
 */
async function marcaDeSemeadura(chave: string): Promise<boolean> {
  const settings = getSettingsStore();
  const nome = `crm:semeado:${chave}`;
  const ja = await settings.get<boolean>(nome);
  if (ja) return true;
  await settings.set(nome, true, "sistema");
  return false;
}

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
      /*
       * Semear é para a PRIMEIRA visita, não para toda lista vazia.
       *
       * Sem a marca, quem apagasse as cinco fontes padrão para cadastrar as da
       * empresa via as cinco voltarem ao trocar de tela — parecia defeito, e
       * dava trabalho de novo. E duas requisições simultâneas numa conta nova
       * (duas abas, ou o funil e a lista carregando juntos) semeavam as duas,
       * deixando o catálogo duplicado.
       */
      const jaSemeado = await marcaDeSemeadura(cfg.chaveLista);
      if (!jaSemeado) {
        for (const nome of cfg.sementes) await store.create({ nome, descricao: "" });
        itens = await store.list();
      }
    }
    return NextResponse.json({ [cfg.chaveLista]: itens });
  }

  async function POST(req: Request) {
    const guard = await requirePermissaoApi("crm.configurar");
    if ("error" in guard) return guard.error;
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
    const guard = await requirePermissaoApi("crm.configurar");
    if ("error" in guard) return guard.error;
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
    const guard = await requirePermissaoApi("crm.configurar");
    if ("error" in guard) return guard.error;
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
