import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { dimensionarEV, gerarBomEV, precoEV } from "@/services/carregador/engine";
import { getCarregadorParams } from "@/services/carregador/params";
import { avaliarEV } from "@/services/carregador/avisos";
import { getIndicePrecos } from "@/lib/precos/store";

export const runtime = "nodejs";

const schema = z.object({
  potenciaKw: z.coerce.number().positive().default(7.4),
  fase: z.enum(["mono", "tri"]).default("mono"),
  distanciaM: z.coerce.number().min(1).default(20),
  qtdPontos: z.coerce.number().int().min(1).default(1),
  protecaoCcIntegrada: z.coerce.boolean().default(true),
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
  const i = parsed.data;

  const params = await getCarregadorParams();
  const sizing = dimensionarEV(i);
  const bom = gerarBomEV(sizing, i.distanciaM, i.qtdPontos, await getIndicePrecos());
  const preco = precoEV(bom.custoMateriais, i.qtdPontos, params);

  // Travas técnicas: saturação do catálogo, faixa CA, queda e múltiplos pontos.
  const avisos = avaliarEV({ potenciaKw: i.potenciaKw, qtdPontos: i.qtdPontos, sizing });

  return NextResponse.json({ sizing, avisos, bom, preco, params });
}
