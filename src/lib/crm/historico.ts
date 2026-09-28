import { z } from "zod";
import type { Estacao } from "../orcamentos/types";
import type { StatusProposta } from "../propostas/types";
import { ehDoCliente, type RefCliente } from "./followups";
import { hojeEmSaoPaulo } from "./repeticao";
import type { Negociacao, SituacaoNegociacao } from "./types";

/**
 * O histórico do cliente com a GTA: tudo o que ele já pediu, e o que
 * aconteceu com cada pedido.
 *
 * Duas fontes, uma lista só:
 *
 * - **As propostas do operacional** entram sozinhas. O que a plataforma já
 *   sabe — serviço, referência, valor, datas, a negociação ganha ou perdida —
 *   vem delas, sem ninguém redigitar.
 * - **O que só o comercial sabe** — quando a proposta foi apresentada, se
 *   fechou, se foi upsell, o que o cliente disse — fica num REGISTRO ao lado
 *   da proposta. Pedido que nunca virou proposta na plataforma (o de antes
 *   dela, o verbal) é um registro sozinho.
 *
 * O registro não copia a proposta: guarda só o que foi escrito à mão. Campo
 * vazio no registro quer dizer "use o automático" — assim, quando a negociação
 * for ganha amanhã, o resultado muda sozinho em vez de ficar congelado no
 * "em aberto" de quando alguém abriu a ficha.
 */

// ------------------------------------------------------------- Catálogos

export const NATUREZAS = ["consultoria", "projeto", "execucao", "fornecimento", "outro"] as const;
export type Natureza = (typeof NATUREZAS)[number];
export const NATUREZA_LABEL: Record<Natureza, string> = {
  consultoria: "Consultoria",
  projeto: "Projeto",
  execucao: "Execução",
  fornecimento: "Fornecimento",
  outro: "Outro",
};

export const RESULTADOS = ["em_aberto", "fechado", "nao_fechado"] as const;
export type Resultado = (typeof RESULTADOS)[number];
export const RESULTADO_LABEL: Record<Resultado, string> = {
  em_aberto: "Em aberto",
  fechado: "Fechou",
  nao_fechado: "Não fechou",
};

export const MOVIMENTOS = ["primeira_venda", "recompra", "upsell", "cross_sell", "downsell"] as const;
export type Movimento = (typeof MOVIMENTOS)[number];
export const MOVIMENTO_LABEL: Record<Movimento, string> = {
  primeira_venda: "Primeira venda",
  recompra: "Recompra",
  upsell: "Upsell",
  cross_sell: "Cross-sell",
  downsell: "Downsell",
};
/** O que cada tipo de venda quer dizer — vai de dica na tela. */
export const MOVIMENTO_AJUDA: Record<Movimento, string> = {
  primeira_venda: "O primeiro negócio do cliente com a GTA.",
  recompra: "Voltou a comprar o mesmo serviço.",
  upsell: "Comprou mais, ou uma versão maior, do que já tinha.",
  cross_sell: "Comprou um serviço diferente dos que já tinha.",
  downsell: "Fechou algo menor do que o proposto.",
};

/**
 * A natureza que cada serviço costuma ter — só SUGESTÃO, mostrada como tal e
 * corrigível linha a linha.
 *
 * Rede MT fica de fora de propósito: o mesmo configurador precifica projeto
 * E/OU execução, e chutar um dos dois erraria metade das propostas. "Outro"
 * também: por definição, não se sabe o que é.
 */
const NATUREZA_DO_SERVICO: Readonly<Record<string, Natureza>> = {
  "projeto-subestacao": "projeto",
  "projeto-bt": "projeto",
  spda: "projeto",
  "execucao-subestacao": "execucao",
  solar: "execucao",
  carregador: "execucao",
  "mao-de-obra": "execucao",
  limpeza: "execucao",
  qgbt: "fornecimento",
  "laudo-inspecao": "consultoria",
  analisador: "consultoria",
  conexao: "consultoria",
};

export function naturezaDoServico(serviceKey: string): Natureza | "" {
  return NATUREZA_DO_SERVICO[serviceKey] ?? "";
}

// ------------------------------------------------------------- Registro

