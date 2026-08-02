import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { getPrecos, salvarPrecos } from "@/lib/precos/store";
import { lerCsv } from "@/lib/precos/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Limite de corpo — a planilha tem dezenas de linhas, não megabytes. */
const MAX_BYTES = 512 * 1024;

/**
 * Importa a planilha preenchida. Linhas com "PREÇO NOVO" em branco são
 * ignoradas de propósito: a pessoa revisa o que conseguiu cotar e o resto
 * continua valendo, em vez de zerar.
 */
export async function POST(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  if (guard.me.role !== "admin") {
    return NextResponse.json({ error: "Sem permissão para alterar preços." }, { status: 403 });
  }

  const texto = await req.text();
  if (!texto.trim()) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
  if (texto.length > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo grande demais para uma planilha de preços." }, { status: 413 });
  }

  const { precos, problemas, emBranco } = lerCsv(texto);
  if (precos.length === 0) {
    return NextResponse.json(
      {
        error:
          problemas.length > 0
            ? "Nenhum preço pôde ser lido."
            : "Nenhuma linha tinha a coluna PRECO_NOVO preenchida.",
        problemas,
        emBranco,
      },
      { status: 422 },
    );
  }

  const r = await salvarPrecos(precos, guard.me.name || guard.me.email);
  return NextResponse.json({
    atualizados: r.atualizados,
    // Id que não existe no catálogo: normalmente linha de outra versão da planilha.
    naoReconhecidos: r.ignorados,
    emBranco,
    problemas,
    tabela: await getPrecos(),
  });
}
