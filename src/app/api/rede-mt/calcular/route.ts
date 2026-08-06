import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { precoRedeMt } from "@/services/rede-mt/pricing";
import { getRedeMtParams } from "@/services/rede-mt/params";

export const runtime = "nodejs";

const schema = z.object({
  custoProjeto: z.coerce.number().min(0).default(0),
  custoExecucao: z.coerce.number().min(0).default(0),
  /* Do navegador: é lá que se escolhe quem executa. Sem `financeiro.ver` o
     bloco não aparece, o valor vai zero, e o preço sai como sempre saiu. */
  custoEquipe: z.coerce.number().min(0).default(0),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const params = await getRedeMtParams();
  const preco = precoRedeMt(parsed.data, params);
  return NextResponse.json({ preco, params });
}
