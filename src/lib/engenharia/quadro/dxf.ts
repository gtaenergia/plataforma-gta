/**
 * Diagrama unifilar em DXF (R12, ASCII) — abre em qualquer CAD. Todos os
 * quadros em cascata a partir da origem. Unidades: milímetros de desenho.
 *
 * Textos sem acento: o DXF R12 grava na página de código do desenho, e
 * acentos viram lixo em CAD configurado de outro jeito.
 */

import { fmtNum } from "../formato";
import type { ResultadoCircuito, ResultadoQuadros } from "./motor";

export interface OpcoesDxf {
  dps: boolean;
  vazios: boolean;
  balanceamento: boolean;
}

const asc = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "");

class Dxf {
  private e: string[] = [];
  line(x1: number, y1: number, x2: number, y2: number, layer = "UNIFILAR") {
    this.e.push(`0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0`);
  }
  circle(x: number, y: number, r: number, layer = "UNIFILAR") {
    this.e.push(`0\nCIRCLE\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${r.toFixed(3)}`);
  }
  rect(x: number, y: number, w: number, h: number, layer = "UNIFILAR") {
    this.line(x, y, x + w, y, layer);
    this.line(x + w, y, x + w, y + h, layer);
    this.line(x + w, y + h, x, y + h, layer);
    this.line(x, y + h, x, y, layer);
  }
  text(x: number, y: number, h: number, s: string, alinh: "esq" | "centro" = "esq", layer = "TEXTOS") {
    const t = asc(s);
    if (alinh === "centro") this.e.push(`0\nTEXT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${h}\n1\n${t}\n72\n1\n11\n${x.toFixed(3)}\n21\n${y.toFixed(3)}\n31\n0`);
    else this.e.push(`0\nTEXT\n8\n${layer}\n10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0\n40\n${h}\n1\n${t}`);
  }
  toString(): string {
    const camadas: [string, number][] = [
      ["UNIFILAR", 7],
      ["DISJUNTORES", 1],
      ["TEXTOS", 8],
      ["CARGAS", 5],
      ["DPS", 3],
      ["BARRAMENTOS", 30],
    ];
    const tabela = camadas.map(([n, c]) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${c}\n6\nCONTINUOUS`).join("\n");
    return [
      "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC",
      `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${camadas.length}\n${tabela}\n0\nENDTAB\n0\nENDSEC`,
      `0\nSECTION\n2\nENTITIES\n${this.e.join("\n")}\n0\nENDSEC`,
      "0\nEOF\n",
    ].join("\n");
  }
}

/** Símbolo de disjuntor (contato aberto inclinado) entre y e y-12, no eixo x. */
function disjuntor(d: Dxf, x: number, y: number, r: ResultadoCircuito) {
  d.line(x, y, x, y - 3, "DISJUNTORES");
  d.line(x, y - 3, x + 3.5, y - 9.5, "DISJUNTORES");
  d.line(x - 1.2, y - 4.2, x + 1.2, y - 1.8, "DISJUNTORES");
  d.line(x, y - 9, x, y - 12, "DISJUNTORES");
  d.text(x + 5, y - 5, 1.8, `${r.In}A ${r.curva}${r.icu != null ? ` ${fmtNum(r.icu)}kA` : ""}`);
  if (r.dr) d.text(x + 5, y - 8, 1.6, `DR ${r.drSens}mA`);
}

function terra(d: Dxf, x: number, y: number) {
  d.line(x, y, x, y - 3);
  d.line(x - 3, y - 3, x + 3, y - 3);
  d.line(x - 2, y - 4, x + 2, y - 4);
  d.line(x - 1, y - 5, x + 1, y - 5);
}

export function gerarDxf(res: ResultadoQuadros, titulo: string, op: OpcoesDxf): string {
  const d = new Dxf();
  const PASSO = 28;
  const quadros = res.quadros.map((q) => ({ q, circs: q.circuitos.filter((c) => op.vazios || (!c.reserva && c.P > 0)) }));
  const larguras = quadros.map(({ circs }) => Math.max(60, circs.length * PASSO + 20));
  const total = larguras.reduce((s, w) => s + w + 25, 0);

  // Origem: transformador (dois círculos) e barramento geral.
  const xo = total / 2;
  d.circle(xo, 0, 5);
  d.circle(xo, -7, 5);
  d.text(xo + 8, -2, 2.5, `ORIGEM ${res.UL} V`);
  d.text(xo + 8, -6, 2, res.origem.ikMax != null ? `Ik = ${fmtNum(res.origem.ikMax, 2)} kA` : "Ik nao informado");
  d.line(xo, -12, xo, -20);
  d.line(0, -20, total, -20, "BARRAMENTOS");
  d.text(0, -18, 2.2, asc(titulo));

  let x = 0;
  for (let i = 0; i < quadros.length; i++) {
    const { q, circs } = quadros[i];
    const w = larguras[i];
    const xc = x + w / 2;
    d.line(xc, -20, xc, -26);
    disjuntor(d, xc, -26, q.geral);
    d.line(xc, -38, xc, -58);
    d.text(xc + 2, -44, 1.8, `${q.geral.condPorFase > 1 ? `${q.geral.condPorFase}x` : ""}${fmtNum(q.geral.secao)}mm2 ${q.geral.material} ${q.geral.isolacao}`);
    d.text(xc + 2, -47, 1.6, `${q.geral.comprimento != null ? `${fmtNum(q.geral.comprimento)} m` : ""} Iz ${fmtNum(q.geral.iz, 0)}A dV ${fmtNum(q.geral.dvTrecho, 2)}%`);
    // barramento do quadro
    d.line(x + 5, -58, x + w - 5, -58, "BARRAMENTOS");
    d.line(x + 5, -59, x + w - 5, -59, "BARRAMENTOS");
    d.text(x + 5, -55.5, 2.5, q.nome);
    d.text(x + w - 5 - 30, -55.5, 1.6, `${fmtNum(q.potencias.Sdem / 1000, 2)} kVA`);
    if (op.dps) {
      const xd = x + w - 8;
      d.line(xd, -59, xd, -64, "DPS");
      d.rect(xd - 2.5, -70, 5, 6, "DPS");
      d.line(xd, -69, xd, -65, "DPS");
      d.line(xd - 1, -66, xd, -65, "DPS");
      d.line(xd + 1, -66, xd, -65, "DPS");
      d.line(xd, -70, xd, -72, "DPS");
      terra(d, xd, -72);
      d.text(xd - 14, -68, 1.6, "DPS", "esq", "DPS");
    }
    circs.forEach((r, k) => {
      const xx = x + 12 + k * PASSO;
      d.line(xx, -59, xx, -64);
      disjuntor(d, xx, -64, r);
      d.line(xx, -76, xx, -100);
      d.text(xx + 1.5, -82, 1.5, `${r.condPorFase > 1 ? `${r.condPorFase}x` : ""}${fmtNum(r.secao)}mm2`);
      d.text(xx + 1.5, -85, 1.5, `${r.comprimento != null ? `${fmtNum(r.comprimento)}m` : ""}`);
      d.text(xx + 1.5, -88, 1.5, `dV ${fmtNum(r.dvAcumulada, 2)}%`);
      d.rect(xx - 9, -110, 18, 10, "CARGAS");
      d.text(xx, -104, 2, r.tag, "centro", "CARGAS");
      d.text(xx, -108, 1.5, r.reserva ? "RESERVA" : `${fmtNum(r.P, 0)} W`, "centro", "CARGAS");
      if (op.balanceamento) d.text(xx, -113, 1.6, `Fase ${r.fase}`, "centro");
      if (r.descricao) d.text(xx, -116.5, 1.3, r.descricao.slice(0, 18), "centro");
    });
    if (op.balanceamento) {
      d.text(x + 5, -122, 1.6, `A: ${fmtNum(q.fases.A.I, 1)}A  B: ${fmtNum(q.fases.B.I, 1)}A  C: ${fmtNum(q.fases.C.I, 1)}A  dif ${fmtNum(q.fases.desequilibrio, 1)}%`);
    }
    x += w + 25;
  }
  return d.toString();
}
