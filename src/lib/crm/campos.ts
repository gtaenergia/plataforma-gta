import { z } from "zod";

/**
 * Campos personalizados da negociação.
 *
 * Uma negociação de engenharia carrega o que uma negociação genérica não tem:
 * potência em kVA ou kWp, distribuidora, classe de tensão, número da UC, tipo
 * de obra. Sem lugar para isso, tudo ia para observações — texto livre que não
 * filtra, não agrupa e não entra em relatório.
 *
 * ## Por que só negociação, por enquanto
 *
 * É onde o dado de engenharia mora e onde a obrigatoriedade por etapa faz
 * diferença. Estender para contato e empresa é um `ALTER TABLE ... ADD COLUMN
 * entidade` — o mesmo caminho que o resto da plataforma já usa. Criar o campo
 * agora e não ter onde preenchê-lo seria prometer tela que não existe.
 *
 * ## As duas obrigatoriedades
 *
 * - **Sempre**: não se salva a ficha sem preencher. Para o que a negociação não
 *   pode existir sem — o número da UC, por exemplo.
 * - **Ao entrar na etapa X**: só avança para "Proposta enviada" quem informou a
 *   distribuidora. É o que dá disciplina ao funil, e é a razão de o RD Station
 *   ter essa variante.
 *
 * A criação rápida (o "+" da coluna do funil) NÃO é barrada: ela pede só o
 * nome, de propósito, para a negociação nascer antes de esfriar. A cobrança
 * vem quando alguém abre a ficha ou tenta avançar.
 */

export const TIPOS_CAMPO = ["texto", "numero", "data", "opcao", "multipla"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const TIPO_CAMPO_LABEL: Record<TipoCampo, string> = {
  texto: "Texto",
  numero: "Número",
  data: "Data",
  opcao: "Escolha uma opção",
  multipla: "Escolha várias opções",
};

export interface CampoPersonalizado {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  /** Alternativas de `opcao` e `multipla`. Vazio para os demais tipos. */
  opcoes: string[];
  /** Sem ele não se salva a ficha. */
  obrigatorio: boolean;
  /**
   * Id da etapa em que o campo passa a ser exigido para ENTRAR.
   * "" = não exigido por etapa.
   */
  obrigatorioNaEtapaId: string;
  /** Texto de apoio abaixo do campo. */
  ajuda: string;
  /** Menor primeiro. */
  ordem: number;
  /**
   * Campo aposentado. Some dos formulários e continua exibido nas negociações
   * que já o preencheram — apagar levaria junto um dado que alguém digitou.
   */
  arquivado: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** O que a negociação guarda: id do campo → valor. */
export type ValoresCampos = Record<string, string | string[]>;

const texto = (max: number) => z.string().trim().max(max).default("");

export const criarCampoSchema = z
  .object({
    rotulo: z.string().trim().min(1, "Informe o rótulo").max(60),
    tipo: z.enum(TIPOS_CAMPO),
    opcoes: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    obrigatorio: z.boolean().default(false),
    obrigatorioNaEtapaId: texto(64),
    ajuda: texto(200),
    ordem: z.coerce.number().int().min(0).max(999).default(0),
  })
  // Um "escolha uma opção" sem opções é um campo que ninguém consegue
  // preencher — e, se for obrigatório, tranca a negociação para sempre.
  .refine((c) => !["opcao", "multipla"].includes(c.tipo) || c.opcoes.length > 0, {
    message: "Informe ao menos uma opção para este tipo de campo.",
    path: ["opcoes"],
  });

export const atualizarCampoSchema = z.object({
  rotulo: z.string().trim().min(1).max(60).optional(),
  opcoes: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  obrigatorio: z.boolean().optional(),
  obrigatorioNaEtapaId: z.string().trim().max(64).optional(),
  ajuda: z.string().trim().max(200).optional(),
  ordem: z.coerce.number().int().min(0).max(999).optional(),
  arquivado: z.boolean().optional(),
});

/**
 * O TIPO não muda depois de criado.
 *
 * Trocar "texto" por "número" transformaria "220/380 V" já gravado em lixo
 * silencioso, e "escolha" por "texto" deixaria valores fora da lista. Quem
 * errou o tipo arquiva o campo e cria outro — o dado antigo continua legível.
 */

/** Um valor conta como preenchido? Zero e "0" contam; vazio e espaço não. */
export function preenchido(v: string | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Quais campos faltam — a regra, sem I/O.
 *
 * `etapaDestinoId` é a etapa para onde a negociação está indo (no salvamento
 * comum, a etapa atual). Campos arquivados nunca são exigidos: aposentar um
 * campo não pode travar uma negociação que nunca o conheceu.
 */
export function camposFaltando(
  campos: readonly CampoPersonalizado[],
  valores: ValoresCampos | undefined,
  etapaDestinoId: string,
): CampoPersonalizado[] {
  const v = valores ?? {};
  return campos.filter((c) => {
    if (c.arquivado) return false;
    const exigido = c.obrigatorio || (!!c.obrigatorioNaEtapaId && c.obrigatorioNaEtapaId === etapaDestinoId);
    return exigido && !preenchido(v[c.id]);
  });
}

/** A mensagem que a pessoa lê — nomeia os campos, não diz "dados inválidos". */
export function mensagemDeFaltantes(faltando: readonly CampoPersonalizado[], nomeDaEtapa?: string): string {
  const nomes = faltando.map((c) => `“${c.rotulo}”`).join(", ");
  const plural = faltando.length > 1;
  const alvo = nomeDaEtapa ? ` para avançar até ${nomeDaEtapa}` : "";
  return `${plural ? "Preencha os campos" : "Preencha o campo"} ${nomes}${alvo}.`;
}

/**
 * Limpa os valores recebidos: só campos que existem, e no formato do tipo.
 *
 * Sem isto, um `PATCH` poderia gravar chave inventada e inchar o jsonb, ou
 * mandar array onde a tela espera texto e quebrar a ficha na leitura.
 */
export function sanearValores(campos: readonly CampoPersonalizado[], bruto: unknown): ValoresCampos {
  if (!bruto || typeof bruto !== "object") return {};
  const entrada = bruto as Record<string, unknown>;
  const saida: ValoresCampos = {};
  for (const c of campos) {
    const v = entrada[c.id];
    if (v === undefined || v === null) continue;
    if (c.tipo === "multipla") {
      const lista = Array.isArray(v) ? v : [v];
      // Só o que está na lista de opções: uma alternativa removida da
      // configuração não pode continuar entrando por payload.
      const validas = lista.map(String).filter((x) => c.opcoes.includes(x));
      if (validas.length) saida[c.id] = validas;
    } else if (c.tipo === "opcao") {
      const s = String(v);
      if (c.opcoes.includes(s)) saida[c.id] = s;
    } else {
      const s = String(v).trim();
      if (s) saida[c.id] = s.slice(0, 500);
    }
  }
  return saida;
}
