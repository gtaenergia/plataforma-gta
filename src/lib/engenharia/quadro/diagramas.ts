/**
 * Diagramas do quadro em SVG (tela e PDF A3):
 *  - painéis: da origem (rede, Ik) ao disjuntor geral, ao barramento de cada
 *    quadro e aos circuitos, com disjuntor, cabo, Iz, queda, carga e Ik;
 *  - impedâncias: Z_Q da fonte + R+jX de cada trecho até o fim do circuito,
 *    nos três cenários (máximo, mínimo e laço Zs).
 */

import { fmtNum } from "../formato";
import { modulo, type ResultadoCircuito, type ResultadoQuadros } from "./motor";

const F = "Roboto, Arial, Helvetica, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const txt = (x: number, y: number, s: string, o: { size?: number; cor?: string; anchor?: "start" | "middle" | "end"; peso?: number } = {}) =>
  `<text x="${x}" y="${y}" font-family="${F}" font-size="${o.size ?? 9}" fill="${o.cor ?? "#1F2937"}" text-anchor="${o.anchor ?? "middle"}"${o.peso ? ` font-weight="${o.peso}"` : ""}>${esc(s)}</text>`;

const falhou = (r: ResultadoCircuito) => Object.values(r.verif).includes("falha");

function disjuntor(x: number, y: number, r: ResultadoCircuito): string {
  const cor = r.verif.icu === "falha" || r.verif.sobrecarga === "falha" ? "#C62828" : "#1A2F4A";
  return `<rect x="${x - 22}" y="${y}" width="44" height="26" rx="3" fill="#FFFFFF" stroke="${cor}" stroke-width="1.4"/>
    <line x1="${x - 12}" y1="${y + 20}" x2="${x + 10}" y2="${y + 6}" stroke="${cor}" stroke-width="1.6"/>
    ${txt(x + 26, y + 11, `${r.In} A ${r.curva}`, { size: 8.5, anchor: "start", peso: 600 })}
    ${txt(x + 26, y + 22, r.icu != null ? `Icu ${fmtNum(r.icu)} kA${r.dr ? ` · DR ${r.drSens} mA` : ""}` : r.dr ? `DR ${r.drSens} mA` : "", { size: 7.5, anchor: "start", cor: "#64748B" })}`;
}

