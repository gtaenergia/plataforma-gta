/**
 * Laudo → PDF (pdfmake, no navegador). Roboto é a fonte embutida do pdfmake —
 * a mesma do laudo de referência — e cobre os sobrescritos de "×10⁻⁵".
 */

import { COR, textoPlano, type Bloco, type Celula, type Laudo, type Texto, type Tom } from "./modelo";

type No = Record<string, unknown> | string | No[];

const h = (c: string) => `#${c}`;
const A4 = { w: 595.28, h: 841.89 };
const MARGEM = { l: 57, t: 80, r: 57, b: 58 };

const TOM: Record<Tom, { fundo: string; cor: string; borda: string }> = {
  ok: { fundo: COR.verdeFundo, cor: COR.verde, borda: COR.verde },
  falha: { fundo: COR.vermelhoFundo, cor: COR.vermelho, borda: COR.vermelho },
  info: { fundo: COR.infoFundo, cor: COR.azul, borda: COR.azul },
  alerta: { fundo: COR.ambarFundo, cor: COR.ambar, borda: COR.ambar },
  neutro: { fundo: COR.cinzaClaro, cor: COR.cinza, borda: COR.borda },
};

function texto(t: Texto, base: Record<string, unknown> = {}): Record<string, unknown> {
  if (typeof t === "string") return { text: t, ...base };
  return {
    ...base,
    text: t.map((x) => ({
      text: x.t,
      ...(x.b ? { bold: true } : {}),
      ...(x.i ? { italics: true } : {}),
      ...(x.cor ? { color: h(x.cor) } : {}),
      ...(x.sub ? { sub: true } : {}),
      ...(x.sup ? { sup: true } : {}),
    })),
  };
}

function celula(c: Celula, fonte: number, zebra: boolean): Record<string, unknown> {
  const base: Record<string, unknown> = {
    fontSize: fonte,
    alignment: c.align ?? "left",
    ...(c.b ? { bold: true } : {}),
    ...(c.cor ? { color: h(c.cor) } : {}),
    ...(c.colSpan ? { colSpan: c.colSpan } : {}),
  };
  const fundo = c.fundo ? h(c.fundo) : zebra ? h(COR.zebra) : undefined;
  if (fundo) base.fillColor = fundo;
  if (c.selo) {
    const t = TOM[c.selo];
    return { ...base, text: [{ text: ` ${textoPlano(c.t)} `, background: h(t.fundo), color: h(t.cor), fontSize: fonte - 0.5 }] };
  }
  return texto(c.t, base);
}

// Funções, e não objetos: o pdfmake grava posição e medidas DENTRO do nó ao
// fazer o layout, e um mesmo objeto reaproveitado em vários itens desanda a
// paginação (cada item ia parar numa página).
const ICONE_CHECK = () => ({
  canvas: [
    { type: "ellipse", x: 5.5, y: 6, r1: 5.5, r2: 5.5, color: h(COR.verdeFundo) },
    { type: "polyline", lineWidth: 1.2, lineColor: h(COR.verde), points: [{ x: 3, y: 6 }, { x: 4.9, y: 7.9 }, { x: 8.2, y: 4.3 }] },
  ],
  width: 16,
});
const ICONE_PONTO = () => ({ canvas: [{ type: "ellipse", x: 3, y: 6, r1: 1.8, r2: 1.8, color: h(COR.navy) }], width: 10 });

function svgIcone(ok: boolean): string {
  const cor = ok ? "#1E8A4C" : "#C62828";
  const marca = ok
    ? `<path d="M9 17l5 5L25 11" stroke="${cor}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M11 11l12 12M23 11L11 23" stroke="${cor}" stroke-width="3.4" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="16" fill="#FFFFFF"/>${marca}</svg>`;
}

function blocos(lista: Bloco[], largura: number): No[] {
  const out: No[] = [];
  let vindoDePaisagem = false;
  for (const b of lista) {
    const nos = bloco(b, largura);
    // Depois de um trecho deitado, o primeiro bloco em pé volta a página.
    if (vindoDePaisagem && b.tipo !== "paisagem" && nos.length) {
      out.push({ stack: nos, pageBreak: "before", pageOrientation: "portrait" });
    } else out.push(...nos);
    vindoDePaisagem = b.tipo === "paisagem" || (vindoDePaisagem && !nos.length);
  }
  return out;
}

