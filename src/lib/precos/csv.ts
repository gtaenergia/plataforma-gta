import type { MaterialPreco } from "./catalogo";

/**
 * Planilha de revisão de preços — ida e volta.
 *
 * A plataforma gera o arquivo já preenchido com o que está valendo, e a pessoa
 * só digita a coluna "PREÇO NOVO". Quem manda é o `id`, não a linha nem a
 * descrição: a planilha pode ser reordenada, filtrada ou ter linhas apagadas
 * que a importação continua acertando o item.
 *
 * Ponto e vírgula porque o Excel em pt-BR usa vírgula como decimal; BOM para
 * ele reconhecer os acentos como UTF-8.
 */

const SEP = ";";
const BOM = "﻿";

const escapar = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const CABECALHO = ["id", "categoria", "descricao", "unidade", "preco_atual", "PRECO_NOVO"];

export function gerarCsv(itens: MaterialPreco[]): string {
  const linhas = itens.map((i) =>
    [i.id, i.categoria, i.descricao, i.unidade, brl(i.preco), ""].map(escapar).join(SEP),
  );
  return BOM + [CABECALHO.map(escapar).join(SEP), ...linhas].join("\r\n") + "\r\n";
}

export interface ResultadoLeitura {
  precos: { id: string; preco: number }[];
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
  const precos: { id: string; preco: number }[] = [];
  const problemas: { linha: number; motivo: string }[] = [];
  let emBranco = 0;

  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length === 0) return { precos, problemas: [{ linha: 0, motivo: "Arquivo vazio." }], emBranco };

  // Descarta o cabeçalho só se ele for mesmo um cabeçalho — quem colar apenas
  // os dados não perde a primeira linha.
  const primeiro = dividir(linhas[0]).map((c) => c.replace(/^"|"$/g, "").trim().toLowerCase());
  const inicio = primeiro[0] === "id" ? 1 : 0;

  for (let n = inicio; n < linhas.length; n++) {
    const col = dividir(linhas[n]).map((c) => c.replace(/^"|"$/g, "").trim());
    const numeroDaLinha = n + 1;
    const id = col[0];
    if (!id) { problemas.push({ linha: numeroDaLinha, motivo: "Sem id." }); continue; }

    const bruto = col[5] ?? "";
    if (!bruto.trim()) { emBranco++; continue; }

    const preco = parseBR(bruto);
    if (!Number.isFinite(preco)) {
      problemas.push({ linha: numeroDaLinha, motivo: `Preço "${bruto}" não é um número.` });
      continue;
    }
    if (preco < 0) {
      problemas.push({ linha: numeroDaLinha, motivo: "Preço negativo." });
      continue;
    }
    precos.push({ id, preco });
  }

  return { precos, problemas, emBranco };
}
