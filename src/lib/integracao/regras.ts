import crypto from "node:crypto";
import { z } from "zod";
import { criarClienteSchema } from "@/lib/clientes/types";
import { criarContatoSchema } from "@/lib/crm/types";

/**
 * Integração "proposta gerada no chat → CRM" — as regras, sem I/O.
 *
 * A proposta técnica nasce numa conversa com o Claude, fora da plataforma. Sem
 * isto, alguém redigitava cliente, contato, negociação e follow-up à mão — e o
 * que não era redigitado ficava fora do funil. A rota é
 * `/api/integracoes/proposta`; aqui moram o contrato e as decisões puras, para
 * serem testadas sem banco.
 *
 * ## Segurança, em uma lista
 *
 * - Desligada por padrão: sem `INTEGRACAO_TOKEN_SHA256` a rota responde 404.
 * - O servidor guarda só o HASH do token. Quem lê as variáveis da Vercel não
 *   ganha o token; o texto puro mora apenas no computador de quem integra.
 * - Quem age é UM usuário fixo (`INTEGRACAO_USUARIO_EMAIL`), decidido no
 *   servidor. O token não escolhe em nome de quem grava.
 * - Só cria. Não lista, não altera, não apaga cadastro existente — a única
 *   leitura exposta é "este cliente existe?", com resposta mínima.
 */

/** Prefixo do token: deixa o segredo reconhecível por scanners de vazamento. */
export const PREFIXO_TOKEN = "gta_int_";

/** Corpo maior que isto não é proposta, é abuso — recusado antes do parse. */
export const TAMANHO_MAXIMO_CORPO = 32_000;

/** Freios. Folgados para o uso real (algumas propostas por dia), apertados para abuso. */
export const LIMITES = {
  /** Falhas de autenticação por IP numa janela de 15 min. */
  falhasPorIp: 10,
  janelaFalhasMs: 15 * 60 * 1000,
  /** Registros efetivados por hora. */
  registrosPorHora: 20,
  /** Chamadas autenticadas de qualquer tipo por hora (freia a enumeração de clientes). */
  chamadasPorHora: 120,
  janelaUsoMs: 60 * 60 * 1000,
} as const;

/** SHA-256 em hex — o que fica na Vercel no lugar do token. */
export function hashDoToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * O token apresentado confere com o hash configurado?
 *
 * Compara hash com hash, em tempo constante: os dois lados têm sempre 32
 * bytes, então nem o tamanho do token enviado vaza pela duração da resposta.
 */
export function tokenConfere(apresentado: string, hashConfigurado: string): boolean {
  const esperado = hashConfigurado.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(esperado)) return false;
  if (!apresentado.startsWith(PREFIXO_TOKEN)) return false;
  const a = Buffer.from(hashDoToken(apresentado), "hex");
  const b = Buffer.from(esperado, "hex");
  return crypto.timingSafeEqual(a, b);
}

/** Token do cabeçalho `Authorization: Bearer <token>`, ou "". */
export function tokenDoCabecalho(valor: string | null): string {
  const m = /^Bearer\s+(\S+)$/.exec(valor?.trim() ?? "");
  return m ? m[1] : "";
}

// ------------------------------------------------------------- Normalização

/** Só os dígitos — "12.345.678/0001-90" e "12345678000190" são o mesmo CNPJ. */
export const soDigitos = (s: string) => s.replace(/\D/g, "");

/** Nome para comparação: sem acento, sem caixa, sem espaço duplicado. */
export function nomeNormalizado(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------- Datas

/** "Hoje" no fuso de São Paulo (YYYY-MM-DD) — o servidor roda em UTC. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Data do follow-up: dois dias depois do registro; caindo no domingo, passa
 * para a segunda. Sábado fica — a regra pedida foi só a do domingo.
 */
export function dataDoFollowUp(hoje: string): string {
  const [a, m, d] = hoje.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d + 2));
  if (data.getUTCDay() === 0) data.setUTCDate(data.getUTCDate() + 1);
  return data.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Contrato

const dataIso = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD");

/**
 * `.strict()` em tudo: campo desconhecido é recusado, não ignorado. Um corpo
 * com chave a mais é sinal de cliente desatualizado — ou de alguém testando a
 * porta —, e nos dois casos é melhor parar.
 */
const clienteSchema = criarClienteSchema.omit({ contatoNome: true }).strict();

const contatoSchema = criarContatoSchema.pick({ nome: true, cargo: true, email: true, telefone: true }).strict();

