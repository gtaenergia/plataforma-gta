import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import { montarAgenda } from "@/lib/crm/agenda";
import { getContatoStore } from "@/lib/crm/contatos-store";
import { getFunilStore } from "@/lib/crm/funis-store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { hojeEmSaoPaulo } from "@/lib/crm/repeticao";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * A agenda de follow-ups e atividades do Início do CRM.
 *
 * Montada aqui, e não no navegador: para dizer quantos contatos já foram
 * feitos com cada cliente é preciso ler TODAS as tarefas, os clientes e os
 * contatos — e quem abre a agenda está, muitas vezes, no celular, na rua. O
 * aparelho recebe só os compromissos da semana, já prontos.
 *
 * `?dias=` alarga a janela (7 por padrão, até 60); `?responsavel=` filtra
 * pelos compromissos de uma pessoa.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const dias = Math.min(60, Math.max(1, Math.round(Number(params.get("dias")) || 7)));
  const responsavel = (params.get("responsavel") ?? "").trim();

  const [tarefas, negociacoes, clientes, contatos, funis] = await Promise.all([
    getTarefaCrmStore().list(),
    getNegociacaoStore().list(),
    getClienteStore().list(),
    getContatoStore().list(),
    getFunilStore().list(),
  ]);

  // O dia de São Paulo, não o do servidor: às 22h daqui o relógio UTC já está
  // amanhã, e os compromissos de hoje apareceriam como atrasados.
  const hoje = hojeEmSaoPaulo();
  const agenda = montarAgenda({ tarefas, negociacoes, clientes, contatos, funis, hoje, dias, responsavel });
  return NextResponse.json({ agenda, hoje });
}
