import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getOrcamentoStore, redigirOrcamento } from "@/lib/orcamentos/store";
import { salvarAnexo, removerAnexo } from "@/lib/orcamentos/anexo-store";
import {
  ANEXO_MAX_BYTES,
  ANEXO_MAX_QTD,
  anexoRevisaoSchema,
  anexoTipoDoContentType,
  conteudoBateComTipo,
  sanitizarNomeAnexo,
  type AnexoRef,
} from "@/lib/orcamentos/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Anexa uma revisão (PDF) ao orçamento. Revisão 00 pode vir do gerador (.docx). */
export async function POST(req: Request, ctx: Ctx) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  const { id } = await ctx.params;
  const me = guard.me;

  const store = getOrcamentoStore();
  const orc = await store.get(id);
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  // Escopo de dono (igual ao DELETE de anexo): criador, revisor ou admin —
  // não basta ter a permissão genérica de criar (evita anexar em orçamento alheio).
  const autorizado =
    me.role === "admin" || me.email === orc.criadoPor || (await temPermissao(me, "orcamentos.revisar"));
  if (!autorizado) return NextResponse.json({ error: "Sem permissão para anexar neste orçamento." }, { status: 403 });
  if (orc.estacao === "aprovado" || orc.estacao === "cancelado") {
    return NextResponse.json({ error: "Orçamento finalizado — não aceita novos anexos." }, { status: 409 });
  }
  if (orc.anexos.length >= ANEXO_MAX_QTD) {
    return NextResponse.json({ error: `Limite de ${ANEXO_MAX_QTD} anexos atingido.` }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envio inválido (esperado multipart/form-data)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  const contentType = file.type || "application/octet-stream";
  const tipo = anexoTipoDoContentType(contentType);
  if (tipo !== "pdf") {
    return NextResponse.json({ error: "Envie um arquivo PDF." }, { status: 415 });
  }
  if (file.size > ANEXO_MAX_BYTES) {
    return NextResponse.json({ error: `Arquivo acima do limite de ${ANEXO_MAX_BYTES / (1024 * 1024)} MB.` }, { status: 413 });
  }

  // Revisão: usa a informada ou o próximo número disponível.
  const revRaw = form.get("revisao");
  let revisao: number;
  if (revRaw != null) {
    const rp = anexoRevisaoSchema.safeParse(revRaw);
    if (!rp.success) return NextResponse.json({ error: "Revisão inválida." }, { status: 422 });
    revisao = rp.data;
  } else {
    revisao = orc.anexos.reduce((m, a) => Math.max(m, a.revisao), -1) + 1;
  }
  if (orc.anexos.some((a) => a.revisao === revisao)) {
    return NextResponse.json({ error: `A Revisão ${String(revisao).padStart(2, "0")} já existe.` }, { status: 409 });
  }

  const anexoId = crypto.randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  // Defesa além do content-type declarado: confere extensão + magic bytes.
  if (!conteudoBateComTipo(tipo, file.name, bytes)) {
    return NextResponse.json({ error: "O conteúdo do arquivo não é um PDF válido." }, { status: 415 });
  }
  const nome = sanitizarNomeAnexo(file.name);
  const { url, blob } = await salvarAnexo(id, anexoId, nome, contentType, bytes);

  const anexo: AnexoRef = {
    id: anexoId,
    revisao,
    nome,
    tipo,
    contentType,
    tamanho: file.size,
    url,
    blob,
    enviadoPor: me.name || me.email,
    em: new Date().toISOString(),
  };
  const atualizado = await store.addAnexo(id, anexo);
  if (!atualizado) {
    // corrida: a revisão passou a existir entre a checagem e a escrita — remove o órfão.
    await removerAnexo(anexo);
    return NextResponse.json({ error: "Essa revisão já existe. Recarregue e tente novamente." }, { status: 409 });
  }
  return NextResponse.json({ orcamento: redigirOrcamento(atualizado, await temPermissao(guard.me, "financeiro.ver")) }, { status: 201 });
}
