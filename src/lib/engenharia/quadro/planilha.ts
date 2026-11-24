import ExcelJS from "exceljs";
import { calcularQuadros, type ResultadoCircuito } from "./motor";
import type { DadosQuadro } from "./tipos";
import { nomeGrupo } from "./tabelas";

/**
 * Quadro de circuitos em Excel: uma aba por quadro, com as colunas da tabela
 * (cargas, cabos, proteções e resultados), mais uma aba de resumo.
 */

const COLUNAS: { titulo: string; largura: number; v: (r: ResultadoCircuito) => string | number | null; fmt?: string }[] = [
  { titulo: "Circuito", largura: 10, v: (r) => r.tag },
  { titulo: "Descrição", largura: 28, v: (r) => r.descricao },
  { titulo: "Grupo", largura: 8, v: (r) => r.grupo },
  { titulo: "Tipo", largura: 11, v: (r) => r.esquema },
  { titulo: "Fase", largura: 7, v: (r) => r.fase },
  { titulo: "P (W)", largura: 10, v: (r) => r.P, fmt: "#,##0" },
  { titulo: "Carga especial (W)", largura: 12, v: (r) => r.especial, fmt: "#,##0" },
  { titulo: "S (VA)", largura: 10, v: (r) => r.S, fmt: "#,##0" },
  { titulo: "Q (var)", largura: 10, v: (r) => r.Q, fmt: "#,##0" },
  { titulo: "FP", largura: 6, v: (r) => r.fp, fmt: "0.00" },
  { titulo: "THD-I (%)", largura: 8, v: (r) => r.thd, fmt: "0" },
  { titulo: "Ib (A)", largura: 8, v: (r) => r.Ib, fmt: "0.0" },
  { titulo: "In (A)", largura: 7, v: (r) => r.In },
  { titulo: "Curva", largura: 6, v: (r) => r.curva },
  { titulo: "Im (A)", largura: 8, v: (r) => r.Im, fmt: "0" },
  { titulo: "Icu (kA)", largura: 8, v: (r) => r.icu, fmt: "0.0" },
  { titulo: "DR", largura: 12, v: (r) => (r.dr ? `${r.drIn} A / ${r.drSens} mA` : "—") },
  { titulo: "Material", largura: 8, v: (r) => r.material },
  { titulo: "Isolação", largura: 8, v: (r) => r.isolacao },
  { titulo: "Tensão isol.", largura: 10, v: (r) => r.tensaoIsolacao },
  { titulo: "Classe", largura: 6, v: (r) => r.classe },
  { titulo: "Método", largura: 9, v: (r) => `${r.metodo} (${r.metodoRef})` },
  { titulo: "Configuração", largura: 18, v: (r) => r.config },
  { titulo: "Cond./fase", largura: 8, v: (r) => r.condPorFase },
  { titulo: "Seção fase (mm²)", largura: 10, v: (r) => r.secao },
  { titulo: "Seção N (mm²)", largura: 10, v: (r) => r.secaoN },
  { titulo: "Seção PE (mm²)", largura: 10, v: (r) => r.secaoPE },
  { titulo: "k1", largura: 6, v: (r) => r.k1, fmt: "0.00" },
  { titulo: "k2", largura: 6, v: (r) => r.k2, fmt: "0.00" },
  { titulo: "Iz tab. (A)", largura: 9, v: (r) => r.izTab, fmt: "0.0" },
  { titulo: "Iz corr. (A)", largura: 9, v: (r) => r.iz, fmt: "0.0" },
  { titulo: "R (Ω/km)", largura: 9, v: (r) => r.rKm, fmt: "0.0000" },
  { titulo: "X (Ω/km)", largura: 9, v: (r) => r.xKm, fmt: "0.000" },
  { titulo: "Comprimento (m)", largura: 10, v: (r) => r.comprimento },
  { titulo: "ΔV máx (%)", largura: 8, v: (r) => r.limiteTrecho, fmt: "0.0" },
  { titulo: "ΔV trecho (%)", largura: 9, v: (r) => r.dvTrecho, fmt: "0.00" },
  { titulo: "ΔV acum. (%)", largura: 9, v: (r) => r.dvAcumulada, fmt: "0.00" },
  { titulo: "Ik início (kA)", largura: 9, v: (r) => r.ikInicio, fmt: "0.00" },
  { titulo: "Ik máx fim (kA)", largura: 9, v: (r) => r.ikMaxFim, fmt: "0.00" },
  { titulo: "Ik mín fim (A)", largura: 9, v: (r) => (r.ikMinFim != null ? r.ikMinFim * 1000 : null), fmt: "0" },
  { titulo: "I²t (A²s)", largura: 11, v: (r) => r.i2t, fmt: "#,##0" },
  { titulo: "k²S² (A²s)", largura: 12, v: (r) => r.k2s2, fmt: "#,##0" },
  { titulo: "Zs (Ω)", largura: 8, v: (r) => r.zs, fmt: "0.000" },
  { titulo: "Verificações", largura: 14, v: (r) => (Object.values(r.verif).includes("falha") ? "Não atende" : Object.values(r.verif).includes("sem-dados") ? "Faltam dados" : "OK") },
];

