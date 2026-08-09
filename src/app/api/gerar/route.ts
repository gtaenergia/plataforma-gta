import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getService } from "@/services/registry";
import { renderDocx } from "@/lib/docx/generate";
import { getCurrentUser } from "@/lib/session";
import { getPropostaStore } from "@/lib/propostas/store";
import { devolverAoComercial, negociacaoDaProposta } from "@/lib/crm/retorno";
import { parseNumber } from "@/lib/format";

export const runtime = "nodejs";

/** Extrai um nome de cliente razoável do formData de qualquer serviço. */
function extrairCliente(formData: Record<string, unknown>): string {
  const cand = formData.clienteNome ?? formData.cliente ?? formData.nomeCliente ?? formData.contratante;
  const s = typeof cand === "string" ? cand.trim() : "";
  return s || "—";
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: { serviceKey?: string; formData?: unknown; propostaId?: string; negociacaoId?: string; valor?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const service = getService(body.serviceKey ?? "");
  if (!service) {
    return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 });
  }

  // Validação com o schema do serviço
  const parsed = service.zodSchema.safeParse(body.formData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const { data, patch } = service.map(parsed.data);

    const templatePath = path.join(process.cwd(), service.templateFile);
    const templateBuffer = fs.readFileSync(templatePath);

    const out = renderDocx(templateBuffer, data as Record<string, unknown>, patch);

    const ref = (data as Record<string, unknown>).referencia as string | undefined;
    const filename = `${ref ?? service.key}.docx`;

    // Registro no histórico (best-effort: nunca bloqueia o download).
    // - Configurador (Solar) manda propostaId -> apenas marca como "gerada".
    // - Demais serviços -> cria um registro "gerada" com o formData.
    try {
      const store = getPropostaStore();
      const cliente = extrairCliente(parsed.data as Record<string, unknown>);
      // Guarda o formData de ENTRADA (não parsed.data): é o que o zodSchema revalida
      // ao regenerar o .docx (Rev 00). A saída do schema (com transforms/coerce do
      // Solar/carregador) não revalida contra o próprio schema.
      const formGerado = body.formData as Record<string, unknown>;
      if (body.propostaId) {
        await store.update(body.propostaId, { status: "gerada", cliente, referencia: ref ?? "", formGerado });
      } else {
        await store.create({
          serviceKey: service.key,
          cliente,
          referencia: ref ?? "",
          status: "gerada",
          manual: false, // veio de um configurador
          dados: parsed.data as Record<string, unknown>,
          formGerado,
          criadoPor: user.email,
        });
      }

      // Nasceu de um pedido do CRM: o comercial recebe o valor e o aviso. O
      // vínculo vem do corpo (o configurador o carrega desde a abertura) ou
      // dos dados da proposta salva, quando ela está sendo regenerada.
      const negociacaoId =
        body.negociacaoId ||
        negociacaoDaProposta(body.propostaId ? (await store.get(body.propostaId))?.dados : undefined);
      if (negociacaoId) {
        /*
         * O preço sai do PRÓPRIO documento que acabou de ser montado.
         *
         * A versão anterior lia `body.valor` — que nenhum dos 13 configuradores
         * envia. O resultado era a integração inteira mentindo em silêncio: a
         * negociação recebia "proposta gerada, sem valor informado" e seguia com
         * a estimativa do comercial. `valorTotal` é o marcador que vai impresso
         * no .docx, e vem formatado ("R$ 1.234,56") — mesmo caminho que
         * /api/orcamentos/da-proposta já usa para preencher a esteira.
         */
        const doDocumento = parseNumber((data as Record<string, unknown>).valorTotal);
        await devolverAoComercial({
          negociacaoId,
          referencia: ref ?? service.key,
          valor: doDocumento > 0 ? doDocumento : Number(body.valor ?? 0),
          momento: "gerada",
          autor: user.email,
          autorNome: user.name || user.email,
        });
      }
    } catch (e) {
      console.error("Falha ao registrar proposta gerada:", e);
    }

    return new NextResponse(out as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar o documento.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
