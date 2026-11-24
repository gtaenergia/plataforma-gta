/**
 * Laudo → Word (.docx editável). Títulos usam os estilos "Título 1/2/3" do
 * Word (o sumário é um campo de verdade, navegável), as tabelas são tabelas e
 * as equações ficam numeradas em caixa. Os gráficos SVG entram como imagem.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
} from "docx";
import { COR, textoPlano, type Bloco, type Celula, type Laudo, type Texto, type Tom } from "./modelo";

const FONTE = "Calibri";
const A4 = { w: 11906, h: 16838 };
const M = { l: 1134, r: 1134, t: 1418, b: 1134 };
const UTIL_RETRATO = A4.w - M.l - M.r;
const UTIL_PAISAGEM = A4.h - M.l - M.r;

const TOM: Record<Tom, { fundo: string; cor: string }> = {
  ok: { fundo: COR.verdeFundo, cor: COR.verde },
  falha: { fundo: COR.vermelhoFundo, cor: COR.vermelho },
  info: { fundo: COR.infoFundo, cor: COR.azul },
  alerta: { fundo: COR.ambarFundo, cor: COR.ambar },
  neutro: { fundo: COR.cinzaClaro, cor: COR.cinza },
};

const SEM = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const semBordas = { top: SEM, bottom: SEM, left: SEM, right: SEM, insideHorizontal: SEM, insideVertical: SEM };

type Filho = Paragraph | Table | TableOfContents;

function runs(t: Texto, base: { size?: number; bold?: boolean; color?: string; italics?: boolean; font?: string } = {}): TextRun[] {
  const lista = typeof t === "string" ? [{ t }] : t;
  return lista.map(
    (x) =>
      new TextRun({
        text: (x as { t: string }).t,
        font: base.font ?? FONTE,
        size: base.size,
        bold: (x as { b?: boolean }).b ?? base.bold,
        italics: (x as { i?: boolean }).i ?? base.italics,
        color: (x as { cor?: string }).cor ?? base.color,
        subScript: (x as { sub?: boolean }).sub,
        superScript: (x as { sup?: boolean }).sup,
      }),
  );
}

const alinh = (a?: string) =>
  a === "right" ? AlignmentType.RIGHT : a === "center" ? AlignmentType.CENTER : a === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT;

function dataUrlParaBytes(url: string): { bytes: Uint8Array; tipo: "png" | "jpg" } {
  const [cab, b64] = url.split(",");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, tipo: /jpe?g/.test(cab) ? "jpg" : "png" };
}

/** SVG → PNG (no navegador), na escala pedida. */
export async function svgParaPng(svg: string, largura: number, altura: number, escala = 2.5): Promise<Uint8Array> {
  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((ok, erro) => {
    img.onload = () => ok();
    img.onerror = () => erro(new Error("SVG inválido"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

function celulaDocx(c: Celula, fonte: number, larguraTw: number, zebra: boolean): TableCell {
  const tam = Math.round(fonte * 2);
  const fill = c.fundo ?? (zebra ? COR.zebra : undefined);
  let filhos: TextRun[];
  if (c.selo) {
    const t = TOM[c.selo];
    filhos = [new TextRun({ text: ` ${textoPlano(c.t)} `, font: FONTE, size: tam - 1, color: t.cor, shading: { type: ShadingType.CLEAR, fill: t.fundo, color: "auto" } })];
  } else filhos = runs(c.t, { size: tam, bold: c.b, color: c.cor });
  return new TableCell({
    children: [new Paragraph({ children: filhos, alignment: alinh(c.align) })],
    columnSpan: c.colSpan,
    width: { size: larguraTw, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
  });
}

async function blocosDocx(lista: Bloco[], util: number): Promise<Filho[]> {
  const out: Filho[] = [];
  for (const b of lista) out.push(...(await blocoDocx(b, util)));
  return out;
}

async function blocoDocx(b: Bloco, util: number): Promise<Filho[]> {
  switch (b.tipo) {
    case "titulo": {
      const nivel = b.nivel === 1 ? HeadingLevel.HEADING_1 : b.nivel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      return [new Paragraph({ heading: nivel, text: b.texto, pageBreakBefore: b.quebraAntes })];
    }
    case "paragrafo":
      return [
        new Paragraph({
          children: runs(b.texto, { size: Math.round((b.tamanho ?? 9.5) * 2), color: b.cor }),
          alignment: alinh(b.align ?? "justify"),
          spacing: { after: (b.espacoDepois ?? 6) * 20, line: 276 },
        }),
      ];
    case "tabela": {
      const fonte = b.fonte ?? 8.5;
      const n = b.colunas.length;
      const soma = b.colunas.reduce((s, c) => s + (c.peso ?? 1), 0);
      const larg = b.colunas.map((c) => Math.floor(((c.peso ?? 1) / soma) * util));
      const span = (k: number, s: number) => larg.slice(k, k + s).reduce((a, x) => a + x, 0);
      const linhas: TableRow[] = [
        new TableRow({
          tableHeader: true,
          children: b.colunas.map(
            (c, k) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: c.titulo.toUpperCase(), font: FONTE, size: Math.round(Math.max(6.5, fonte - 1.5) * 2), color: COR.cinza })], alignment: alinh(c.align) })],
                width: { size: larg[k], type: WidthType.DXA },
                shading: { type: ShadingType.CLEAR, fill: "F7F9FB", color: "auto" },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                borders: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COR.navy } },
              }),
          ),
        }),
      ];
      let i = 0;
      for (const l of b.linhas) {
        if (!Array.isArray(l)) {
          linhas.push(
            new TableRow({
              children: [
                new TableCell({
                  columnSpan: n,
                  width: { size: util, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, fill: COR.cinzaClaro, color: "auto" },
                  margins: { top: 40, bottom: 40, left: 100, right: 100 },
                  children: [new Paragraph({ children: [new TextRun({ text: l.grupo.toUpperCase(), font: FONTE, size: Math.round((fonte - 1.5) * 2), bold: true, color: COR.navy })] })],
                }),
              ],
            }),
          );
          continue;
        }
        const zebra = i++ % 2 === 1;
        let k = 0;
        const cells: TableCell[] = [];
        for (const c of l) {
          const s = c.colSpan ?? 1;
          cells.push(celulaDocx({ ...c, align: c.align ?? b.colunas[k]?.align }, fonte, span(k, s), zebra));
          k += s;
        }
        while (k < n) {
          cells.push(celulaDocx({ t: "" }, fonte, larg[k], zebra));
          k++;
        }
        linhas.push(new TableRow({ children: cells, cantSplit: true }));
      }
      if (b.total) {
        let k = 0;
        const cells: TableCell[] = [];
        for (const c of b.total) {
          const s = c.colSpan ?? 1;
          cells.push(celulaDocx({ ...c, b: true }, fonte, span(k, s), false));
          k += s;
        }
        while (k < n) {
          cells.push(celulaDocx({ t: "" }, fonte, larg[k], false));
          k++;
        }
        linhas.push(new TableRow({ children: cells }));
      }
      const out: Filho[] = [
        new Table({
          width: { size: util, type: WidthType.DXA },
          columnWidths: larg,
          layout: TableLayoutType.FIXED,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            left: { style: BorderStyle.SINGLE, size: 18, color: "E2E8F0" },
            right: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COR.borda },
            insideVertical: SEM,
          },
          rows: linhas,
        }),
      ];
      out.push(
        new Paragraph({
          children: b.legenda ? runs(b.legenda, { size: 15, italics: true, color: COR.cinza }) : [],
          spacing: { before: 60, after: 200 },
        }),
      );
      return out;
    }
    case "nota": {
      const t = TOM[b.tom];
      const filhos: Paragraph[] = [];
      if (b.titulo) filhos.push(new Paragraph({ children: [new TextRun({ text: b.titulo, bold: true, color: t.cor, font: FONTE, size: 19 })], spacing: { after: 60 } }));
      filhos.push(new Paragraph({ children: runs(b.texto, { size: 18 }), alignment: AlignmentType.JUSTIFIED }));
      return [
        new Table({
          width: { size: util, type: WidthType.DXA },
          columnWidths: [util],
          borders: { ...semBordas, left: { style: BorderStyle.SINGLE, size: 24, color: t.cor } },
          rows: [new TableRow({ children: [new TableCell({ children: filhos, shading: { type: ShadingType.CLEAR, fill: t.fundo, color: "auto" }, margins: { top: 120, bottom: 120, left: 180, right: 180 } })] })],
        }),
        new Paragraph({ spacing: { after: 160 } }),
      ];
    }
    case "cartoes": {
      const w = Math.floor(util / b.itens.length);
      return [
        new Table({
          width: { size: util, type: WidthType.DXA },
          columnWidths: b.itens.map(() => w),
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            left: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            right: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
            insideHorizontal: SEM,
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COR.borda },
          },
          rows: [
            new TableRow({
              children: b.itens.map(
                (it) =>
                  new TableCell({
                    width: { size: w, type: WidthType.DXA },
                    margins: { top: 120, bottom: 120, left: 140, right: 140 },
                    shading: it.destaque ? { type: ShadingType.CLEAR, fill: COR.lavanda, color: "auto" } : undefined,
                    children: [
                      new Paragraph({ children: [new TextRun({ text: it.valor, font: FONTE, size: 30, color: COR.navy })] }),
                      new Paragraph({ children: [new TextRun({ text: it.rotulo, font: FONTE, size: 15, color: COR.cinza })] }),
                      ...(it.sub ? [new Paragraph({ children: [new TextRun({ text: it.sub, font: FONTE, size: 14, color: COR.cinza })] })] : []),
                    ],
                  }),
              ),
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 160 } }),
      ];
    }
    case "lista": {
      const marca = b.marcador === "ponto" ? "•  " : "✓  ";
      const corMarca = b.marcador === "ponto" ? COR.navy : COR.verde;
      const item = (t: Texto) =>
        new Paragraph({ children: [new TextRun({ text: marca, color: corMarca, bold: true, font: "Segoe UI Symbol", size: 18 }), ...runs(t, { size: 18 })], spacing: { after: 70 }, indent: { left: 300, hanging: 300 } });
      const out: Filho[] = [];
      if (b.titulo) out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: b.titulo }));
      if ((b.colunas ?? 1) === 2) {
        const meio = Math.ceil(b.itens.length / 2);
        const w = Math.floor(util / 2);
        out.push(
          new Table({
            width: { size: util, type: WidthType.DXA },
            columnWidths: [w, w],
            borders: semBordas,
            rows: [
              new TableRow({
                children: [b.itens.slice(0, meio), b.itens.slice(meio)].map((parte) => new TableCell({ width: { size: w, type: WidthType.DXA }, children: parte.length ? parte.map(item) : [new Paragraph("")] })),
              }),
            ],
          }),
        );
      } else out.push(...b.itens.map(item));
      out.push(new Paragraph({ spacing: { after: 80 } }));
      return out;
    }
    case "equacao": {
      const wNum = 700;
      const out: Filho[] = [
        new Table({
          width: { size: util, type: WidthType.DXA },
          columnWidths: [util - wNum, wNum],
          borders: { ...semBordas, left: { style: BorderStyle.SINGLE, size: 24, color: COR.indigo } },
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: util - wNum, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, fill: COR.lavanda, color: "auto" },
                  margins: { top: 120, bottom: 120, left: 200, right: 100 },
                  children: [new Paragraph({ children: runs(b.expressao, { size: 22, font: "Cambria Math" }) })],
                }),
                new TableCell({
                  width: { size: wNum, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, fill: COR.lavanda, color: "auto" },
                  margins: { top: 120, bottom: 120, left: 60, right: 160 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `(${b.numero})`, font: FONTE, size: 18, color: COR.cinza })] })],
                }),
              ],
            }),
          ],
        }),
      ];
      if (b.onde.length) {
        out.push(new Paragraph({ children: [new TextRun({ text: "Em que,", italics: true, font: FONTE, size: 18 })], spacing: { before: 80, after: 40 } }));
        const w1 = 1300;
        out.push(
          new Table({
            width: { size: util, type: WidthType.DXA },
            columnWidths: [w1, util - w1],
            borders: semBordas,
            rows: b.onde.map(
              ([s, d]) =>
                new TableRow({
                  children: [
                    new TableCell({ width: { size: w1, type: WidthType.DXA }, margins: { left: 120 }, children: [new Paragraph({ children: [new TextRun({ text: s, bold: true, font: FONTE, size: 17 })] })] }),
                    new TableCell({ width: { size: util - w1, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: d, font: FONTE, size: 17 })] })] }),
                  ],
                }),
            ),
          }),
        );
      }
      out.push(
        new Paragraph({
          children: b.referencia ? [new TextRun({ text: "Referência: ", bold: true, font: FONTE, size: 16, color: COR.cinza }), new TextRun({ text: b.referencia, font: FONTE, size: 16, color: COR.cinza })] : [],
          spacing: { before: 60, after: 200 },
        }),
      );
      return out;
    }
    case "banner": {
      const cor = b.ok ? COR.verde : COR.vermelho;
      const wL = b.lateral ? 1800 : 0;
      const cells = [
        new TableCell({
          width: { size: util - wL, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: cor, color: "auto" },
          margins: { top: 200, bottom: 200, left: 240, right: 120 },
          children: [
            new Paragraph({ children: [new TextRun({ text: `${b.ok ? "✔" : "✖"}  ${b.titulo}`, font: FONTE, size: 30, color: "FFFFFF" })] }),
            new Paragraph({ children: [new TextRun({ text: b.texto, font: FONTE, size: 18, color: "FFFFFF" })], spacing: { before: 60 } }),
          ],
        }),
      ];
      if (b.lateral)
        cells.push(
          new TableCell({
            width: { size: wL, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill: cor, color: "auto" },
            margins: { top: 200, bottom: 200, left: 120, right: 240 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: b.lateral.rotulo, font: FONTE, size: 15, color: "FFFFFF" })] }),
              new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: b.lateral.valor, font: FONTE, size: 36, color: "FFFFFF" })] }),
            ],
          }),
        );
      return [
        new Table({ width: { size: util, type: WidthType.DXA }, columnWidths: b.lateral ? [util - wL, wL] : [util], borders: semBordas, rows: [new TableRow({ children: cells })] }),
        new Paragraph({ spacing: { after: 200 } }),
      ];
    }
    case "svg": {
      const maxPt = util / 20;
      const escala = Math.min(1, maxPt / b.largura);
      const wPt = b.largura * escala;
      const hPt = b.altura * escala;
      try {
        const png = await svgParaPng(b.svg, b.largura, b.altura);
        return [
          new Paragraph({
            children: [new ImageRun({ type: "png", data: png, transformation: { width: Math.round((wPt * 96) / 72), height: Math.round((hPt * 96) / 72) } })],
            spacing: { after: 160 },
          }),
        ];
      } catch {
        return [];
      }
    }
    case "assinatura":
      return [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 900 }, children: [new TextRun({ text: `${b.local}, ${b.data}.`, font: FONTE, size: 19 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "_______________________________________________", font: FONTE, size: 19, color: COR.navy })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.nome || "Responsável técnico", bold: true, font: FONTE, size: 20 })] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: [b.registro ? `CREA/CFT ${b.registro}` : "", b.art ? ` · ART/TRT ${b.art}` : ""].join(""), font: FONTE, size: 17, color: COR.cinza })],
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.empresa, font: FONTE, size: 17, color: COR.cinza })] }),
      ];
    case "quebra":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "espaco":
      return [new Paragraph({ spacing: { before: b.altura * 20 } })];
    case "paisagem":
      return []; // tratado na montagem das seções
  }
}

