/**
 * Modelo intermediário dos laudos.
 *
 * Cada laudo (análise de risco, memorial do quadro) é montado UMA vez como
 * uma lista de blocos, e dois renderizadores o transformam em PDF (pdfmake) e
 * em Word (docx). Assim os dois formatos têm sempre o mesmo conteúdo, na mesma
 * ordem — o que muda é só a tipografia de cada mídia.
 */

export type Tom = "ok" | "falha" | "info" | "alerta" | "neutro";

export interface Trecho {
  t: string;
  b?: boolean;
  i?: boolean;
  cor?: string;
  sub?: boolean;
  sup?: boolean;
}
export type Texto = string | Trecho[];

export interface Celula {
  t: Texto;
  align?: "left" | "right" | "center";
  b?: boolean;
  /** Pílula colorida (parecer). */
  selo?: Tom;
  /** Fundo da célula (hex sem #). */
  fundo?: string;
  cor?: string;
  colSpan?: number;
  mono?: boolean;
}

export type LinhaTabela = Celula[] | { grupo: string };

export interface Coluna {
  titulo: string;
  /** Peso relativo da largura. */
  peso?: number;
  align?: "left" | "right" | "center";
}

export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: string; quebraAntes?: boolean; sumario?: boolean }
  | { tipo: "paragrafo"; texto: Texto; align?: "justify" | "left" | "center" | "right"; tamanho?: number; cor?: string; espacoDepois?: number }
  | { tipo: "tabela"; colunas: Coluna[]; linhas: LinhaTabela[]; total?: Celula[]; fonte?: number; legenda?: string }
  | { tipo: "nota"; titulo?: string; texto: Texto; tom: Tom }
  | { tipo: "cartoes"; itens: { valor: string; rotulo: string; sub?: string; destaque?: boolean }[] }
  | { tipo: "lista"; titulo?: string; itens: Texto[]; marcador?: "check" | "ponto"; colunas?: 1 | 2 }
  | { tipo: "equacao"; numero: number; expressao: Texto; onde: [string, string][]; referencia?: string }
  | { tipo: "banner"; ok: boolean; titulo: string; texto: string; lateral?: { rotulo: string; valor: string } }
  | { tipo: "svg"; svg: string; largura: number; altura: number }
  | { tipo: "assinatura"; local: string; data: string; nome: string; registro: string; empresa: string; art?: string }
  | { tipo: "quebra" }
  | { tipo: "espaco"; altura: number }
  | { tipo: "paisagem"; blocos: Bloco[] };

export interface Laudo {
  arquivo: string;
  /** Texto do cabeçalho corrido. */
  cabecalho: string;
  emitidoEm: string;
  /** Sem capa (folhas de diagrama). */
  capa?: {
    faixa: string;
    titulo: string;
    subtitulo: string;
    norma: string;
    veredito?: { ok: boolean; titulo: string; texto: string };
    metadados: { rotulo: string; valor: string }[];
  };
  sumario: boolean;
  blocos: Bloco[];
  /** Folha A3 deitada (diagramas). */
  folha?: "A4" | "A3-paisagem";
}

export const COR = {
  navy: "1A2F4A",
  navy2: "243555",
  indigo: "5B4FCF",
  azul: "2E6DB4",
  laranja: "F26522",
  verde: "1E8A4C",
  verdeFundo: "DFF3E6",
  vermelho: "C62828",
  vermelhoFundo: "FBE3E3",
  ambar: "B45309",
  ambarFundo: "FEF3C7",
  cinza: "64748B",
  cinzaClaro: "F1F4F8",
  zebra: "FAFBFC",
  borda: "D8DEE8",
  lavanda: "F1EFFD",
  infoFundo: "EAF1FB",
} as const;

export function textoPlano(t: Texto): string {
  return typeof t === "string" ? t : t.map((x) => x.t).join("");
}

export const c = (t: Texto, extra: Partial<Celula> = {}): Celula => ({ t, ...extra });
export const cr = (t: Texto, extra: Partial<Celula> = {}): Celula => ({ t, align: "right", ...extra });