export interface RegistroHistorico {
  id: string;
  clienteId: string;
  clienteNome: string;
  /** A proposta do operacional que este registro completa ("" = pedido avulso). */
  propostaId: string;
  /** O que foi pedido. Na proposta, vazio = o nome do serviço. */
  titulo: string;
  natureza: Natureza | "";
  /** Valor escrito à mão; `null` = o da proposta/orçamento. */
  valor: number | null;
  /** Datas em YYYY-MM-DD; "" = não informada (ou a automática, na proposta). */
  solicitadoEm: string;
  apresentadoEm: string;
  resultado: Resultado | "";
  decididoEm: string;
  movimento: Movimento | "";
  observacoes: string;
  /** Negociação do pedido avulso, quando houver. */
  negociacaoId: string;
  criadoPor: string;
  criadoPorNome?: string;
  criadoEm: string;
  atualizadoEm: string;
}

const dataOpcional = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .or(z.literal(""));

const camposRegistro = {
  titulo: z.string().trim().max(200),
  natureza: z.enum(NATUREZAS).or(z.literal("")),
  valor: z.number().min(0).nullable(),
  solicitadoEm: dataOpcional,
  apresentadoEm: dataOpcional,
  resultado: z.enum(RESULTADOS).or(z.literal("")),
  decididoEm: dataOpcional,
  movimento: z.enum(MOVIMENTOS).or(z.literal("")),
  observacoes: z.string().trim().max(4000),
  negociacaoId: z.string().trim().max(64),
};

export const criarRegistroSchema = z
  .object({
    clienteId: z.string().trim().min(1, "Escolha o cliente").max(64),
    propostaId: z.string().trim().max(64).default(""),
    titulo: camposRegistro.titulo.default(""),
    natureza: camposRegistro.natureza.default(""),
    valor: camposRegistro.valor.default(null),
    solicitadoEm: camposRegistro.solicitadoEm.default(""),
    apresentadoEm: camposRegistro.apresentadoEm.default(""),
    resultado: camposRegistro.resultado.default(""),
    decididoEm: camposRegistro.decididoEm.default(""),
    movimento: camposRegistro.movimento.default(""),
    observacoes: camposRegistro.observacoes.default(""),
    negociacaoId: camposRegistro.negociacaoId.default(""),
  })
  // Pedido avulso sem nome não diz o que foi pedido; na proposta, o nome
  // vem do serviço.
  .refine((d) => !!d.propostaId || !!d.titulo, { message: "Diga o que o cliente pediu.", path: ["titulo"] });

/** Cliente e proposta ficam fora: mudar isso é outro registro, não uma edição. */
export const atualizarRegistroSchema = z.object(camposRegistro).partial();

// --------------------------------------------------- O que chega da plataforma

/**
 * A proposta já resumida pelo servidor. O `dados` inteiro fica lá: é pesado
 * (a configuração completa do serviço) e o histórico só precisa disto.
 */
export interface PropostaResumo {
  id: string;
  serviceKey: string;
  rotuloServico: string;
  cliente: string;
  referencia: string;
  status: StatusProposta;
  criadoEm: string;
  /** Data de emissão escrita na proposta ("" se não houver). */
  dataEmissao: string;
  /** Valor impresso no documento (0 = não deu para ler). */
  valorDocumento: number;
  /** Negociação do CRM que pediu a proposta ("" = nasceu em Operações). */
  negociacaoId: string;
}

export interface OrcamentoResumo {
  propostaId: string;
  valor: number | undefined;
  estacao: Estacao;
}

// ------------------------------------------------------------- A linha

export interface LinhaHistorico {
  /** `p:<propostaId>` ou `r:<registroId>` — estável entre recargas. */
  chave: string;
  origem: "proposta" | "avulso";
  /** "" enquanto ninguém escreveu nada sobre a proposta. */
  registroId: string;
  propostaId: string;
  referencia: string;
  titulo: string;
  servicoKey: string;
  natureza: Natureza | "";
  naturezaAutomatica: boolean;
  valor: number;
  valorAutomatico: boolean;
  solicitadoEm: string;
  solicitadoAutomatico: boolean;
  /** Emissão da proposta (só nas que vieram do operacional). */
  propostaEm: string;
  apresentadoEm: string;
  resultado: Resultado;
  resultadoAutomatico: boolean;
  decididoEm: string;
  movimento: Movimento | "";
  observacoes: string;
  statusProposta: StatusProposta | "";
  estacaoOrcamento: Estacao | "";
  negociacao: { id: string; nome: string; situacao: SituacaoNegociacao } | null;
  /** O que foi gravado à mão, para o formulário de edição partir dele. */
  registro: RegistroHistorico | null;
  /**
   * O que a plataforma diria sozinha. O formulário mostra isto como
   * "automático" em vez de preencher o campo: gravar a sugestão como se fosse
   * escolha congelaria o resultado de hoje quando a negociação mudar amanhã.
   */
  automatico: {
    natureza: Natureza | "";
    valor: number;
    solicitadoEm: string;
    resultado: Resultado;
    decididoEm: string;
  };
}