function bloco(b: Bloco, largura: number): No[] {
  switch (b.tipo) {
    case "titulo": {
      const estilo = b.nivel === 1 ? "h1" : b.nivel === 2 ? "h2" : "h3";
      const no: Record<string, unknown> = { text: b.texto, style: estilo };
      if (b.sumario !== false && b.nivel <= 2) {
        no.tocItem = true;
        no.tocStyle = b.nivel === 1 ? "tocH1" : "tocH2";
        no.tocNumberStyle = b.nivel === 1 ? "tocH1" : "tocH2";
        if (b.nivel === 2) no.tocMargin = [14, 0, 0, 0];
      }
      if (b.quebraAntes) no.pageBreak = "before";
      return [no];
    }
    case "paragrafo":
      return [texto(b.texto, { fontSize: b.tamanho ?? 9.5, alignment: b.align ?? "justify", lineHeight: 1.25, margin: [0, 0, 0, b.espacoDepois ?? 6], ...(b.cor ? { color: h(b.cor) } : {}) })];
    case "tabela": {
      const fonte = b.fonte ?? 8.5;
      const n = b.colunas.length;
      const soma = b.colunas.reduce((s, c) => s + (c.peso ?? 1), 0);
      const widths = b.colunas.map((c) => ((c.peso ?? 1) / soma) * (largura - n * 12 - 4));
      const cab = b.colunas.map((c) => ({ text: c.titulo.toUpperCase(), fontSize: Math.max(6.5, fonte - 1.5), color: h(COR.cinza), characterSpacing: 0.4, alignment: c.align ?? "left", fillColor: "#F7F9FB" }));
      const corpo: unknown[][] = [cab];
      let i = 0;
      for (const l of b.linhas) {
        if (!Array.isArray(l)) {
          corpo.push([{ text: l.grupo.toUpperCase(), colSpan: n, fontSize: fonte - 1.5, bold: true, color: h(COR.navy), fillColor: h(COR.cinzaClaro), characterSpacing: 0.4 }, ...Array(n - 1).fill({})]);
          continue;
        }
        const zebra = i++ % 2 === 1;
        const linha: unknown[] = [];
        for (let k = 0; k < l.length; k++) {
          const c = l[k];
          linha.push(celula({ ...c, align: c.align ?? b.colunas[k]?.align }, fonte, zebra));
          for (let s = 1; s < (c.colSpan ?? 1); s++) linha.push({});
        }
        while (linha.length < n) linha.push({ text: "" });
        corpo.push(linha);
      }
      if (b.total) {
        const linha: unknown[] = [];
        for (const c of b.total) {
          linha.push(celula({ ...c, b: true }, fonte, false));
          for (let s = 1; s < (c.colSpan ?? 1); s++) linha.push({});
        }
        while (linha.length < n) linha.push({ text: "" });
        corpo.push(linha);
      }
      const out: No[] = [
        {
          table: { headerRows: 1, widths, body: corpo, dontBreakRows: true },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 1 ? 1.2 : i === 0 || i === node.table.body.length ? 0.6 : 0.4),
            vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 ? 2.5 : i === node.table.widths.length ? 0.6 : 0),
            hLineColor: (i: number) => (i === 1 ? h(COR.navy) : h(COR.borda)),
            vLineColor: (i: number) => (i === 0 ? "#E2E8F0" : h(COR.borda)),
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 2, 0, b.legenda ? 3 : 12],
        },
      ];
      if (b.legenda) out.push({ text: b.legenda, fontSize: 7.5, color: h(COR.cinza), italics: true, margin: [0, 0, 0, 12] });
      return out;
    }
    case "nota": {
      const t = TOM[b.tom];
      return [
        {
          table: {
            widths: ["*"],
            body: [[{ stack: [b.titulo ? { text: b.titulo, bold: true, color: h(t.cor), fontSize: 9.5, margin: [0, 0, 0, 3] } : "", texto(b.texto, { fontSize: 8.8, lineHeight: 1.25, alignment: "justify" })], fillColor: h(t.fundo), margin: [10, 8, 10, 8] }]],
          },
          layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => h(t.borda) },
          margin: [0, 4, 0, 12],
        },
      ];
    }
    case "cartoes": {
      return [
        {
          columns: b.itens.map((it) => ({
            width: "*",
            table: {
              widths: ["*"],
              body: [
                [
                  {
                    stack: [
                      { text: it.valor, fontSize: 15, color: h(COR.navy) },
                      { text: it.rotulo, fontSize: 7.5, color: h(COR.cinza), margin: [0, 3, 0, 0] },
                      it.sub ? { text: it.sub, fontSize: 7, color: h(COR.cinza) } : "",
                    ],
                    margin: [8, 8, 8, 8],
                    fillColor: it.destaque ? h(COR.lavanda) : undefined,
                  },
                ],
              ],
            },
            layout: { hLineColor: () => h(COR.borda), vLineColor: () => h(COR.borda), hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
          })),
          columnGap: 8,
          margin: [0, 4, 0, 12],
        },
      ];
    }
    case "lista": {
      const icone = b.marcador === "ponto" ? ICONE_PONTO : ICONE_CHECK;
      const item = (t: Texto) => ({ columns: [icone(), texto(t, { fontSize: 8.8, lineHeight: 1.2, width: "*" })], margin: [0, 0, 0, 4] });
      const out: No[] = [];
      if (b.titulo) out.push({ text: b.titulo, fontSize: 10.5, bold: true, color: h(COR.navy), margin: [0, 6, 0, 5] });
      if ((b.colunas ?? 1) === 2) {
        const meio = Math.ceil(b.itens.length / 2);
        out.push({ columns: [{ stack: b.itens.slice(0, meio).map(item), width: "*" }, { stack: b.itens.slice(meio).map(item), width: "*" }], columnGap: 16, margin: [0, 0, 0, 8] });
      } else out.push({ stack: b.itens.map(item), margin: [0, 0, 0, 8] });
      return out;
    }
    case "equacao":
      return [
        {
          table: {
            widths: ["*", 36],
            body: [
              [
                texto(b.expressao, { fontSize: 10.5, margin: [10, 8, 6, 8], fillColor: h(COR.lavanda) }),
                { text: `(${b.numero})`, alignment: "right", color: h(COR.cinza), fontSize: 9, margin: [0, 9, 8, 8], fillColor: h(COR.lavanda) },
              ],
            ],
          },
          layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => h(COR.indigo) },
          margin: [0, 4, 0, 4],
          unbreakable: true,
        },
        ...(b.onde.length
          ? [
              { text: "Em que,", italics: true, fontSize: 8.8, margin: [0, 2, 0, 2] },
              {
                table: { widths: [70, "*"], body: b.onde.map(([s, d]) => [{ text: s, bold: true, fontSize: 8.5 }, { text: d, fontSize: 8.5 }]) },
                layout: "noBorders",
                margin: [6, 0, 0, 2],
              },
            ]
          : []),
        ...(b.referencia ? [{ text: [{ text: "Referência: ", bold: true }, b.referencia], fontSize: 8, color: h(COR.cinza), margin: [0, 2, 0, 10] }] : [{ text: "", margin: [0, 0, 0, 8] }]),
      ];
    case "banner": {
      const cor = b.ok ? COR.verde : COR.vermelho;
      return [
        {
          table: {
            widths: [40, "*", 86],
            body: [
              [
                { svg: svgIcone(b.ok), width: 30, margin: [10, 12, 0, 10], fillColor: h(cor) },
                { stack: [{ text: b.titulo, fontSize: 14, color: "#FFFFFF" }, { text: b.texto, fontSize: 8.8, color: "#FFFFFF", margin: [0, 4, 0, 0] }], margin: [6, 10, 6, 10], fillColor: h(cor) },
                b.lateral
                  ? { stack: [{ text: b.lateral.rotulo, fontSize: 7.5, color: "#FFFFFF", alignment: "right" }, { text: b.lateral.valor, fontSize: 18, color: "#FFFFFF", alignment: "right" }], margin: [0, 10, 12, 10], fillColor: h(cor) }
                  : { text: "", fillColor: h(cor) },
              ],
            ],
          },
          layout: "noBorders",
          margin: [0, 0, 0, 14],
        },
      ];
    }
    case "svg": {
      // `fit` preserva a proporção e impede que um diagrama alto vaze da página.
      return [{ svg: b.svg, fit: [Math.min(largura, b.largura), 680], margin: [0, 2, 0, 10] }];
    }
    case "assinatura":
      return [
        {
          unbreakable: true,
          stack: [
            { text: `${b.local}, ${b.data}.`, fontSize: 9.5, margin: [0, 24, 0, 46], alignment: "center" },
            { canvas: [{ type: "line", x1: largura / 2 - 120, y1: 0, x2: largura / 2 + 120, y2: 0, lineWidth: 0.8, lineColor: h(COR.navy) }] },
            { text: b.nome || "Responsável técnico", bold: true, fontSize: 10, alignment: "center", margin: [0, 4, 0, 0] },
            { text: [b.registro ? `CREA/CFT ${b.registro}` : "", b.art ? ` · ART/TRT ${b.art}` : ""].join(""), fontSize: 8.5, alignment: "center", color: h(COR.cinza) },
            { text: b.empresa, fontSize: 8.5, alignment: "center", color: h(COR.cinza) },
          ],
        },
      ];
    case "quebra":
      return [{ text: "", pageBreak: "after" }];
    case "espaco":
      return [{ text: "", margin: [0, b.altura, 0, 0] }];
    case "paisagem":
      return [{ stack: blocos(b.blocos, A4.h - MARGEM.l - MARGEM.r), pageBreak: "before", pageOrientation: "landscape" }];
  }
}

