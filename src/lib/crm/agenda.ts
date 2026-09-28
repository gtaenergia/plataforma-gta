import type { Cliente } from "../clientes/types";
import { clienteDaTarefa, ehDoCliente, negociacaoDeReferencia, quemFez, type RefCliente } from "./followups";
import { somarIntervalo } from "./repeticao";
import type { Contato, Funil, Negociacao, TarefaCrm, TipoTarefa } from "./types";

/**
 * A agenda do dia do comercial (puro, sem I/O).
 *
 * Cada compromisso chega pronto para a ligação: com quem falar e como, em que
 * etapa a conversa está, quantas vezes já se falou com o cliente, quem falou
 * por último e o que ele disse. É o que evita abrir três telas antes de pegar
 * o telefone.
 */

export interface ContatoAgenda {
  nome: string;
  cargo: string;
  telefone: string;
  email: string;
}

export interface RegistroAgenda {
  /** Quando o contato foi registrado (ISO) — ou a data agendada, se antigo. */
  em: string;
  por: string;
  tipo: TipoTarefa;
  assunto: string;
  comentario: string;
}

export interface ItemAgenda {
  tarefa: TarefaCrm;
  cliente: RefCliente;
  contatos: ContatoAgenda[];
  /** A negociação que diz a etapa — ver `negociacaoDeReferencia`. */
  negociacao: Negociacao | null;
  /** Nome da etapa da negociação ("" sem negociação em andamento). */
  etapa: string;
  /** Contatos já feitos com o cliente — o contador de follow-ups. */
  feitos: number;
  ultimo: RegistroAgenda | null;
  /** Os últimos contatos com comentário, do mais novo para o mais antigo. */
  recentes: RegistroAgenda[];
}

export interface DiaAgenda {
  data: string;
  itens: ItemAgenda[];
}

export interface Agenda {
  atrasados: ItemAgenda[];
  /** De hoje até `ate`, só os dias com compromisso. */
  dias: DiaAgenda[];
  /** Último dia mostrado (YYYY-MM-DD). */
  ate: string;
  /** Compromissos depois de `ate` — ficam para "ver mais". */
  depois: number;
}

/** Quantos contatos anteriores aparecem nos detalhes. */
const RECENTES = 3;

const normal = (s: string) => s.trim().toLowerCase();
const chaveCliente = (c: RefCliente) => (c.id ? `id:${c.id}` : `nome:${normal(c.nome)}`);

function registro(t: TarefaCrm): RegistroAgenda {
  return { em: t.concluidaEm || t.data, por: quemFez(t), tipo: t.tipo, assunto: t.assunto, comentario: t.comentario };
}

/**
 * Com quem falar, na ordem em que se procura: quem está na negociação, o
 * contato do cadastro do cliente e os demais contatos dele. Repetido sai uma
 * vez só — o mesmo João cadastrado nos dois lugares é uma pessoa.
 */
function contatosDoCliente(
  alvo: RefCliente,
  cadastro: Cliente | undefined,
  negociacao: Negociacao | null,
  contatos: readonly Contato[],
): ContatoAgenda[] {
  const lista: ContatoAgenda[] = [];
  const vistos = new Set<string>();
  const por = (c: ContatoAgenda) => {
    const chave = `${normal(c.nome)}|${c.telefone.replace(/\D/g, "")}|${normal(c.email)}`;
    if (!c.nome && !c.telefone && !c.email) return;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    lista.push(c);
  };
  const daNegociacao = new Set(negociacao?.contatoIds ?? []);
  for (const c of contatos) {
    if (daNegociacao.has(c.id)) por({ nome: c.nome, cargo: c.cargo, telefone: c.telefone, email: c.email });
  }
  if (cadastro) por({ nome: cadastro.contatoNome, cargo: "", telefone: cadastro.telefone, email: cadastro.email });
  for (const c of contatos) {
    if (!daNegociacao.has(c.id) && ehDoCliente({ id: c.empresaId, nome: c.empresaNome }, alvo)) {
      por({ nome: c.nome, cargo: c.cargo, telefone: c.telefone, email: c.email });
    }
  }
  return lista;
}

