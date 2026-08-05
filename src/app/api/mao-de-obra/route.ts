import { NextResponse } from "next/server";
import { requireApi } from "@/lib/rbac/guards";
import { temPermissao } from "@/lib/rbac/resolve";
import { getConfigMaoDeObra, salvarConfigMaoDeObra } from "@/lib/mao-de-obra/config";
import { configMaoDeObraSchema } from "@/lib/mao-de-obra/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catálogo de mão de obra terceirizada: funções, R$/h, e os padrões de imposto
 * e margem.
 *
 * A LEITURA é cortada em dois, e o corte acontece AQUI — não na tela. Esconder
 * o custo só no componente deixaria o valor a um F12 de distância, já que ele
 * teria vindo na resposta de qualquer jeito.
 *
 * - Sem `financeiro.ver`: só os NOMES das funções. É o bastante para montar o
 *   orçamento, que é o que o dono pediu ("qualquer pessoa, do comercial ou do
 *   campo, pode colocar quantas horas vão ser necessárias").
 * - Com `financeiro.ver`: o catálogo inteiro, com custo e as duas taxas.
 *
 * A ESCRITA é de administrador: mexer no R$/h muda o preço de tudo que for
 * orçado a partir dali.
 */
export async function GET() {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;

  const config = await getConfigMaoDeObra();
  const podeVerFinanceiro = await temPermissao(guard.me, "financeiro.ver");

  if (!podeVerFinanceiro) {
    return NextResponse.json({
      podeVerFinanceiro: false,
      config: { funcoes: config.funcoes.map((f) => ({ id: f.id, nome: f.nome })) },
    });
  }
  return NextResponse.json({ podeVerFinanceiro: true, config });
}

export async function PUT(req: Request) {
  const guard = await requireApi();
  if ("error" in guard) return guard.error;
  if (guard.me.role !== "admin") {
    return NextResponse.json(
      { error: "Sem permissão para alterar o catálogo de mão de obra." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = configMaoDeObraSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  // Imposto + margem a partir de 100% deixa a conta sem solução. O schema
  // limita cada um a 0,99, mas não a SOMA — e 0,6 + 0,5 passaria por ele.
  if (parsed.data.impostoPadrao + parsed.data.margemPadrao >= 1) {
    return NextResponse.json(
      { error: "Imposto e margem somados precisam ficar abaixo de 100% — acima disso não há preço possível." },
      { status: 422 },
    );
  }

  const config = await salvarConfigMaoDeObra(parsed.data, guard.me.name || guard.me.email);
  return NextResponse.json({ config });
}