const propostaSchema = z
  .object({
    /** Número impresso no documento — também é a chave contra registro duplicado. */
    referencia: z.string().trim().min(3, "Informe a referência da proposta").max(120),
    /** Nome curto do serviço ("Assessoria CBMGO") — vira o tipo da proposta avulsa. */
    servico: z.string().trim().min(2, "Informe o serviço").max(60),
    /** O objeto da proposta, em uma frase — vira o nome da negociação. */
    objeto: z.string().trim().min(3, "Informe o objeto da proposta").max(200),
    valor: z.number().positive("Informe o valor da proposta").max(1e10),
    dataEmissao: dataIso.optional(),
    validadeDias: z.number().int().min(1).max(365).optional(),
    observacoes: z.string().trim().max(1500).default(""),
  })
  .strict();

export const verificarClienteSchema = z
  .object({
    acao: z.literal("verificar-cliente"),
    nome: z.string().trim().max(200).default(""),
    documento: z.string().trim().max(20).default(""),
  })
  .strict()
  .refine((d) => !!d.nome || soDigitos(d.documento).length >= 11, {
    message: "Informe o nome ou o CPF/CNPJ.",
  });

export const registrarSchema = z
  .object({
    acao: z.enum(["simular", "registrar"]),
    cliente: clienteSchema,
    contato: contatoSchema.optional(),
    proposta: propostaSchema,
  })
  .strict();

export const corpoSchema = z.union([verificarClienteSchema, registrarSchema]);

export type CorpoVerificar = z.infer<typeof verificarClienteSchema>;
export type CorpoRegistrar = z.infer<typeof registrarSchema>;

// ------------------------------------------------------------- Casamentos

interface ClienteRef {
  id: string;
  nome: string;
  documento: string;
}

export type CasamentoCliente =
  | { tipo: "existente"; cliente: ClienteRef }
  | { tipo: "novo" }
  | { tipo: "ambiguo"; quantos: number };

/**
 * Qual cliente do cadastro é este?
 *
 * Pelo CPF/CNPJ quando veio um — é o único identificador que não depende de
 * como alguém digitou. Não achando pelo documento, pelo nome:
 *
 * - COM documento na busca, só entre os cadastros SEM documento: mesmo nome
 *   com CNPJ diferente é outra empresa (uma filial, um homônimo), não esta;
 *   já o homônimo sem CNPJ pode ser ela, cadastrada às pressas.
 * - SEM documento na busca, entre todos: quem só sabe o nome não pode criar
 *   um segundo cadastro de quem já está lá com CNPJ.
 *
 * Dois candidatos pelo nome é ambíguo, e ambiguidade para aqui: escolher um ao
 * acaso penduraria a negociação no cliente errado.
 */
export function casarCliente(
  busca: { nome: string; documento: string },
  cadastro: readonly ClienteRef[],
): CasamentoCliente {
  const doc = soDigitos(busca.documento);
  const temDoc = doc.length >= 11;
  if (temDoc) {
    const porDoc = cadastro.find((c) => soDigitos(c.documento) === doc);
    if (porDoc) return { tipo: "existente", cliente: porDoc };
  }
  const nome = nomeNormalizado(busca.nome);
  if (!nome) return { tipo: "novo" };
  const porNome = cadastro.filter(
    (c) => nomeNormalizado(c.nome) === nome && (!temDoc || !soDigitos(c.documento)),
  );
  if (porNome.length === 1) return { tipo: "existente", cliente: porNome[0] };
  if (porNome.length > 1) return { tipo: "ambiguo", quantos: porNome.length };
  return { tipo: "novo" };
}

interface ContatoRef {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresaId: string;
}

/**
 * O contato já está na lista deste cliente? E-mail, depois telefone, depois
 * nome — do mais ao menos confiável. Só dentro da mesma empresa: o "João" de
 * outro cliente não é este.
 */
export function casarContato(
  busca: { nome: string; email: string; telefone: string },
  empresaId: string,
  contatos: readonly ContatoRef[],
): ContatoRef | null {
  const daEmpresa = contatos.filter((c) => c.empresaId === empresaId);
  const email = busca.email.trim().toLowerCase();
  if (email) {
    const c = daEmpresa.find((x) => x.email.trim().toLowerCase() === email);
    if (c) return c;
  }
  const tel = soDigitos(busca.telefone);
  if (tel.length >= 8) {
    const c = daEmpresa.find((x) => soDigitos(x.telefone).endsWith(tel.slice(-8)) && soDigitos(x.telefone).length >= 8);
    if (c) return c;
  }
  const nome = nomeNormalizado(busca.nome);
  return daEmpresa.find((x) => nomeNormalizado(x.nome) === nome) ?? null;
}

/** A etapa "Proposta enviada" do funil, pelo nome — os ids são uuid por conta. */
export function etapaPropostaEnviada(etapas: readonly { id: string; nome: string }[]) {
  return etapas.find((e) => nomeNormalizado(e.nome) === "proposta enviada") ?? null;
}