/**
 * Nome comparável: sem acento, sem caixa, sem espaço sobrando.
 *
 * O cliente da proposta é digitado no configurador, e "Fazenda Rio Doce" e
 * "fazenda rio doce " são o mesmo cliente. Mais que isso ("Ltda", "S/A",
 * abreviações) não se tenta: juntar clientes diferentes por semelhança seria
 * pior do que deixar uma proposta para vincular à mão.
 */
export function nomeComparavel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * As propostas que são deste cliente.
 *
 * Na ordem de confiança: o vínculo feito à mão (o registro da proposta diz de
 * quem ela é — inclusive quando é de OUTRO cliente); depois a negociação que
 * pediu a proposta; por último o nome digitado no configurador.
 */
export function propostasDoCliente(
  cliente: RefCliente,
  propostas: readonly PropostaResumo[],
  registros: readonly RegistroHistorico[],
  negociacoes: readonly Negociacao[],
): PropostaResumo[] {
  const vinculo = new Map(registros.filter((r) => r.propostaId).map((r) => [r.propostaId, r.clienteId]));
  const porNegociacao = new Map(negociacoes.map((n) => [n.id, n]));
  const alvo = nomeComparavel(cliente.nome);
  return propostas.filter((p) => {
    const dono = vinculo.get(p.id);
    if (dono !== undefined) return dono === cliente.id;
    const n = p.negociacaoId ? porNegociacao.get(p.negociacaoId) : undefined;
    if (n && (n.empresaId || n.empresaNome)) return ehDoCliente({ id: n.empresaId, nome: n.empresaNome }, cliente);
    return !!alvo && nomeComparavel(p.cliente) === alvo;
  });
}

/**
 * O dia de um carimbo, em São Paulo. Cortar o texto daria o dia em UTC: a
 * proposta aberta ou a negociação ganha às 22h daqui cairia no dia seguinte.
 */
function dia(iso: string): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : hojeEmSaoPaulo(d);
}

/**
 * Quando o cliente pediu, pelo que a plataforma sabe: a MAIS ANTIGA entre a
 * emissão escrita na proposta e o dia em que ela entrou na plataforma.
 *
 * Só a data de entrada mentiria na proposta antiga cadastrada hoje (a
 * "Registrar proposta" das feitas fora da plataforma): o pedido de março
 * apareceria como de hoje, e o "cliente desde" junto. Nenhum pedido é
 * posterior à proposta que ele gerou.
 */
function pedidoAutomatico(p: PropostaResumo): string {
  return [p.dataEmissao, dia(p.criadoEm)].filter(Boolean).sort()[0] ?? "";
}

/** Resultado que a plataforma consegue afirmar sozinha: o da negociação. */
function resultadoDaNegociacao(n: Negociacao | undefined): { resultado: Resultado; em: string } | null {
  if (n?.situacao === "ganha") return { resultado: "fechado", em: dia(n.fechadoEm) };
  if (n?.situacao === "perdida") return { resultado: "nao_fechado", em: dia(n.fechadoEm) };
  return null;
}

