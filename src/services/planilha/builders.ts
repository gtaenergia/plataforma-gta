import ExcelJS from "exceljs";
import { Aba, novaPlanilha, cabecalho, num, BRL } from "./core";
import { planilhaCarregador } from "./carregador";
import { planilhaQgbt } from "./qgbt";
import { planilhaExecSe } from "./execucao-subestacao";
import { planilhaRedeMt } from "./rede-mt";
import { planilhaSpda } from "./spda";
import { planilhaProjetoBt } from "./projeto-bt";
import { planilhaSubestacao } from "./subestacao";
import { planilhaSolar } from "./solar";
import { planilhaMaoDeObra } from "./mao-de-obra";

/**
 * Registro de builders de planilha por serviço. Cada builder monta um .xlsx com
 * FÓRMULAS de Excel (ver ./core e os arquivos por serviço). Serviços sem builder
 * próprio caem no genérico (itens + total).
 */

/** Fallback genérico: cabeçalho + itens + total. */
export function planilhaGenerica(d: { cliente?: string; referencia?: string; servico?: string; itens?: { descricao: string; valor: number }[]; total?: number }): ExcelJS.Workbook {
  const wb = novaPlanilha();
  const a = new Aba(wb, "Proposta");
  cabecalho(a, `${d.servico ?? "Serviço"} — Resumo`, { cliente: d.cliente, referencia: d.referencia });
  a.secao("Itens da proposta");
  const itens = d.itens ?? [];
  const linhas = itens.map((it) => [it.descricao || "—", "", "", "", num(it.valor)]);
  const t = a.tabela(["Descrição", "", "", "", "Valor"], linhas, [undefined, undefined, undefined, undefined, BRL]);
  a.formula("Total", itens.length ? `SUM(E${t.primeira}:E${t.ultima})` : "0", num(d.total), { fmt: BRL, destaque: true });
  return wb;
}

/** key → builder. Cada valor recebe o `data` posto pelo configurador. */
export const BUILDERS: Record<string, (d: Record<string, unknown>) => ExcelJS.Workbook> = {
  carregador: (d) => planilhaCarregador(d as Parameters<typeof planilhaCarregador>[0]),
  qgbt: (d) => planilhaQgbt(d as Parameters<typeof planilhaQgbt>[0]),
  "execucao-subestacao": (d) => planilhaExecSe(d as Parameters<typeof planilhaExecSe>[0]),
  "rede-mt": (d) => planilhaRedeMt(d as Parameters<typeof planilhaRedeMt>[0]),
  spda: (d) => planilhaSpda(d as Parameters<typeof planilhaSpda>[0]),
  "projeto-bt": (d) => planilhaProjetoBt(d as Parameters<typeof planilhaProjetoBt>[0]),
  "projeto-subestacao": (d) => planilhaSubestacao(d as Parameters<typeof planilhaSubestacao>[0]),
  solar: (d) => planilhaSolar(d as Parameters<typeof planilhaSolar>[0]),
  // Único que NÃO vem de um configurador de proposta: é a calculadora de mão
  // de obra, em Propostas, cuja entrega É a planilha.
  "mao-de-obra": (d) => planilhaMaoDeObra(d as Parameters<typeof planilhaMaoDeObra>[0]),
};

export function construirPlanilha(serviceKey: string, data: Record<string, unknown>): ExcelJS.Workbook {
  const b = BUILDERS[serviceKey];
  return b ? b(data) : planilhaGenerica(data as Parameters<typeof planilhaGenerica>[0]);
}
