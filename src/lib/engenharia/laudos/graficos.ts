/**
 * Gráficos dos laudos em SVG — o PDF os embute como vetor e o Word recebe a
 * mesma imagem rasterizada, então os dois saem iguais.
 */

const FONTE = "Roboto, Arial, Helvetica, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Medidor {
  sobrescrito: string;
  titulo: string;
  valor: string;
  ok: boolean;
  limite: string;
  /** Posição 0..1 na régua (0,5 = limite tolerável). */
  posicao: number;
  posicaoSem?: number | null;
  rodape?: string;
}

/** Posição logarítmica: duas décadas para cada lado do limite. */
export function posicaoLog(valor: number, limite: number): number {
  if (!(valor > 0) || !(limite > 0)) return 0.03;
  const p = 0.5 + Math.log10(valor / limite) / 4;
  return Math.min(0.97, Math.max(0.03, p));
}

export function svgMedidores(itens: Medidor[], largura = 480): { svg: string; altura: number } {
  const gap = 12;
  const n = Math.max(1, itens.length);
  const w = (largura - gap * (n - 1)) / n;
  const h = 150;
  const partes = itens.map((m, i) => {
    const x0 = i * (w + gap);
    const cor = m.ok ? "#1E8A4C" : "#C62828";
    const bx = x0 + 16;
    const bw = w - 32;
    const by = 98;
    const px = bx + bw * m.posicao;
    const ps = m.posicaoSem != null ? bx + bw * m.posicaoSem : null;
    return `
      <rect x="${x0 + 0.5}" y="0.5" width="${w - 1}" height="${h - 1}" fill="#FFFFFF" stroke="#D8DEE8"/>
      <rect x="${x0}" y="0" width="4" height="${h}" fill="${cor}"/>
      <text x="${x0 + 16}" y="20" font-size="7.5" fill="#64748B" letter-spacing="1" font-family="${FONTE}">${esc(m.sobrescrito.toUpperCase())}</text>
      <text x="${x0 + 16}" y="35" font-size="10" fill="#1A2F4A" font-family="${FONTE}">${esc(m.titulo)}</text>
      <text x="${x0 + 16}" y="62" font-size="19" fill="${cor}" font-family="${FONTE}">${esc(m.valor)}</text>
      <text x="${x0 + 16}" y="78" font-size="8" fill="#64748B" font-family="${FONTE}">${esc(m.limite)}</text>
      <rect x="${bx}" y="${by}" width="${bw / 2}" height="8" rx="4" fill="#CDEBD8"/>
      <rect x="${bx + bw / 2}" y="${by}" width="${bw / 2}" height="8" rx="4" fill="#F6D0D0"/>
      <rect x="${bx + bw / 2 - 1}" y="${by - 5}" width="2" height="18" fill="#1A2F4A"/>
      ${ps != null ? `<circle cx="${ps}" cy="${by + 4}" r="6" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.2" stroke-dasharray="2 2"/>` : ""}
      <circle cx="${px}" cy="${by + 4}" r="6.5" fill="#1A2F4A" stroke="#FFFFFF" stroke-width="1.5"/>
      <text x="${bx}" y="${by + 22}" font-size="7" fill="#64748B" font-family="${FONTE}">tolerável</text>
      <text x="${bx + bw}" y="${by + 22}" font-size="7" fill="#64748B" text-anchor="end" font-family="${FONTE}">acima</text>
      ${m.rodape ? `<text x="${x0 + 16}" y="${h - 12}" font-size="8" fill="#334155" font-family="${FONTE}">${esc(m.rodape)}</text>` : ""}`;
  });
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${h}" viewBox="0 0 ${largura} ${h}">${partes.join("")}</svg>`,
    altura: h,
  };
}

export interface Segmento {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Barra horizontal dividida pelos componentes de um risco, com legenda. */
export function svgBarraEmpilhada(opts: {
  rotulo: string;
  segmentos: Segmento[];
  status: { texto: string; ok: boolean };
  legenda: { rotulo: string; cor: string; desc: string }[];
  /** Fração da barra ocupada pelo total (o tolerável fica no fim). */
  escala?: number;
  largura?: number;
}): { svg: string; altura: number } {
  const largura = opts.largura ?? 480;
  const xb = 34;
  const wb = largura - xb - 70;
  const total = opts.segmentos.reduce((s, x) => s + x.valor, 0);
  const cheio = Math.min(1, Math.max(0.05, opts.escala ?? 1)) * wb;
  let x = xb;
  const barras: string[] = [];
  for (const sg of opts.segmentos) {
    if (!(sg.valor > 0) || !(total > 0)) continue;
    const w = (sg.valor / total) * cheio;
    barras.push(`<rect x="${x}" y="6" width="${Math.max(0.8, w)}" height="18" fill="${sg.cor}"/>`);
    const pct = Math.round((sg.valor / total) * 100);
    if (w > 46) barras.push(`<text x="${x + 4}" y="18.5" font-size="7.5" fill="#FFFFFF" font-family="${FONTE}">${esc(sg.rotulo)} ${pct}%</text>`);
    x += w;
  }
  const corStatus = opts.status.ok ? "#1E8A4C" : "#C62828";
  // Legenda em linhas que caibam na largura.
  const leg: string[] = [];
  let lx = 0;
  let ly = 44;
  for (const l of opts.legenda) {
    const texto = `${l.rotulo} ${l.desc}`;
    const w = 14 + texto.length * 4.1;
    if (lx + w > largura) {
      lx = 0;
      ly += 13;
    }
    leg.push(`<rect x="${lx}" y="${ly - 7}" width="7" height="7" fill="${l.cor}"/><text x="${lx + 10}" y="${ly}" font-size="7.5" fill="#334155" font-family="${FONTE}">${esc(texto)}</text>`);
    lx += w + 10;
  }
  const altura = ly + 8;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">
      <text x="0" y="19" font-size="10" fill="#1A2F4A" font-family="${FONTE}">${esc(opts.rotulo)}</text>
      <rect x="${xb}" y="6" width="${wb}" height="18" fill="#F1F4F8"/>
      ${barras.join("")}
      <text x="${largura}" y="19" font-size="9" fill="${corStatus}" text-anchor="end" font-family="${FONTE}">${esc(opts.status.texto)}</text>
      ${leg.join("")}
    </svg>`,
    altura,
  };
}

export const CORES_COMPONENTE: Record<string, string> = {
  RA: "#7FA7D9",
  RB: "#2E6DB4",
  RC: "#8E7CC3",
  RM: "#B4A7E0",
  RU: "#2A9D8F",
  RV: "#E9A23B",
  RW: "#D1495B",
  RZ: "#F28C8C",
};