export function svgPaineis(res: ResultadoQuadros): { svg: string; largura: number; altura: number } {
  const COL = 140;
  const larguras = res.quadros.map((q) => Math.max(260, (q.circuitos.length || 1) * COL + 40));
  const largura = Math.max(520, larguras.reduce((s, w) => s + w + 30, 30));
  const altura = 640;
  const partes: string[] = [];
  const cx0 = largura / 2;

  // Origem
  partes.push(`<rect x="${cx0 - 90}" y="14" width="180" height="46" rx="6" fill="#1A2F4A"/>`);
  partes.push(txt(cx0, 33, "ORIGEM — REDE / TRAFO", { size: 9, cor: "#FFFFFF", peso: 700 }));
  partes.push(txt(cx0, 49, res.origem.ikMax != null ? `Ik = ${fmtNum(res.origem.ikMax, 2)} kA · ${res.UL} V` : `Ik não informado · ${res.UL} V`, { size: 8.5, cor: "#C9D3E6" }));
  partes.push(`<line x1="${cx0}" y1="60" x2="${cx0}" y2="84" stroke="#1A2F4A" stroke-width="2"/>`);
  let x = 30;
  const centros = larguras.map((w) => {
    const c = x + w / 2;
    x += w + 30;
    return c;
  });
  partes.push(`<line x1="${Math.min(centros[0] ?? cx0, cx0)}" y1="84" x2="${Math.max(centros[centros.length - 1] ?? cx0, cx0)}" y2="84" stroke="#F26522" stroke-width="4"/>`);

  res.quadros.forEach((q, i) => {
    const cx = centros[i];
    const w = larguras[i];
    const g = q.geral;
    partes.push(`<line x1="${cx}" y1="84" x2="${cx}" y2="104" stroke="#1A2F4A" stroke-width="1.6"/>`);
    partes.push(disjuntor(cx, 104, g));
    partes.push(`<line x1="${cx}" y1="130" x2="${cx}" y2="196" stroke="${falhou(g) ? "#C62828" : "#1A2F4A"}" stroke-width="1.6"/>`);
    partes.push(txt(cx + 8, 148, `${g.condPorFase > 1 ? `${g.condPorFase}×` : ""}${fmtNum(g.secao)} mm² ${g.material} ${g.isolacao}`, { size: 8, anchor: "start" }));
    partes.push(txt(cx + 8, 159, `${g.comprimento != null ? `${fmtNum(g.comprimento)} m · ` : ""}Iz ${fmtNum(g.iz, 0)} A`, { size: 8, anchor: "start", cor: "#475569" }));
    partes.push(txt(cx + 8, 170, `ΔV ${fmtNum(g.dvTrecho, 2)}% · Ib ${fmtNum(g.Ib, 1)} A`, { size: 8, anchor: "start", cor: g.verif.queda === "falha" ? "#C62828" : "#475569" }));
    // Barramento do quadro
    const x0 = cx - w / 2 + 20;
    const x1 = cx + w / 2 - 20;
    partes.push(`<rect x="${x0 - 8}" y="190" width="${x1 - x0 + 16}" height="40" rx="4" fill="#F1F4F8" stroke="${falhou(g) || q.circuitos.some(falhou) ? "#C62828" : "#5B4FCF"}" stroke-width="1.4"/>`);
    partes.push(txt(x0, 205, q.nome, { size: 10, anchor: "start", peso: 700, cor: "#1A2F4A" }));
    partes.push(txt(x1, 205, `${fmtNum(q.potencias.Sdem / 1000, 2)} kVA demandados`, { size: 8, anchor: "end", cor: "#475569" }));
    partes.push(`<line x1="${x0}" y1="216" x2="${x1}" y2="216" stroke="#1A2F4A" stroke-width="3"/>`);
    partes.push(txt(x1, 226, q.ikBarramento != null ? `Ik barramento ${fmtNum(q.ikBarramento, 2)} kA` : "", { size: 7.5, anchor: "end", cor: "#64748B" }));

    q.circuitos.forEach((r, k) => {
      const n = q.circuitos.length;
      const xc = n === 1 ? cx : x0 + 30 + ((x1 - x0 - 60) * k) / Math.max(1, n - 1);
      const vermelho = falhou(r);
      const cor = vermelho ? "#C62828" : "#1A2F4A";
      partes.push(`<line x1="${xc}" y1="216" x2="${xc}" y2="262" stroke="${cor}" stroke-width="1.4"/>`);
      partes.push(disjuntor(xc, 262, r));
      partes.push(`<line x1="${xc}" y1="288" x2="${xc}" y2="470" stroke="${cor}" stroke-width="1.4"${r.reserva ? ' stroke-dasharray="4 3"' : ""}/>`);
      const linhas = [
        `${r.condPorFase > 1 ? `${r.condPorFase}×` : ""}${fmtNum(r.secao)} mm² ${r.material}`,
        `${r.comprimento != null ? `${fmtNum(r.comprimento)} m` : "— m"} · Iz ${fmtNum(r.iz, 0)} A`,
        `ΔV ${fmtNum(r.dvAcumulada, 2)}%`,
        `Ik mín ${r.ikMinFim != null ? fmtNum(r.ikMinFim * 1000, 0) : "—"} A`,
      ];
      linhas.forEach((l, j) => partes.push(txt(xc + 5, 320 + j * 12, l, { size: 7.5, anchor: "start", cor: j === 2 && r.verif.queda === "falha" ? "#C62828" : j === 3 && r.verif.magnetica === "falha" ? "#C62828" : "#334155" })));
      // Carga
      partes.push(`<rect x="${xc - 54}" y="470" width="108" height="58" rx="5" fill="#FFFFFF" stroke="${cor}" stroke-width="${vermelho ? 2 : 1.2}"/>`);
      partes.push(txt(xc, 486, `${r.tag} · ${r.fase}`, { size: 9, peso: 700, cor }));
      partes.push(txt(xc, 499, (r.descricao || (r.reserva ? "Reserva" : "")).slice(0, 22), { size: 7.5, cor: "#475569" }));
      partes.push(txt(xc, 512, `${fmtNum(r.P, 0)} W · ${fmtNum(r.Ib, 1)} A`, { size: 8 }));
      partes.push(txt(xc, 523, r.esquema, { size: 7, cor: "#64748B" }));
    });
  });

  partes.push(txt(30, altura - 40, "Borda vermelha: critério não atendido (sobrecarga, queda de tensão, curto-circuito ou choque).", { size: 8.5, anchor: "start", cor: "#64748B" }));
  partes.push(txt(30, altura - 26, "Queda indicada nos circuitos: acumulada desde a origem. Ik mín: falta no fim do circuito (c = 0,95, condutores a quente).", { size: 8.5, anchor: "start", cor: "#64748B" }));

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}"><rect width="${largura}" height="${altura}" fill="#FFFFFF"/>${partes.join("")}</svg>`,
    largura,
    altura,
  };
}

const z = (r: number, x: number) => `${fmtNum(r * 1000, 2)} + j${fmtNum(x * 1000, 2)} mΩ`;

