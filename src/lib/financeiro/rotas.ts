import { NextResponse } from "next/server";
import type { z } from "zod";
import type { User } from "@/lib/users/types";

/** Lê e valida o corpo JSON. Devolve os dados ou a resposta de erro pronta. */
export async function lerCorpo<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<{ dados: z.infer<S> } | { error: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Corpo inválido." }, { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // A primeira mensagem já diz o que corrigir; a lista inteira vai junto para depuração.
    const primeira = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return { error: NextResponse.json({ error: primeira, issues: parsed.error.flatten() }, { status: 422 }) };
  }
  return { dados: parsed.data };
}

/** Carimbo de autoria gravado em todo documento. */
export const autoria = (me: User) => ({ by: me.email, byNome: me.name || me.email, ts: Date.now() });

/** Tira as chaves `undefined` (o JSON do Postgres e o arquivo de dev ficam iguais). */
export function semVazios<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** Linha legível de um lançamento/recorrente para a auditoria. */
export function resumoDe(d: Record<string, unknown> | null | undefined): string {
  if (!d) return "";
  const valor = typeof d.valor === "number" ? d.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
  const quando = typeof d.data === "string" ? d.data : typeof d.ini === "string" ? `todo dia ${String(d.dia ?? "")} desde ${d.ini}` : "";
  return [d.k === "r" ? "a receber" : d.k === "d" ? "a pagar" : "", String(d.desc ?? ""), valor, quando].filter(Boolean).join(" · ");
}

/** Resposta JSON que nenhum navegador ou proxy guarda em cache. */
export const jsonSemCache = (body: unknown, init: ResponseInit = {}) =>
  NextResponse.json(body, { ...init, headers: { ...(init.headers ?? {}), "Cache-Control": "no-store" } });

/** Id de documento vindo da URL: curto e sem caracteres estranhos. */
export const idValido = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);
