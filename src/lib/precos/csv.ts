import { diasRestantes, type MaterialPreco } from "./catalogo";

/**
 * Planilha de materiais — ida e volta.
 *
 * A plataforma gera o arquivo já preenchido com o que está valendo, e a pessoa
 * digita a coluna "PREÇO NOVO". Quem manda é o `id`, não a linha nem a
 * descrição: a planilha pode ser reordenada, filtrada ou ter linhas apagadas
 * que a importação continua acertando o item.
 *
 * ## Acrescentar material
 *
 * A planilha não serve só para corrigir preço. Uma linha nova, com o **id em
 * branco** e categoria/descrição/unidade preenchidas, CRIA o material — é o
 * caminho para o que a lista ainda não tem (luva de raspa, disco de corte)
 * sem depender de alguém mexer no código. O id é gerado a partir da descrição,
 * então reimportar a mesma planilha atualiza em vez de duplicar.
 *
 * Ponto e vírgula porque o Excel em pt-BR usa vírgula como decimal; BOM para
 * ele reconhecer os acentos como UTF-8.
 */

const SEP = ";";
const BOM = "﻿";

const escapar = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * `dias_restantes` é INFORMATIVO, como `preco_atual`: diz quanto falta para
 * aquele preço vencer, e é ignorado na volta. O prazo é o mesmo para todo
 * material (3 meses) e não se digita — o que reinicia a contagem é revisar o
 * preço. A coluna fica no FIM para não deslocar as anteriores: planilha
 * baixada antes dela continua importando certo.
 */
export const CABECALHO = ["id", "categoria", "descricao", "unidade", "preco_atual", "PRECO_NOVO", "dias_restantes"];

export function gerarCsv(itens: MaterialPreco[]): string {
  const linhas = itens.map((i) =>
    [i.id, i.categoria, i.descricao, i.unidade, brl(i.preco), "", String(diasRestantes(i.atualizadoEm))]
      .map(escapar)
      .join(SEP),
  );
  /* Uma linha de exemplo, comentada pelo próprio conteúdo: sem ela, ninguém
     descobre que dá para acrescentar material — a planilha parece só de leitura
     do id para baixo. Ela é ignorada na volta, porque não tem PREÇO NOVO. */
  const exemplo = ["", "Ferramentas", "← id em branco cria material novo: preencha esta linha", "un", "", "", ""]
    .map(escapar)
    .join(SEP);
  return BOM + [CABECALHO.map(escapar).join(SEP), ...linhas, exemplo].join("\r\n") + "\r\n";
}

export interface LinhaPlanilha {
  /** Vazio = material novo; o id sai da descrição na hora de gravar. */
  id?: string;
  preco: number;
  categoria?: string;
  descricao?: string;
  unidade?: string;
}

export interface ResultadoLeitura {
  precos: LinhaPlanilha[];
  /** Linhas que não puderam ser lidas, com o motivo — mostradas ao usuário. */
  problemas: { linha: number; motivo: string }[];
  /** Linhas com PREÇO NOVO em branco: ignoradas de propósito, não são erro. */
  emBranco: number;
}

/** "1.234,56" ou "1234.56" → 1234.56. */
function parseBR(txt: string): number {
  const t = txt.trim().replace(/^R\$\s*/i, "");
  if (!t) return Number.NaN;
  // Com vírgula, ela é o decimal e o ponto é milhar. Sem vírgula, o ponto decide.
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return Number(normal);
}

/** Divide uma linha de CSV respeitando aspas. */
function dividir(linha: string): string[] {
  const out: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === SEP && !dentroDeAspas) {
      out.push(atual);
      atual = "";
    } else atual += c;
  }
  out.push(atual);
  return out;
}

export function lerCsv(texto: string): ResultadoLeitura {
  const precos: LinhaPlanilha[] = [];
  const problemas: { linha: number; motivo: string }[] = [];
  let emBranco = 0;

  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return { precos, problemas: [{ linha: 0, motivo: "Arquivo vazio." }], emBranco };

  // Descarta o cabeçalho só se ele for mesmo um cabeçalho — quem colar apenas
  // os dados não perde a primeira linha.
  /*
   * `dividir` já devolve o campo SEM as aspas que o delimitam. Havia um
   * `.replace(/^"|"$/g, "")` a mais aqui, e ele comia aspa de CONTEÚDO: a
   * polegada no fim da descrição ("Luva galvanizada 1"") voltava como
   * "Luva galvanizada 1". Não incomodava enquanto a planilha só lia id e
   * preço; passou a incomodar quando a descrição virou dado que cria material.
   */
  const primeiro = dividir(linhas[0]).map((c) => c.trim().toLowerCase());
  const inicio = primeiro[0] === "id" ? 1 : 0;

  for (let n = inicio; n < linhas.length; n++) {
    const col = dividir(linhas[n]).map((c) => c.trim());
    const numeroDaLinha = n + 1;
    const id = col[0];
    const categoria = col[1];
    const descricao = col[2];
    const unidade = col[3];

    // Sem PREÇO NOVO a linha não pede nada: nem revisão, nem material. É o
    // caso da esmagadora maioria e não é erro — inclusive o da linha de
    // exemplo que a planilha traz.
    const bruto = col[5] ?? "";
    if (!bruto.trim()) { emBranco++; continue; }

    // Id em branco só faz sentido acompanhado de descrição: é assim que se
    // acrescenta material. Sem os dois não há o que gravar.
    if (!id && !descricao) { problemas.push({ linha: numeroDaLinha, motivo: "Sem id e sem descrição." }); continue; }

    const preco = parseBR(bruto);
    if (!Number.isFinite(preco)) {
      problemas.push({ linha: numeroDaLinha, motivo: `Preço "${bruto}" não é um número.` });
      continue;
    }
    if (preco < 0) {
      problemas.push({ linha: numeroDaLinha, motivo: "Preço negativo." });
      continue;
    }
    // `dias_restantes` (col[6]) é informativo e não volta: o prazo é o mesmo
    // para todo material, e quem reinicia a contagem é a revisão do preço.
    precos.push({ id: id || undefined, preco, categoria, descricao, unidade });
  }

  return { precos, problemas, emBranco };
}