export function montarAgenda(e: {
  tarefas: readonly TarefaCrm[];
  negociacoes: readonly Negociacao[];
  clientes: readonly Cliente[];
  contatos: readonly Contato[];
  funis: readonly Funil[];
  /** YYYY-MM-DD, no fuso de quem usa (ver `hojeEmSaoPaulo`). */
  hoje: string;
  /** Quantos dias a partir de hoje (hoje incluído). */
  dias: number;
  /** E-mail: só os compromissos desta pessoa. Vazio = equipe toda. */
  responsavel?: string;
}): Agenda {
  const porNegociacao = new Map(e.negociacoes.map((n) => [n.id, n]));
  const cadastroPorId = new Map(e.clientes.map((c) => [c.id, c]));
  const ate = somarIntervalo(e.hoje, Math.max(1, e.dias) - 1, "dias");

  const concluidas = e.tarefas
    .filter((t) => t.concluida)
    .map((t) => ({ t, ref: clienteDaTarefa(t, porNegociacao) }));

  // O resumo é do CLIENTE, e vários compromissos do mesmo cliente o repetem:
  // calcular uma vez por cliente.
  const resumos = new Map<string, Pick<ItemAgenda, "feitos" | "ultimo" | "recentes">>();
  const resumoDe = (alvo: RefCliente) => {
    const chave = chaveCliente(alvo);
    const pronto = resumos.get(chave);
    if (pronto) return pronto;
    const doCliente = concluidas
      .filter((c) => ehDoCliente(c.ref, alvo))
      .map((c) => c.t)
      .sort((a, b) => (b.concluidaEm || b.data).localeCompare(a.concluidaEm || a.data));
    const resumo = {
      feitos: doCliente.length,
      ultimo: doCliente[0] ? registro(doCliente[0]) : null,
      recentes: doCliente.filter((t) => t.comentario).slice(0, RECENTES).map(registro),
    };
    resumos.set(chave, resumo);
    return resumo;
  };

  const quem = normal(e.responsavel ?? "");
  const pendentes = e.tarefas
    .filter((t) => !t.concluida && t.data)
    .filter((t) => !quem || normal(t.responsavel) === quem)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));

  const item = (t: TarefaCrm): ItemAgenda => {
    const ref = clienteDaTarefa(t, porNegociacao);
    const cadastro = ref.id ? cadastroPorId.get(ref.id) : undefined;
    // O nome do cadastro vence o gravado na tarefa: se o cliente foi
    // renomeado, a agenda mostra o nome de hoje.
    const alvo: RefCliente = { id: ref.id, nome: cadastro?.nome || ref.nome };
    const negociacao = negociacaoDeReferencia(t, alvo, e.negociacoes);
    const funil = negociacao ? e.funis.find((f) => f.id === negociacao.funilId) : undefined;
    return {
      tarefa: t,
      cliente: alvo,
      contatos: contatosDoCliente(alvo, cadastro, negociacao, e.contatos),
      negociacao,
      etapa: funil?.etapas.find((et) => et.id === negociacao?.etapaId)?.nome ?? "",
      ...resumoDe(alvo),
    };
  };

  const atrasados: ItemAgenda[] = [];
  const porDia = new Map<string, ItemAgenda[]>();
  let depois = 0;
  for (const t of pendentes) {
    if (t.data < e.hoje) atrasados.push(item(t));
    else if (t.data <= ate) porDia.set(t.data, [...(porDia.get(t.data) ?? []), item(t)]);
    else depois++;
  }

  return {
    atrasados,
    dias: Array.from(porDia, ([data, itens]) => ({ data, itens })),
    ate,
    depois,
  };
}

/**
 * Link de WhatsApp a partir do telefone como foi digitado ("(62) 99999-0000").
 *
 * Só para celular — DDD + 9 dígitos começando em 9. Telefone fixo raramente
 * tem WhatsApp, e o link abriria a tela de "número não está no WhatsApp" no
 * meio de uma ligação que devia ser pelo telefone mesmo.
 */
export function linkWhatsApp(telefone: string): string | null {
  let d = telefone.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11 || d[2] !== "9") return null;
  return `https://wa.me/55${d}`;
}

const DIAS_DA_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** "Hoje", "Amanhã" ou o dia da semana — o que a pessoa usa para se situar. */
export function rotuloDoDia(data: string, hoje: string): string {
  if (data === hoje) return "Hoje";
  if (data === somarIntervalo(hoje, 1, "dias")) return "Amanhã";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return data;
  return DIAS_DA_SEMANA[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}