/** Definição do documento pdfmake (pura — também usada nos testes, com a impressora de Node). */
export function definicaoPdf(laudo: Laudo, logo: string): Record<string, unknown> {
  const a3 = laudo.folha === "A3-paisagem";
  const largura = a3 ? 1190.55 - MARGEM.l - MARGEM.r : A4.w - MARGEM.l - MARGEM.r;
  const content: No[] = [];
  const temCapa = Boolean(laudo.capa) && !a3;

  if (temCapa && laudo.capa) {
    const cp = laudo.capa;
    content.push({ text: "", margin: [0, 225, 0, 0] });
    content.push({ text: cp.faixa.toUpperCase(), color: h(COR.laranja), characterSpacing: 2.2, fontSize: 9.5, bold: true });
    content.push({ text: cp.titulo, fontSize: 28, color: "#FFFFFF", margin: [0, 12, 0, 8], lineHeight: 1.05 });
    content.push({ text: cp.subtitulo, fontSize: 13, color: "#C9D3E6" });
    content.push({ text: cp.norma, fontSize: 9.5, color: "#C9D3E6", margin: [0, 6, 0, 0] });
    if (cp.veredito) {
      const cor = cp.veredito.ok ? COR.verde : COR.vermelho;
      content.push({
        table: { widths: [300], body: [[{ stack: [{ text: cp.veredito.titulo, color: h(cor), fontSize: 12.5 }, { text: cp.veredito.texto, fontSize: 8.5, color: h(COR.cinza), margin: [0, 3, 0, 0] }], fillColor: "#FFFFFF", margin: [14, 11, 14, 11] }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 4 : 0), vLineColor: () => h(cor) },
        margin: [0, 40, 0, 0],
      });
    }
    // Grade de metadados presa ao pé da capa.
    const linhas: unknown[][] = [];
    for (let i = 0; i < cp.metadados.length; i += 3) {
      const trio = cp.metadados.slice(i, i + 3);
      linhas.push(
        [0, 1, 2].map((k) =>
          trio[k]
            ? { stack: [{ text: trio[k].rotulo.toUpperCase(), fontSize: 6.8, color: "#9FB0CC", characterSpacing: 0.8 }, { text: trio[k].valor || "—", fontSize: 10, color: "#FFFFFF", margin: [0, 3, 0, 0] }], margin: [0, 0, 8, 14] }
            : { text: "" },
        ),
      );
    }
    content.push({ absolutePosition: { x: MARGEM.l, y: 655 }, table: { widths: ["*", "*", "*"], body: linhas }, layout: "noBorders" });
    content.push({ text: "", pageBreak: "after" });
  }

  if (laudo.sumario) {
    content.push({ toc: { title: { text: "Sumário", style: "h1" }, numberStyle: { fontSize: 9, color: h(COR.cinza) } } });
    content.push({ text: "", pageBreak: "after" });
  }

  content.push(...blocos(laudo.blocos, largura));

  const def = {
    pageSize: a3 ? "A3" : "A4",
    pageOrientation: a3 ? "landscape" : "portrait",
    pageMargins: [MARGEM.l, MARGEM.t, MARGEM.r, MARGEM.b],
    info: { title: laudo.arquivo, author: laudo.capa?.metadados.find((m) => m.rotulo.startsWith("Responsável"))?.valor ?? "", creator: "Plataforma GTA" },
    background: (pagina: number, tamanho: { width: number; height: number }) => {
      if (!temCapa || pagina !== 1) return null;
      return [
        { canvas: [{ type: "rect", x: 0, y: 0, w: tamanho.width, h: tamanho.height, color: h(COR.navy) }] },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 250, h: 4, color: h(COR.laranja) }, { type: "rect", x: 250, y: 0, w: tamanho.width - 250, h: 4, color: h(COR.indigo) }], absolutePosition: { x: 0, y: 136 } },
        { canvas: [{ type: "rect", x: 0, y: 0, w: 84, h: 84, color: "#FFFFFF" }], absolutePosition: { x: MARGEM.l + 30, y: 60 } },
        { image: logo, fit: [72, 72], absolutePosition: { x: MARGEM.l + 36, y: 66 } },
      ];
    },
    header: (pagina: number, _total: number, tamanho: { width: number }) => {
      if (temCapa && pagina === 1) return null;
      return {
        margin: [MARGEM.l, 26, MARGEM.r, 0],
        stack: [
          { columns: [{ image: logo, fit: [30, 30], width: 40 }, { text: laudo.cabecalho, alignment: "right", fontSize: 7.5, color: h(COR.cinza), margin: [0, 6, 0, 0] }] },
          { canvas: [{ type: "line", x1: 0, y1: 6, x2: tamanho.width - MARGEM.l - MARGEM.r, y2: 6, lineWidth: 0.5, lineColor: h(COR.borda) }] },
        ],
      };
    },
    footer: (pagina: number, total: number, tamanho: { width: number }) => {
      if (temCapa && pagina === 1) return null;
      return {
        margin: [MARGEM.l, 14, MARGEM.r, 0],
        stack: [
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: tamanho.width - MARGEM.l - MARGEM.r, y2: 0, lineWidth: 0.5, lineColor: h(COR.borda) }] },
          { columns: [{ text: `Emitido em ${laudo.emitidoEm}` }, { text: `Página ${pagina} de ${total}`, alignment: "right" }], fontSize: 7.5, color: h(COR.cinza), margin: [0, 6, 0, 0] },
        ],
      };
    },
    content,
    styles: {
      h1: { fontSize: 17, color: h(COR.navy), margin: [0, 10, 0, 10] },
      h2: { fontSize: 12.5, color: h(COR.azul), margin: [0, 8, 0, 7] },
      h3: { fontSize: 10.5, bold: true, color: h(COR.navy), margin: [0, 6, 0, 5] },
      tocH1: { fontSize: 10, color: h(COR.navy), margin: [0, 5, 0, 5] },
      tocH2: { fontSize: 9, color: "#334155", margin: [0, 2, 0, 2] },
    },
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#1F2937" },
  };
  return def;
}

export async function renderPdf(laudo: Laudo, logo: string): Promise<Blob> {
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const fontes = (await import("pdfmake/build/vfs_fonts")).default;
  const vfs = fontes.pdfMake?.vfs ?? fontes;
  if (pdfMake.addVirtualFileSystem) pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;
  const def = definicaoPdf(laudo, logo);
  return new Promise<Blob>((resolve) => pdfMake.createPdf(def).getBlob((b) => resolve(b)));
}