function cabecalho(laudo: Laudo, logo: { bytes: Uint8Array; tipo: "png" | "jpg" }, util: number): Header {
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: util }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COR.borda, space: 4 } },
        children: [
          new ImageRun({ type: logo.tipo, data: logo.bytes, transformation: { width: 34, height: 34 } }),
          new TextRun({ text: `\t${laudo.cabecalho}`, font: FONTE, size: 15, color: COR.cinza }),
        ],
      }),
    ],
  });
}

function rodape(laudo: Laudo, util: number): Footer {
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: util }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: COR.borda, space: 4 } },
        children: [
          new TextRun({ text: `Emitido em ${laudo.emitidoEm}`, font: FONTE, size: 15, color: COR.cinza }),
          new TextRun({ children: ["\tPágina ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], font: FONTE, size: 15, color: COR.cinza }),
        ],
      }),
    ],
  });
}

function capaDocx(laudo: Laudo, logo: { bytes: Uint8Array; tipo: "png" | "jpg" }): ISectionOptions {
  const cp = laudo.capa!;
  const margem = 720;
  const util = A4.w - 2 * margem;
  const branco = (t: string, size: number, extra: Record<string, unknown> = {}) => new TextRun({ text: t, font: FONTE, size, color: "FFFFFF", ...extra });
  const meta: TableRow[] = [];
  for (let i = 0; i < cp.metadados.length; i += 3) {
    const trio = cp.metadados.slice(i, i + 3);
    meta.push(
      new TableRow({
        children: [0, 1, 2].map(
          (k) =>
            new TableCell({
              width: { size: Math.floor((util - 1200) / 3), type: WidthType.DXA },
              margins: { bottom: 200 },
              children: trio[k]
                ? [
                    new Paragraph({ children: [new TextRun({ text: trio[k].rotulo.toUpperCase(), font: FONTE, size: 13, color: "9FB0CC" })] }),
                    new Paragraph({ children: [branco(trio[k].valor || "—", 20)] }),
                  ]
                : [new Paragraph("")],
            }),
        ),
      }),
    );
  }
  const corV = cp.veredito?.ok ? COR.verde : COR.vermelho;
  const conteudo: (Paragraph | Table)[] = [
    new Paragraph({ children: [new ImageRun({ type: logo.tipo, data: logo.bytes, transformation: { width: 96, height: 96 } })], spacing: { after: 200 } }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: COR.laranja, space: 1 } }, spacing: { after: 2400 } }),
    new Paragraph({ children: [new TextRun({ text: cp.faixa.toUpperCase(), font: FONTE, size: 19, bold: true, color: COR.laranja, characterSpacing: 40 })], spacing: { after: 200 } }),
    new Paragraph({ children: [branco(cp.titulo, 56)], spacing: { after: 160 } }),
    new Paragraph({ children: [new TextRun({ text: cp.subtitulo, font: FONTE, size: 26, color: "C9D3E6" })], spacing: { after: 80 } }),
    new Paragraph({ children: [new TextRun({ text: cp.norma, font: FONTE, size: 19, color: "C9D3E6" })], spacing: { after: 600 } }),
  ];
  if (cp.veredito) {
    conteudo.push(
      new Table({
        width: { size: 6000, type: WidthType.DXA },
        columnWidths: [6000],
        borders: { ...semBordas, left: { style: BorderStyle.SINGLE, size: 36, color: corV } },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: "FFFFFF", color: "auto" },
                margins: { top: 160, bottom: 160, left: 240, right: 240 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: cp.veredito.titulo, font: FONTE, size: 25, color: corV })] }),
                  new Paragraph({ children: [new TextRun({ text: cp.veredito.texto, font: FONTE, size: 17, color: COR.cinza })] }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }
  conteudo.push(new Paragraph({ spacing: { after: 2400 } }));
  conteudo.push(new Table({ width: { size: util - 1200, type: WidthType.DXA }, borders: semBordas, rows: meta }));

  return {
    properties: { page: { size: { width: A4.w, height: A4.h }, margin: { top: margem, bottom: margem, left: margem, right: margem } } },
    children: [
      new Table({
        width: { size: util, type: WidthType.DXA },
        columnWidths: [util],
        borders: semBordas,
        rows: [
          new TableRow({
            height: { value: A4.h - 2 * margem - 400, rule: HeightRule.EXACT },
            children: [
              new TableCell({
                shading: { type: ShadingType.CLEAR, fill: COR.navy, color: "auto" },
                margins: { top: 500, bottom: 300, left: 600, right: 600 },
                children: conteudo,
              }),
            ],
          }),
        ],
      }),
    ],
  };
}

