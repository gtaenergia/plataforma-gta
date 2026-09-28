import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import {
  criarRegistroSchema,
  montarHistorico,
  nomeComparavel,
  propostasDoCliente,
  resumoHistorico,
} from "@/lib/crm/historico";
import { resumoBasico, valorDoDocumento } from "@/lib/crm/historico-propostas";
import { getHistoricoStore, PropostaJaRegistradaError } from "@/lib/crm/historico-store";
import { getNegociacaoStore } from "@/lib/crm/negociacoes-store";
import { getOrcamentoStore } from "@/lib/orcamentos/store";
import { getPropostaStore } from "@/lib/propostas/store";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

/**
 * O histórico de UM cliente com a GTA (`?cliente=<id>`).
 *
 * Devolve as linhas prontas — propostas do operacional com o que foi escrito
 * sobre elas, mais os pedidos avulsos — e as propostas "sem dono" que podem
 * ser vinculadas à mão: o nome digitado no configurador nem sempre bate com o
 * cadastro, e a proposta de "Faz. Rio Doce" ficaria de fora da "Fazenda Rio
 * Doce" para sempre.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const clienteId = new URL(req.url).searchParams.get("cliente") ?? "";
  const cliente = clienteId ? await getClienteStore().get(clienteId) : null;
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const [propostas, orcamentos, negociacoes, registros, clientes] = await Promise.all([
    getPropostaStore().list(),
    getOrcamentoStore().list(),
    getNegociacaoStore().list(),
    getHistoricoStore().list(),
    getClienteStore().list(),
  ]);

  const basicos = propostas.map(resumoBasico);
  const ref = { id: cliente.id, nome: cliente.nome };
  const doCliente = new Set(propostasDoCliente(ref, basicos, registros, negociacoes).map((p) => p.id));

  // O valor do documento exige rodar o serviço: só para as deste cliente.
  const completas = propostas
    .filter((p) => doCliente.has(p.id))
    .map((p) => ({ ...resumoBasico(p), valorDocumento: valorDoDocumento(p) }));

  const linhas = montarHistorico({
    cliente: ref,
    propostas: completas,
    orcamentos: orcamentos
      .filter((o) => o.propostaId && doCliente.has(o.propostaId))
      .map((o) => ({ propostaId: o.propostaId!, valor: o.valor, estacao: o.estacao })),
    negociacoes,
    registros,
  });

  /*
   * Candidatas ao vínculo manual: as que não são de ninguém. Fica de fora a
   * proposta já vinculada a outro cliente e a que tem o nome EXATO de outro
   * cadastro — essa já tem dono, só não é este.
   */
  const vinculadas = new Set(registros.filter((r) => r.propostaId).map((r) => r.propostaId));
  const nomesDoCadastro = new Set(clientes.map((c) => nomeComparavel(c.nome)));
  const avulsas = basicos
    .filter((p) => !doCliente.has(p.id) && !vinculadas.has(p.id) && !nomesDoCadastro.has(nomeComparavel(p.cliente)))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .map((p) => ({ id: p.id, referencia: p.referencia, cliente: p.cliente, servico: p.rotuloServico, criadoEm: p.criadoEm }));

  return NextResponse.json({ linhas, resumo: resumoHistorico(linhas), avulsas });
}

/**
 * Registra um pedido avulso, ou escreve sobre uma proposta do operacional
 * (`propostaId`). Para a proposta que já tem registro, é a mesma coisa que
 * editá-lo: a tela não precisa saber se alguém chegou antes.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = criarRegistroSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", issues: parsed.error.flatten() }, { status: 422 });
  }
  const dados = parsed.data;

  const cliente = await getClienteStore().get(dados.clienteId);
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 422 });
  if (dados.propostaId && !(await getPropostaStore().get(dados.propostaId))) {
    return NextResponse.json({ error: "Proposta não encontrada." }, { status: 422 });
  }

  const store = getHistoricoStore();
  if (dados.propostaId) {
    const existente = (await store.list()).find((r) => r.propostaId === dados.propostaId);
    if (existente) {
      if (existente.clienteId !== cliente.id) {
        return NextResponse.json(
          { error: `Esta proposta já está no histórico de ${existente.clienteNome || "outro cliente"}.` },
          { status: 409 },
        );
      }
      const { clienteId: _c, propostaId: _p, ...campos } = dados;
      void _c;
      void _p;
      const registro = await store.update(existente.id, campos);
      return NextResponse.json({ registro });
    }
  }

  try {
    const registro = await store.create({
      ...dados,
      clienteNome: cliente.nome,
      criadoPor: user.email,
      criadoPorNome: user.name || user.email,
    });
    return NextResponse.json({ registro }, { status: 201 });
  } catch (e) {
    // Duas pessoas escrevendo sobre a mesma proposta ao mesmo tempo.
    if (e instanceof PropostaJaRegistradaError) {
      return NextResponse.json({ error: "Alguém acabou de registrar esta proposta. Recarregue e tente de novo." }, { status: 409 });
    }
    throw e;
  }
}
