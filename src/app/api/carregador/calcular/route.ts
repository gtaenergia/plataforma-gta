import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { dimensionarEV, gerarBomEV, precoEV } from "@/services/carregador/engine";
import { getCarregadorParams } from "@/services/carregador/params";
import { avaliarEV } from "@/services/carregador/avisos";
import { getPrecos } from "@/lib/precos/store";
import { indicePorId, pendentesEntre, diasDesde } from "@/lib/precos/catalogo";

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
  const precos = await getPrecos();
  const bom = gerarBomEV(sizing, i.distanciaM, i.qtdPontos, indicePorId(precos.itens));
  const preco = precoEV(bom.custoMateriais, i.qtdPontos, params);

  // Travas técnicas: saturação do catálogo, faixa CA, queda e múltiplos pontos.
  const avisos = avaliarEV({ potenciaKw: i.potenciaKw, qtdPontos: i.qtdPontos, sizing });

  // Preço vencido, mas só dos materiais QUE ESTA LISTA USA. O catálogo tem
  // dezenas de itens e a maioria não entra numa proposta qualquer — avisar
  // sobre material que não será usado ensina o usuário a ignorar o aviso.
  const idsUsados = bom.itens.map((it) => it.precoId).filter((x): x is string => Boolean(x));
  const vencidos = pendentesEntre(precos.itens, idsUsados);
  if (vencidos.length > 0) {
    const maisAntigo = Math.max(...vencidos.map((v) => diasDesde(v.atualizadoEm)));
    const lista = vencidos.slice(0, 4).map((v) => v.descricao).join("; ");
    avisos.push({
      nivel: "atencao",
      titulo: `${vencidos.length} ${vencidos.length === 1 ? "material desta lista está" : "materiais desta lista estão"} com preço desatualizado`,
      detalhe:
        `${lista}${vencidos.length > 4 ? ` e mais ${vencidos.length - 4}` : ""}. ` +
        `O mais antigo não é revisado há ${maisAntigo} dias. O custo alimenta a margem desta proposta — ` +
        `revise em Nova proposta → Preços de materiais antes de fechar.`,
    });
  }

  return NextResponse.json({ sizing, avisos, bom, preco, params });
}