export function svgImpedancias(res: ResultadoQuadros): { svg: string; largura: number; altura: number } {
  const largura = 1060;
  const linhaH = 24;
  const linhas = res.quadros.reduce((s, q) => s + q.circuitos.length + 4, 0);
  const altura = 110 + linhas * linhaH + 40;
  const p: string[] = [];
  const zq = res.origem.zMax;
  p.push(txt(20, 26, "Diagrama de impedâncias — da fonte (Z_Q) ao fim de cada circuito", { size: 13, anchor: "start", peso: 700, cor: "#1A2F4A" }));
  p.push(
    txt(
      20,
      46,
      `Z_Q = ${z(zq.r, zq.x)}  (|Z_Q| = ${fmtNum(modulo(zq) * 1000, 2)} mΩ, Ik origem ${res.origem.ikMax != null ? `${fmtNum(res.origem.ikMax, 2)} kA` : "—"})  ·  máximo: c = 1,05, 20 °C  ·  mínimo e Zs: c = 0,95, temperatura de serviço`,
      { size: 9, anchor: "start", cor: "#475569" },
    ),
  );
  const cols = [20, 120, 330, 540, 760, 860, 960];
  const cab = ["Trecho", "Alimentador R + jX", "Circuito R + jX (a quente)", "Σ Z máx no fim (20 °C)", "Ik máx", "Ik mín", "Zs (laço PE)"];
  let y = 80;
  cab.forEach((c, i) => p.push(txt(cols[i], y, c.toUpperCase(), { size: 8, anchor: "start", cor: "#64748B", peso: 600 })));
  p.push(`<line x1="20" y1="${y + 6}" x2="${largura - 20}" y2="${y + 6}" stroke="#1A2F4A" stroke-width="1.2"/>`);
  y += 24;
  for (const q of res.quadros) {
    p.push(`<rect x="16" y="${y - 15}" width="${largura - 32}" height="20" fill="#F1F4F8"/>`);
    p.push(txt(20, y, `${q.nome} — alimentador ${fmtNum(q.geral.secao)} mm², ${q.geral.comprimento != null ? `${fmtNum(q.geral.comprimento)} m` : "sem comprimento"}`, { size: 9, anchor: "start", peso: 700 }));
    y += linhaH;
    p.push(txt(cols[0], y, "Barramento", { size: 8.5, anchor: "start", cor: "#475569" }));
    p.push(txt(cols[1], y, z(q.geral.R, q.geral.X), { size: 8.5, anchor: "start" }));
    p.push(txt(cols[4], y, q.ikBarramento != null ? `${fmtNum(q.ikBarramento, 2)} kA` : "—", { size: 8.5, anchor: "start" }));
    p.push(`<line x1="20" y1="${y + 7}" x2="${largura - 20}" y2="${y + 7}" stroke="#E2E8F0" stroke-width="0.6"/>`);
    y += linhaH;
    for (const r of q.circuitos) {
      const vermelho = r.verif.magnetica === "falha" || r.verif.choque === "falha";
      p.push(txt(cols[0], y, `${r.tag} ${r.descricao ? `— ${r.descricao.slice(0, 14)}` : ""}`, { size: 8.5, anchor: "start" }));
      p.push(txt(cols[1], y, "↑ mesmo", { size: 8.5, anchor: "start", cor: "#94A3B8" }));
      p.push(txt(cols[2], y, z(r.R, r.X), { size: 8.5, anchor: "start" }));
      p.push(txt(cols[3], y, r.zFimMax ? z(r.zFimMax.r, r.zFimMax.x) : "—", { size: 8.5, anchor: "start" }));
      p.push(txt(cols[4], y, r.ikMaxFim != null ? `${fmtNum(r.ikMaxFim, 2)} kA` : "—", { size: 8.5, anchor: "start" }));
      p.push(txt(cols[5], y, r.ikMinFim != null ? `${fmtNum(r.ikMinFim * 1000, 0)} A` : "—", { size: 8.5, anchor: "start", cor: r.verif.magnetica === "falha" ? "#C62828" : "#1F2937" }));
      p.push(txt(cols[6], y, r.zs != null ? `${fmtNum(r.zs * 1000, 1)} mΩ` : "—", { size: 8.5, anchor: "start", cor: vermelho ? "#C62828" : "#1F2937" }));
      p.push(`<line x1="20" y1="${y + 7}" x2="${largura - 20}" y2="${y + 7}" stroke="#E2E8F0" stroke-width="0.6"/>`);
      y += linhaH;
    }
    y += linhaH;
  }
  p.push(txt(20, y + 4, "Ik máx define a capacidade de interrupção (Icu); Ik mín define a atuação magnética; Zs verifica a proteção contra choques (Zs × Ia ≤ U0).", { size: 8.5, anchor: "start", cor: "#64748B" }));
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}"><rect width="${largura}" height="${altura}" fill="#FFFFFF"/>${p.join("")}</svg>`,
    largura,
    altura,
  };
}
