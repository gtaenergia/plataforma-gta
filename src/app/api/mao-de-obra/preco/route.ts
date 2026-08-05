import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getConfigMaoDeObra } from "@/lib/mao-de-obra/config";
import { calcularComposicao } from "@/lib/mao-de-obra/motor";
import { linhaMaoDeObraSchema } from "@/lib/mao-de-obra/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preço de um serviço cobrado por hora.
 *
 * O cálculo acontece AQUI, e não no navegador, por um motivo de desenho: quem
 * não tem `financeiro.ver` nunca recebe o R$/h das funções, então não teria
 * como calcular. Fazer o servidor calcular sempre deixa um caminho só — e o
 * corte da informação sensível fica sendo o que a resposta OMITE, não o que a
 * tela esconde.
 *
 * - Sem `financeiro.ver`: só o preço final. É o que a pessoa precisa para
 *   saber o que está propondo ao cliente.
 * - Com `financeiro.ver`: a composição inteira — custo, imposto, lucro, markup
 *   e o valor de cada linha.
 */

const corpoSchema = z.object({
  linhas: z.array(linhaMaoDeObraSchema).max(50),
  /** Ausentes = usa o padrão do catálogo. */
  imposto: z.coerce.number().min(0).max(0.99).optional(),
  margem: z.coerce.number().min(0).max(0.99).optional(),
});

export async function POST(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = corpoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  const config = await getConfigMaoDeObra();
  const imposto = parsed.data.imposto ?? config.impostoPadrao;
  const margem = parsed.data.margem ?? config.margemPadrao;
  const composicao = calcularComposicao(parsed.data.linhas, config, { imposto, margem });

  if (composicao.impedimento) {
    return NextResponse.json({ impedimento: composicao.impedimento, precoCent: 0 });
  }

  const podeVerFinanceiro = await temPermissao(guard.me, "financeiro.ver");
  if (!podeVerFinanceiro) {
    // Só o preço. Custo, imposto, lucro e markup ficam de fora da RESPOSTA —
    // omitir na tela deixaria o dado a um F12 de distância.
    return NextResponse.json({ precoCent: composicao.precoCent, incompleta: composicao.incompleta });
  }

  return NextResponse.json({
    precoCent: composicao.precoCent,
    incompleta: composicao.incompleta,
    composicao: {
      custoCent: composicao.custoCent,
      impostoCent: composicao.impostoCent,
      lucroCent: composicao.lucroCent,
      markup: composicao.markup,
      imposto,
      margem,
      linhas: composicao.linhas.map((l) => ({
        funcaoId: l.linha.funcaoId,
        nome: l.funcao?.nome ?? "",
        horasTotais: l.horasTotais,
        custoCent: l.custoCent,
        incompleta: l.incompleta,
      })),
    },
  });
}
