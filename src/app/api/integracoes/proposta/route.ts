import { NextResponse } from "next/server";
import { getClienteStore } from "@/lib/clientes/store";
import { getContatoStore } from "@/lib/crm/contatos-store";
import { funilPadrao, getFunilStore } from "@/lib/crm/funis-store";
import { getNegociacaoStore, novaAnotacao } from "@/lib/crm/negociacoes-store";
import { getTarefaCrmStore } from "@/lib/crm/tarefas-store";
import { formatBRL } from "@/lib/format";
import {
  casarCliente,
  casarContato,
  corpoSchema,
  dataDoFollowUp,
  etapaPropostaEnviada,
  hojeEmSaoPaulo,
  LIMITES,
  nomeNormalizado,
  TAMANHO_MAXIMO_CORPO,
  tokenConfere,
  tokenDoCabecalho,
  type CorpoRegistrar,
  type CorpoVerificar,
} from "@/lib/integracao/regras";
import { getIntegracaoLogStore, type AcaoIntegracao, type ResultadoIntegracao } from "@/lib/integracao/store";
import { ipDaRequisicao } from "@/lib/login/limite";
import { notificar } from "@/lib/notificacoes/store";
import { getPropostaStore } from "@/lib/propostas/store";
import { SERVICO_OUTRO } from "@/lib/propostas/types";
import { users } from "@/lib/users/store";
import type { User } from "@/lib/users/types";

export const runtime = "nodejs";

/**
 * Porta de entrada das propostas geradas no chat com o Claude.
 *
 * Três ações, todas por POST (CPF/CNPJ nunca vai na URL, que fica em log):
 *
 * - `verificar-cliente`: "este cliente já está no cadastro?" — responde só
 *   sim/não e o nome. É o que decide se o chat pede os dados de cadastro.
 * - `simular`: roda as mesmas decisões do registro sem gravar nada, para a
 *   pessoa confirmar o resumo exato antes de enviar.
 * - `registrar`: cliente (se novo) → contato → negociação em "Proposta
 *   enviada" → proposta → follow-up em 2 dias. Falhou no meio, desfaz o que
 *   criou: meia negociação no funil é pior do que nenhuma.
 *
 * As regras de segurança estão explicadas em `lib/integracao/regras.ts`. Esta
 * rota é pública no middleware — a autenticação é o token, conferido aqui.
 */

const SEM_CACHE = { "Cache-Control": "no-store" };

function resposta(corpo: unknown, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json(corpo, { status, headers: { ...SEM_CACHE, ...extra } });
}

/** Recusa que deve chegar à pessoa — o texto é para ela, não para o log. */
class Recusa extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function POST(req: Request) {
  // Desligada até alguém configurar: sem hash, a rota nem existe para quem bate.
  const hashConfigurado = process.env.INTEGRACAO_TOKEN_SHA256?.trim();
  if (!hashConfigurado) return resposta({ error: "Não encontrado." }, 404);

  const log = getIntegracaoLogStore();
  const ip = ipDaRequisicao(req.headers);
  const agora = Date.now();
  const anotar = (acao: AcaoIntegracao, resultado: ResultadoIntegracao, referencia = "", detalhe = "") =>
    log.registrar({ ip, acao, resultado, referencia, detalhe }).catch((e) => {
      console.error("Integração: falha ao gravar o log —", e);
    });

