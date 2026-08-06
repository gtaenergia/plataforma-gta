import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { precoQgbt } from "@/services/qgbt/pricing";
import { getQgbtParams } from "@/services/qgbt/params";

export const runtime = "nodejs";

const schema = z.object({
  custoUnitario: z.coerce.number().min(0).default(0),
  qtdQuadros: z.coerce.number().int().min(1).default(1),
  /* Vem do navegador porque é lá que a pessoa escolhe quem executa. O valor
     não é sigiloso na direção que importa: quem o envia já viu o R$/h em
     `/api/custo-equipe`, atrás de `financeiro.ver`. Quem não tem a permissão
     não recebe o bloco, manda zero, e o preço sai como sempre saiu. */
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

  const params = await getQgbtParams();
  const preco = precoQgbt(parsed.data, params);
  return NextResponse.json({ preco, params });
}
