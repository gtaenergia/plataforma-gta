import { NextResponse } from "next/server";
import { sanearValores } from "@/lib/crm/campos";
import { getCampoStore } from "@/lib/crm/campos-store";
import { getFunilStore } from "@/lib/crm/funis-store";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { criarNegociacaoSchema } from "@/lib/crm/types";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const negociacoes = await getNegociacaoStore().list();
  return NextResponse.json({ negociacoes });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarNegociacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }

  // A etapa precisa existir no funil apontado — um id trocado deixaria o
  // cartão invisível no quadro (nenhuma coluna o renderizaria).
  const funil = await getFunilStore().get(parsed.data.funilId);
  if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 422 });
  if (!funil.etapas.some((e) => e.id === parsed.data.etapaId)) {
    return NextResponse.json({ error: "Etapa não pertence ao funil." }, { status: 422 });
  }

  /*
   * A CRIAÇÃO não cobra campo obrigatório, de propósito.
   *
   * O "+" da coluna do funil pede só o nome — é assim que a negociação nasce
   * antes de esfriar. Exigir a distribuidora ali transformaria a anotação
   * rápida de uma ligação num formulário, e o vendedor voltaria para o papel.
   * A cobrança vem ao salvar a ficha e ao avançar de etapa.
   */
  const camposSaneados = sanearValores(await getCampoStore().list(), parsed.data.campos);

  const autor = { autor: user.email, autorNome: user.name || user.email };
  const negociacao = await getNegociacaoStore().create({
    ...parsed.data,
    campos: camposSaneados,
    // Sem responsável indicado, quem cria assume — mesma regra do RD.
    responsavel: parsed.data.responsavel || user.email,
    responsavelNome: parsed.data.responsavelNome || user.name || user.email,
    situacao: "aberta",
    motivoPerdaId: "",
    motivoPerdaNome: "",
    fechadoEm: "",
    fechadoPor: "",
    anotacoes: [novaAnotacao({ tipo: "sistema", texto: "Negociação criada.", ...autor })],
    criadoPor: user.email,
    criadoPorNome: user.name || user.email,
  });
  return NextResponse.json({ negociacao }, { status: 201 });
}