  // O freio vem ANTES de conferir o token: quem está chutando não ganha nem a
  // resposta "token errado".
  const falhas = await log.contar({ desdeMs: agora - LIMITES.janelaFalhasMs, ip, resultado: "auth_falhou" });
  if (falhas >= LIMITES.falhasPorIp) {
    return resposta({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, { "Retry-After": "900" });
  }

  if (!tokenConfere(tokenDoCabecalho(req.headers.get("authorization")), hashConfigurado)) {
    await anotar("auth", "auth_falhou");
    return resposta({ error: "Não autorizado." }, 401);
  }

  const usoNaHora = await log.contar({ desdeMs: agora - LIMITES.janelaUsoMs, autenticadas: true });
  if (usoNaHora >= LIMITES.chamadasPorHora) {
    await anotar("auth", "limitado", "", "chamadas por hora");
    return resposta({ error: "Limite de chamadas por hora atingido." }, 429, { "Retry-After": "3600" });
  }

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return resposta({ error: "Envie JSON (Content-Type: application/json)." }, 415);
  }
  const texto = await req.text();
  if (texto.length > TAMANHO_MAXIMO_CORPO) return resposta({ error: "Corpo grande demais." }, 413);
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return resposta({ error: "Corpo inválido." }, 400);
  }
  const parsed = corpoSchema.safeParse(bruto);
  if (!parsed.success) {
    return resposta({ error: "Dados inválidos.", issues: parsed.error.flatten() }, 422);
  }
  const corpo = parsed.data;
  const referencia = corpo.acao === "verificar-cliente" ? "" : corpo.proposta.referencia;

  // Em nome de quem: decidido aqui, pela configuração — nunca pelo corpo.
  const usuario = await usuarioDaIntegracao();
  if (!usuario) {
    await anotar(corpo.acao, "erro", referencia, "usuário da integração ausente ou inativo");
    return resposta({ error: "Integração sem usuário válido configurado." }, 503);
  }

  try {
    if (corpo.acao === "verificar-cliente") {
      const r = await verificarCliente(corpo);
      await anotar(corpo.acao, "ok");
      return resposta(r, 200);
    }

    if (corpo.acao === "registrar") {
      const registros = await log.contar({
        desdeMs: agora - LIMITES.janelaUsoMs,
        acao: "registrar",
        resultado: "ok",
      });
      if (registros >= LIMITES.registrosPorHora) {
        await anotar(corpo.acao, "limitado", referencia, "registros por hora");
        return resposta({ error: "Limite de registros por hora atingido." }, 429, { "Retry-After": "3600" });
      }
    }

    const plano = await planejar(corpo);
    if (corpo.acao === "simular") {
      await anotar(corpo.acao, "ok", referencia);
      return resposta({ simulacao: resumoDoPlano(plano) }, 200);
    }

    const criado = await executar(corpo, plano, usuario);
    await anotar(
      corpo.acao,
      "ok",
      referencia,
      `cliente=${criado.clienteId} negociacao=${criado.negociacaoId} proposta=${criado.propostaId} tarefa=${criado.tarefaId}`,
    );

    // O aviso também é alarme: se o token vazar, a primeira gravação estranha
    // aparece no sino de quem responde pela integração.
    await notificar({
      paraEmail: usuario.email,
      tipo: "integracao_proposta",
      titulo: "Proposta registrada pelo chat",
      mensagem: `${referencia} — ${plano.cliente.nome}, ${formatBRL(corpo.proposta.valor)}. Follow-up em ${dataBR(plano.followUp)}.`,
      link: `/crm/negociacoes/${criado.negociacaoId}`,
    });

    return resposta({ registrado: { ...resumoDoPlano(plano, true), ...criado } }, 201);
  } catch (e) {
    if (e instanceof Recusa) {
      await anotar(corpo.acao, "recusado", referencia, e.message);
      return resposta({ error: e.message }, e.status);
    }
    // O detalhe técnico fica no log do servidor; para fora, só o genérico.
    console.error("Integração: erro inesperado —", e);
    await anotar(corpo.acao, "erro", referencia, e instanceof Error ? e.message.slice(0, 300) : "erro");
    return resposta({ error: "Erro interno. Nada foi gravado." }, 500);
  }
}

// ------------------------------------------------------------------ Etapas

async function usuarioDaIntegracao(): Promise<User | null> {
  const email = process.env.INTEGRACAO_USUARIO_EMAIL?.trim();
  if (!email) return null;
  const u = await (await users()).getByEmail(email);
  return u && u.active ? u : null;
}

async function verificarCliente(corpo: CorpoVerificar) {
  const casamento = casarCliente(corpo, await getClienteStore().list());
  if (casamento.tipo === "existente") return { encontrado: true, nome: casamento.cliente.nome };
  if (casamento.tipo === "ambiguo") {
    return { encontrado: false, ambiguo: true, aviso: `${casamento.quantos} cadastros com esse nome — informe o CPF/CNPJ.` };
  }
  return { encontrado: false };
}