export function montarHistorico(e: {
  cliente: RefCliente;
  propostas: readonly PropostaResumo[];
  orcamentos: readonly OrcamentoResumo[];
  negociacoes: readonly Negociacao[];
  registros: readonly RegistroHistorico[];
}): LinhaHistorico[] {
  const porNegociacao = new Map(e.negociacoes.map((n) => [n.id, n]));
  const orcamentoDa = new Map(e.orcamentos.map((o) => [o.propostaId, o]));
  const registroDa = new Map(e.registros.filter((r) => r.propostaId).map((r) => [r.propostaId, r]));
  const resumoNeg = (n: Negociacao | undefined) => (n ? { id: n.id, nome: n.nome, situacao: n.situacao } : null);

  const daPlataforma = propostasDoCliente(e.cliente, e.propostas, e.registros, e.negociacoes).map((p): LinhaHistorico => {
    const r = registroDa.get(p.id) ?? null;
    const orc = orcamentoDa.get(p.id);
    const neg = p.negociacaoId ? porNegociacao.get(p.negociacaoId) : undefined;
    const valorAuto = orc?.valor && orc.valor > 0 ? orc.valor : p.valorDocumento;
    const auto = resultadoDaNegociacao(neg);
    const naturezaAuto = naturezaDoServico(p.serviceKey);
    const natureza = r?.natureza || naturezaAuto;
    return {
      chave: `p:${p.id}`,
      origem: "proposta",
      registroId: r?.id ?? "",
      propostaId: p.id,
      referencia: p.referencia,
      titulo: r?.titulo || p.rotuloServico,
      servicoKey: p.serviceKey,
      natureza,
      naturezaAutomatica: !r?.natureza && !!natureza,
      valor: r?.valor ?? valorAuto,
      valorAutomatico: r?.valor == null,
      solicitadoEm: r?.solicitadoEm || pedidoAutomatico(p),
      solicitadoAutomatico: !r?.solicitadoEm,
      propostaEm: p.dataEmissao,
      apresentadoEm: r?.apresentadoEm ?? "",
      resultado: r?.resultado || auto?.resultado || "em_aberto",
      resultadoAutomatico: !r?.resultado,
      decididoEm: r?.decididoEm || (r?.resultado ? "" : auto?.em ?? ""),
      movimento: r?.movimento ?? "",
      observacoes: r?.observacoes ?? "",
      statusProposta: p.status,
      estacaoOrcamento: orc?.estacao ?? "",
      negociacao: resumoNeg(neg),
      registro: r,
      automatico: {
        natureza: naturezaAuto,
        valor: valorAuto,
        solicitadoEm: pedidoAutomatico(p),
        resultado: auto?.resultado ?? "em_aberto",
        decididoEm: auto?.em ?? "",
      },
    };
  });

  const avulsos = e.registros
    .filter((r) => !r.propostaId && r.clienteId === e.cliente.id)
    .map((r): LinhaHistorico => {
      const neg = r.negociacaoId ? porNegociacao.get(r.negociacaoId) : undefined;
      const auto = resultadoDaNegociacao(neg);
      return {
        chave: `r:${r.id}`,
        origem: "avulso",
        registroId: r.id,
        propostaId: "",
        referencia: "",
        titulo: r.titulo,
        servicoKey: "",
        natureza: r.natureza,
        naturezaAutomatica: false,
        valor: r.valor ?? 0,
        valorAutomatico: false,
        solicitadoEm: r.solicitadoEm,
        solicitadoAutomatico: false,
        propostaEm: "",
        apresentadoEm: r.apresentadoEm,
        resultado: r.resultado || auto?.resultado || "em_aberto",
        resultadoAutomatico: !r.resultado,
        decididoEm: r.decididoEm || (r.resultado ? "" : auto?.em ?? ""),
        movimento: r.movimento,
        observacoes: r.observacoes,
        statusProposta: "",
        estacaoOrcamento: "",
        negociacao: resumoNeg(neg),
        registro: r,
        automatico: {
          natureza: "",
          valor: 0,
          solicitadoEm: "",
          resultado: auto?.resultado ?? "em_aberto",
          decididoEm: auto?.em ?? "",
        },
      };
    });

  // Mais recente primeiro — a ficha abre no que aconteceu por último. Pedido
  // sem data vai para o fim: não há como saber onde ele cai.
  return [...daPlataforma, ...avulsos].sort((a, b) => {
    const da = a.solicitadoEm || a.propostaEm;
    const db = b.solicitadoEm || b.propostaEm;
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    return db.localeCompare(da);
  });
}

export interface ResumoHistorico {
  pedidos: number;
  fechados: number;
  valorFechado: number;
  naoFechados: number;
  emAberto: number;
  /** Data do pedido mais antigo ("" sem nenhum datado). */
  desde: string;
}

export function resumoHistorico(linhas: readonly LinhaHistorico[]): ResumoHistorico {
  const datas = linhas.map((l) => l.solicitadoEm || l.propostaEm).filter(Boolean).sort();
  const fechadas = linhas.filter((l) => l.resultado === "fechado");
  return {
    pedidos: linhas.length,
    fechados: fechadas.length,
    valorFechado: fechadas.reduce((s, l) => s + l.valor, 0),
    naoFechados: linhas.filter((l) => l.resultado === "nao_fechado").length,
    emAberto: linhas.filter((l) => l.resultado === "em_aberto").length,
    desde: datas[0] ?? "",
  };
}
