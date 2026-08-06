import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { precoExecSE } from "@/services/execucao-subestacao/pricing";
import { getExecSeParams } from "@/services/execucao-subestacao/params";

export const runtime = "nodejs";

const schema = z.object({
  custoMateriais: z.coerce.number().min(0).default(0),
  custoMaoObra: z.coerce.number().min(0).default(0),
  custoProjetoOutros: z.coerce.number().min(0).default(0),
  /* Vem do navegador: é lá que a pessoa escolhe quem executa. Quem não tem
     `financeiro.ver` não recebe o bloco, manda zero, e o preço não muda. */
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

  const params = await getExecSeParams();
  const preco = precoExecSE(parsed.data, params);
  return NextResponse.json({ preco, params });
}