interface Plano {
  hoje: string;
  followUp: string;
  funil: { id: string; nome: string; criar: boolean };
  etapa: { id: string; nome: string };
  cliente: { id: string; nome: string; novo: boolean };
  contato: { id: string; nome: string; novo: boolean } | null;
}

/** Todas as decisões, sem gravar nada — o mesmo caminho serve à simulação. */
async function planejar(corpo: CorpoRegistrar): Promise<Plano> {
  const ref = nomeNormalizado(corpo.proposta.referencia);
  const duplicada = (await getPropostaStore().list()).find((p) => nomeNormalizado(p.referencia ?? "") === ref);
  if (duplicada) {
    throw new Recusa(`A proposta ${corpo.proposta.referencia} já está registrada na plataforma.`, 409);
  }

  // Conta sem funil ganha o padrão — a mesma semeadura da primeira visita ao quadro.
  const funis = await getFunilStore().list();
  const funil = funis[0] ? { ...funis[0], criar: false } : { id: "", ...funilPadrao(), criar: true };
  const etapa = etapaPropostaEnviada(funil.etapas);
  if (!etapa) throw new Recusa(`O funil "${funil.nome}" não tem a etapa "Proposta enviada".`, 422);

  const casamento = casarCliente(corpo.cliente, await getClienteStore().list());
  if (casamento.tipo === "ambiguo") {
    throw new Recusa(
      `Há ${casamento.quantos} clientes chamados "${corpo.cliente.nome}" sem CPF/CNPJ no cadastro — informe o documento ou ajuste o cadastro.`,
      409,
    );
  }
  const cliente =
    casamento.tipo === "existente"
      ? { id: casamento.cliente.id, nome: casamento.cliente.nome, novo: false }
      : { id: "", nome: corpo.cliente.nome, novo: true };

  let contato: Plano["contato"] = null;
  if (corpo.contato) {
    const existente = cliente.novo ? null : casarContato(corpo.contato, cliente.id, await getContatoStore().list());
    contato = existente
      ? { id: existente.id, nome: existente.nome, novo: false }
      : { id: "", nome: corpo.contato.nome, novo: true };
  }

  const hoje = hojeEmSaoPaulo();
  return {
    hoje,
    followUp: dataDoFollowUp(hoje),
    funil: { id: funil.id, nome: funil.nome, criar: funil.criar },
    etapa,
    cliente,
    contato,
  };
}

function resumoDoPlano(p: Plano, feito = false) {
  const novo = feito ? "cadastrado agora" : "será cadastrado";
  return {
    cliente: { nome: p.cliente.nome, situacao: p.cliente.novo ? novo : "já cadastrado" },
    contato: p.contato ? { nome: p.contato.nome, situacao: p.contato.novo ? novo : "já cadastrado" } : null,
    negociacao: { funil: p.funil.nome, etapa: p.etapa.nome },
    followUp: p.followUp,
  };
}

interface Criado {
  clienteId: string;
  contatoId: string;
  negociacaoId: string;
  propostaId: string;
  tarefaId: string;
  links: { negociacao: string; cliente: string };
}

/**
 * Grava, na ordem das dependências. Cada criação empilha o seu desfazer; um
 * erro no meio desempilha tudo e repassa o erro — o resultado é tudo ou nada.
 * O que já existia antes (cliente, contato, funil) nunca entra na pilha.
 */