export async function renderDocx(laudo: Laudo, logoUrl: string): Promise<Blob> {
  const logo = dataUrlParaBytes(logoUrl);
  const sections: ISectionOptions[] = [];
  const a3 = laudo.folha === "A3-paisagem";
  if (laudo.capa && !a3) sections.push(capaDocx(laudo, logo));

  const retrato = (children: Filho[]): ISectionOptions => ({
    properties: { page: { size: { width: A4.w, height: A4.h, orientation: PageOrientation.PORTRAIT }, margin: { top: M.t, bottom: M.b, left: M.l, right: M.r } } },
    headers: { default: cabecalho(laudo, logo, UTIL_RETRATO) },
    footers: { default: rodape(laudo, UTIL_RETRATO) },
    children,
  });
  const paisagem = (children: Filho[]): ISectionOptions => ({
    properties: { page: { size: { width: A4.w, height: A4.h, orientation: PageOrientation.LANDSCAPE }, margin: { top: M.t, bottom: M.b, left: M.l, right: M.r } } },
    headers: { default: cabecalho(laudo, logo, UTIL_PAISAGEM) },
    footers: { default: rodape(laudo, UTIL_PAISAGEM) },
    children,
  });

  let atual: Filho[] = [];
  if (laudo.sumario) {
    atual.push(new Paragraph({ children: [new TextRun({ text: "Sumário", font: FONTE, size: 34, color: COR.navy })], spacing: { after: 240 } }));
    atual.push(new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-2" }));
    atual.push(new Paragraph({ children: [new PageBreak()] }));
  }
  for (const b of laudo.blocos) {
    if (b.tipo === "paisagem") {
      if (atual.length) sections.push(retrato(atual));
      atual = [];
      sections.push(paisagem(await blocosDocx(b.blocos, UTIL_PAISAGEM)));
      continue;
    }
    atual.push(...(await blocoDocx(b, a3 ? UTIL_PAISAGEM : UTIL_RETRATO)));
  }
  if (atual.length) sections.push(a3 ? paisagem(atual) : retrato(atual));

  const doc = new Document({
    creator: "Plataforma GTA",
    title: laudo.arquivo,
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: FONTE, size: 19, color: "1F2937" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONTE, size: 34, color: COR.navy }, paragraph: { spacing: { before: 360, after: 200 }, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONTE, size: 25, color: COR.azul }, paragraph: { spacing: { before: 240, after: 140 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONTE, size: 21, bold: true, color: COR.navy }, paragraph: { spacing: { before: 160, after: 100 }, keepNext: true } },
      ],
    },
    sections,
  });
  return Packer.toBlob(doc);
}