export async function planilhaQuadro(dados: DadosQuadro, projeto: string): Promise<Buffer> {
  const res = calcularQuadros(dados);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Plataforma GTA";
  const navy = "FF1A2F4A";

  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [{ width: 28 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
  resumo.addRow([`Quadro de cargas — ${projeto}`]).font = { bold: true, size: 14, color: { argb: navy } };
  resumo.addRow([`${dados.config.tensao} V · ${dados.config.esquema} · Ik origem ${res.origem.ikMax != null ? `${res.origem.ikMax.toFixed(2)} kA` : "—"} · queda máx. ${res.limiteGlobal}%`]);
  resumo.addRow([]);
  const cab = resumo.addRow(["Quadro", "P instalada (kW)", "P demandada (kW)", "S demandada (kVA)", "Disjuntor geral"]);
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
  });
  for (const q of res.quadros) {
    resumo.addRow([q.nome, q.potencias.Pinst / 1000, q.potencias.Pdem / 1000, q.potencias.Sdem / 1000, `${q.geral.In} A ${q.geral.curva}`]).eachCell((c, i) => {
      if (i > 1 && i < 5) c.numFmt = "0.00";
    });
  }

  for (const q of res.quadros) {
    const nome = q.nome.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Quadro";
    const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
    ws.columns = COLUNAS.map((c) => ({ width: c.largura }));
    ws.addRow([`${q.nome} — ${projeto}`]).font = { bold: true, size: 13, color: { argb: navy } };
    ws.addRow([`Demanda ${(q.potencias.Sdem / 1000).toFixed(2)} kVA · Ik barramento ${q.ikBarramento != null ? `${q.ikBarramento.toFixed(2)} kA` : "—"} · fases A/B/C: ${q.fases.A.I.toFixed(1)} / ${q.fases.B.I.toFixed(1)} / ${q.fases.C.I.toFixed(1)} A`]);
    const h = ws.addRow(COLUNAS.map((c) => c.titulo));
    h.height = 30;
    h.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } };
      c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    });
    [q.geral, ...q.circuitos].forEach((r, i) => {
      const linha = ws.addRow(COLUNAS.map((c) => c.v(r) ?? ""));
      linha.eachCell((cel, k) => {
        const f = COLUNAS[k - 1]?.fmt;
        if (f) cel.numFmt = f;
        cel.font = { size: 9, bold: i === 0 };
        if (i === 0) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1FB" } };
        else if (i % 2 === 0) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFC" } };
      });
    });
    ws.addRow([]);
    ws.addRow(["Grupo", "Descrição", "Instalada (W)", "FD (%)", "Demandada (W)"]).font = { bold: true };
    for (const g of q.grupos) ws.addRow([g.id, nomeGrupo(g.id), g.Pinst, g.fd, g.Pdem]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