async function executar(corpo: CorpoRegistrar, plano: Plano, usuario: User): Promise<Criado> {
  const desfazer: (() => Promise<unknown>)[] = [];
  const autor = { criadoPor: usuario.email, criadoPorNome: usuario.name || usuario.email };
  const { proposta } = corpo;

  try {
    let funilId = plano.funil.id;
    let etapaId = plano.etapa.id;
    if (plano.funil.criar) {
      const f = await getFunilStore().create(funilPadrao());
      desfazer.push(() => getFunilStore().remove(f.id));
      funilId = f.id;
      etapaId = etapaPropostaEnviada(f.etapas)!.id;
    }

    let clienteId = plano.cliente.id;
    if (plano.cliente.novo) {
      const c = await getClienteStore().create({ ...corpo.cliente, contatoNome: corpo.contato?.nome ?? "", ...autor });
      desfazer.push(() => getClienteStore().remove(c.id));
      clienteId = c.id;
    }
    const clienteNome = plano.cliente.nome;

    let contatoId = plano.contato?.id ?? "";
    if (corpo.contato && plano.contato?.novo) {
      const c = await getContatoStore().create({
        ...corpo.contato,
        empresaId: clienteId,
        empresaNome: clienteNome,
        observacoes: "",
        ...autor,
      });
      desfazer.push(() => getContatoStore().remove(c.id));
      contatoId = c.id;
    }

    const autorAnotacao = { autor: usuario.email, autorNome: usuario.name || usuario.email };
    const negociacao = await getNegociacaoStore().create({
      nome: proposta.objeto,
      funilId,
      etapaId,
      valor: proposta.valor,
      empresaId: clienteId,
      empresaNome: clienteNome,
      contatoIds: contatoId ? [contatoId] : [],
      responsavel: usuario.email,
      responsavelNome: usuario.name || usuario.email,
      fonteId: "",
      fonteNome: "",
      situacao: "aberta",
      motivoPerdaId: "",
      motivoPerdaNome: "",
      previsao: "",
      qualificacao: 0,
      produtos: [],
      campos: {},
      fechadoEm: "",
      fechadoPor: "",
      anotacoes: [
        novaAnotacao({
          tipo: "sistema",
          texto: `Negociação criada pela integração do chat — proposta ${proposta.referencia}, ${formatBRL(proposta.valor)}.`,
          ...autorAnotacao,
        }),
      ],
      ...autor,
    });
    desfazer.push(() => getNegociacaoStore().remove(negociacao.id));

    const observacoes = [
      `Objeto: ${proposta.objeto}`,
      proposta.validadeDias ? `Validade: ${proposta.validadeDias} dias` : "",
      proposta.observacoes,
      "Registrada pela integração do chat.",
    ]
      .filter(Boolean)
      .join("\n");
    const p = await getPropostaStore().create({
      serviceKey: SERVICO_OUTRO,
      cliente: clienteNome,
      referencia: proposta.referencia,
      // "gerada" pelo mesmo motivo do registro manual: o documento existe e
      // está pronto — e é o status que libera o envio para a aprovação.
      status: "gerada",
      manual: true,
      dados: {
        servicoOutro: proposta.servico,
        valor: proposta.valor,
        dataEmissao: proposta.dataEmissao ?? plano.hoje,
        observacoes,
        negociacaoId: negociacao.id,
        clienteNome,
        origem: "integracao-chat",
      },
      criadoPor: usuario.email,
    });
    desfazer.push(() => getPropostaStore().remove(p.id));

    const tarefa = await getTarefaCrmStore().create({
      negociacaoId: negociacao.id,
      negociacaoNome: negociacao.nome,
      clienteId,
      clienteNome,
      tipo: "ligacao",
      assunto: `Follow-up da proposta ${proposta.referencia}`.slice(0, 200),
      data: plano.followUp,
      hora: "",
      notas: `Proposta ${proposta.referencia} — ${proposta.objeto} (${formatBRL(proposta.valor)}).`,
      responsavel: usuario.email,
      responsavelNome: usuario.name || usuario.email,
      repetirCada: 0,
      repetirUnidade: "",
      concluida: false,
      concluidaEm: "",
      concluidaPor: "",
      concluidaPorNome: "",
      comentario: "",
      proximaId: "",
      ...autor,
    });
    desfazer.push(() => getTarefaCrmStore().remove(tarefa.id));

    // Mesma anotação que a rota de tarefas grava ao agendar.
    await getNegociacaoStore().appendAnotacao(
      negociacao.id,
      novaAnotacao({
        tipo: "sistema",
        texto: `Tarefa agendada — Ligação: ${tarefa.assunto} (${tarefa.data}).`,
        ...autorAnotacao,
      }),
    );

    return {
      clienteId,
      contatoId,
      negociacaoId: negociacao.id,
      propostaId: p.id,
      tarefaId: tarefa.id,
      links: { negociacao: `/crm/negociacoes/${negociacao.id}`, cliente: `/crm/clientes/${clienteId}` },
    };
  } catch (e) {
    for (const passo of desfazer.reverse()) {
      try {
        await passo();
      } catch (falha) {
        console.error("Integração: falha ao desfazer um passo —", falha);
      }
    }
    throw e;
  }
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
