import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getProjetoEngStore } from "@/lib/engenharia/store";
import { resumir } from "@/lib/engenharia/tipos";
import { sanearDados } from "@/lib/engenharia/validacao";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const projetos = await getProjetoEngStore().list();
  return NextResponse.json({ projetos: projetos.map(resumir) });
}

/**
 * Cria um projeto. O responsável técnico vem do formulário; se chegar sem
 * nome, herda o do projeto editado por último — quem assina é quase sempre o
 * mesmo engenheiro, e redigitar CREA e ART a cada obra é onde nasce o erro.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  let body: { dados?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const store = getProjetoEngStore();
  const dados = sanearDados(body.dados);
  if (!dados.nome.trim()) return NextResponse.json({ error: "Informe o nome do projeto." }, { status: 422 });
  if (!dados.rt.nome.trim()) {
    const [ultimo] = await store.list();
    if (ultimo) dados.rt = { ...ultimo.dados.rt, art: "" };
  }
  const projeto = await store.create(dados, user.name || user.email);
  return NextResponse.json({ projeto }, { status: 201 });
}
