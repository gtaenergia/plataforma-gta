import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { salvarAnexo, removerAnexo } from "@/lib/orcamentos/anexo-store";
import { DOCX_CONTENT_TYPE, sanitizarNomeAnexo, type AnexoRef } from "@/lib/orcamentos/types";
import { getPropostaStore } from "@/lib/propostas/store";
import { getService } from "@/services/registry";
import { renderDocx } from "@/lib/docx/generate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Regenera o .docx da proposta vinculada e anexa como Revisão 00. */
export async function POST(_req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const me = guard.me;

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const autorizado =
    me.role === "admin" || me.email === orc.criadoPor || (await temPermissao(me, "orcamentos.revisar"));
  if (!autorizado) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (orc.estacao === "aprovado" || orc.estacao === "cancelado") {
    return NextResponse.json({ error: "Orçamento finalizado." }, { status: 409 });
  }
  if (orc.anexos.some((a) => a.revisao === 0)) {
    return NextResponse.json({ error: "A Revisão 00 já existe." }, { status: 409 });
  }
  if (!orc.propostaId) {
    return NextResponse.json({ error: "Orçamento sem proposta vinculada." }, { status: 409 });
  }

  const proposta = await getPropostaStore().get(orc.propostaId);
  if (!proposta) return NextResponse.json({ error: "Proposta vinculada não encontrada." }, { status: 404 });
  const service = getService(proposta.serviceKey);
  if (!service) return NextResponse.json({ error: "Serviço da proposta não encontrado." }, { status: 404 });

  let buffer: Buffer;
  try {
    // O formData transformado (schema-shaped) é o que o mapper espera; `dados`
    // (form cru dos configuradores) não valida. Fallback para propostas antigas.
    const fonte = proposta.formGerado ?? proposta.dados;
    const parsed = service.zodSchema.safeParse(fonte);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Não foi possível regenerar o documento desta proposta. Anexe o PDF manualmente." },
        { status: 422 },
      );
    }
    const { data, patch } = service.map(parsed.data);
    const templateBuffer = fs.readFileSync(path.join(process.cwd(), service.templateFile));
    buffer = renderDocx(templateBuffer, data as Record<string, unknown>, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar o documento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const anexoId = crypto.randomUUID();
  const nome = sanitizarNomeAnexo(`${orc.referencia || proposta.referencia || "proposta"}.docx`);
  const { url, blob } = await salvarAnexo(id, anexoId, nome, DOCX_CONTENT_TYPE, buffer);

  const anexo: AnexoRef = {
    id: anexoId,
    revisao: 0,
    nome,
    tipo: "docx",
    contentType: DOCX_CONTENT_TYPE,
    tamanho: buffer.length,
    url,
    blob,
    enviadoPor: me.name || me.email,
    em: new Date().toISOString(),
  };
  const atualizado = await store.addAnexo(id, anexo);
  if (!atualizado) {
    await removerAnexo(anexo);
    return NextResponse.json({ error: "A Revisão 00 já existe." }, { status: 409 });
  }
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) }, { status: 201 });
}
