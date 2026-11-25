import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import { montarLaudoRisco } from "@/lib/engenharia/laudos/risco";
import { definicaoPdf } from "@/lib/engenharia/laudos/pdf";
import { textoPlano, type Bloco, type Laudo } from "@/lib/engenharia/laudos/modelo";
import { dadosVazios } from "@/lib/engenharia/tipos";
import type { DadosRisco } from "@/lib/engenharia/risco/tipos";
import { pousada, quadroExemplo } from "./eng-fixtures";
import { montarMemorialQuadro } from "@/lib/engenharia/laudos/quadro";
import { calcularQuadros } from "@/lib/engenharia/quadro/motor";
import { gerarDxf } from "@/lib/engenharia/quadro/dxf";
import { planilhaQuadro } from "@/lib/engenharia/quadro/planilha";
import { svgPaineis, svgImpedancias } from "@/lib/engenharia/quadro/diagramas";

/**
 * Os laudos são montados uma vez (modelo de blocos) e renderizados em PDF e
 * Word. Aqui: a estrutura do laudo de risco bate com a do relatório de
 * referência e a definição do PDF é aceita pelo pdfmake.
 *
 * Com GERAR_LAUDOS=1, grava os arquivos em data/_laudos-teste/ para conferência
 * visual (os gráficos SVG só entram no Word dentro do navegador).
 */

const projeto = { ...dadosVazios(), nome: "Projeto Pousada (teste)", cliente: "Cliente Teste", cidade: "Alto Paraíso de Goiás/GO", data: "2026-11-16" };
projeto.rt = { ...projeto.rt, nome: "Eng. Teste", registro: "0000000000", empresa: "GTA Energia" };

function risco(): DadosRisco {
  const com = pousada(true);
  return { ...com, preliminar: { em: "2026-11-16T13:00:00.000Z", entrada: pousada(false) }, analise: { em: "2026-11-16T14:00:00.000Z", entrada: com } };
}

const titulos = (bs: Bloco[]): string[] => bs.flatMap((b) => (b.tipo === "titulo" ? [b.texto] : b.tipo === "paisagem" ? titulos(b.blocos) : []));

const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), "public/brand/gta-logo.png")).toString("base64")}`;

async function gravarPdf(laudo: Laudo, arquivo: string) {
  const req = createRequire(import.meta.url);
  const Printer = req("pdfmake/src/printer");
  const vfs = req("pdfmake/build/vfs_fonts");
  const f = (n: string) => Buffer.from(vfs[n], "base64");
  const printer = new Printer({ Roboto: { normal: f("Roboto-Regular.ttf"), bold: f("Roboto-Medium.ttf"), italics: f("Roboto-Italic.ttf"), bolditalics: f("Roboto-MediumItalic.ttf") } });
  const doc = printer.createPdfKitDocument(definicaoPdf(laudo, LOGO));
  await new Promise<void>((ok, erro) => {
    const out = fs.createWriteStream(arquivo);
    out.on("finish", () => ok());
    out.on("error", erro);
    doc.pipe(out);
    doc.end();
  });
}

describe("laudo da análise de risco", () => {
  const laudo = montarLaudoRisco(projeto, risco());

  it("segue a estrutura do relatório de referência", () => {
    const t = titulos(laudo.blocos);
    expect(t[0]).toBe("Painel de Risco");
    for (const s of [
      "1. Identificação do Projeto",
      "2. Dimensões e Parâmetros da Estrutura",
      "3. Linhas Elétricas Conectadas",
      "4. Parâmetros por Zona",
      "5. Áreas de Exposição e Números de Eventos",
      "6. Componentes de Risco — Com Medidas de Proteção",
      "7. Frequência de Danos a Equipamentos",
      "8. Comparativo: Sem Proteção vs. Com Medidas",
      "9. Resultado Final e Parecer Técnico",
      "10. Medidas de Proteção Adotadas",
      "11. DPS por Zona",
      "12. Medidas por Zona",
    ]) {
      expect(t).toContain(s);
    }
    expect(laudo.capa!.veredito!.ok).toBe(true);
  });

  it("leva os números do caso de referência para as tabelas", () => {
    const celulas = laudo.blocos.flatMap((b) => (b.tipo === "tabela" ? b.linhas.flatMap((l) => (Array.isArray(l) ? l.map((c) => textoPlano(c.t)) : [])).concat((b.total ?? []).map((c) => textoPlano(c.t))) : []));
    expect(celulas).toContain("14.107,19");
    expect(celulas).toContain("0,571e-5");
    expect(celulas).toContain("28,627 ×10⁻⁵");
    expect(celulas).toContain("−98,0%");
  });

  it("com risco de explosão, a tabela de parâmetros mostra o rp adotado (C.3.4)", () => {
    const d = risco();
    d.zonas[0] = { ...d.zonas[0], rp: "automatica", rf: "explosao-z1" };
    const l = montarLaudoRisco(projeto, d);
    const linhasRp = l.blocos.flatMap((b) => (b.tipo === "tabela" ? b.linhas.filter((x) => Array.isArray(x) && textoPlano(x[0].t) === "rp") : [])) as { t: unknown }[][];
    expect(textoPlano(linhasRp[0][2].t as never)).toBe("1");
    expect(textoPlano(linhasRp[0][3].t as never)).toContain("C.3.4");
  });

  it("gera a definição do PDF com sumário, cabeçalho e rodapé", () => {
    const def = definicaoPdf(laudo, LOGO) as { content: unknown[]; header: (...a: unknown[]) => unknown; footer: (...a: unknown[]) => unknown };
    expect(JSON.stringify(def.content)).toContain('"toc"');
    expect(def.header(1, 12, { width: 595 })).toBeNull(); // capa sem cabeçalho
    expect(JSON.stringify(def.footer(3, 12, { width: 595 }))).toContain("Página 3 de 12");
  });

  it.skipIf(!process.env.GERAR_LAUDOS)("grava PDF e Word para conferência", async () => {
    const dir = path.join(process.cwd(), "data", "_laudos-teste");
    fs.mkdirSync(dir, { recursive: true });
    await gravarPdf(laudo, path.join(dir, "risco.pdf"));
    const { renderDocx } = await import("@/lib/engenharia/laudos/docx");
    const blob = await renderDocx(laudo, LOGO);
    fs.writeFileSync(path.join(dir, "risco.docx"), Buffer.from(await blob.arrayBuffer()));
    // Os gráficos SVG, numa página só, para conferir no navegador.
    const svgs = laudo.blocos.flatMap((b) => (b.tipo === "svg" ? [b.svg] : []));
    fs.writeFileSync(path.join(dir, "graficos.html"), `<!doctype html><meta charset="utf-8"><body style="background:#fff;padding:16px">${svgs.join("<br><br>")}</body>`);
    expect(fs.statSync(path.join(dir, "risco.pdf")).size).toBeGreaterThan(10_000);
  }, 60_000);
});

describe("memorial de cálculo do quadro", () => {
  const dados = quadroExemplo();
  const laudo = montarMemorialQuadro(projeto, dados, null);

  it("tem as seções do memorial e os anexos em paisagem", () => {
    const t = titulos(laudo.blocos);
    for (const s of ["1. Objetivo", "2. Documentos de Referência", "3. Normas Aplicáveis", "4. Termos e Definições", "5. Metodologia", "6. Resultados", "7. Anexos"]) expect(t).toContain(s);
    expect(t.some((x) => x.startsWith("Anexo III"))).toBe(true);
    expect(laudo.blocos.some((b) => b.tipo === "paisagem")).toBe(true);
    const eqs = laudo.blocos.filter((b) => b.tipo === "equacao");
    expect(eqs.length).toBeGreaterThan(15);
    expect(eqs.map((e) => (e.tipo === "equacao" ? e.numero : 0))).toEqual(eqs.map((_, i) => i + 1));
  });

  it("DXF, planilha e diagramas saem do mesmo resultado", async () => {
    const res = calcularQuadros(dados);
    const dxf = gerarDxf(res, "Teste", { dps: true, vazios: true, balanceamento: true });
    expect(dxf.startsWith("0" + String.fromCharCode(10) + "SECTION")).toBe(true);
    expect(dxf.trim().endsWith("EOF")).toBe(true);
    expect(dxf).toContain("QDFL-01");
    const xlsx = await planilhaQuadro(dados, "Teste");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
    expect(svgPaineis(res).svg).toContain("QDFL-01");
    expect(svgImpedancias(res).svg).toContain("C5");
  });

  it.skipIf(!process.env.GERAR_LAUDOS)("grava o memorial, o DXF e a planilha para conferência", async () => {
    const dir = path.join(process.cwd(), "data", "_laudos-teste");
    fs.mkdirSync(dir, { recursive: true });
    await gravarPdf(laudo, path.join(dir, "memorial.pdf"));
    const { renderDocx } = await import("@/lib/engenharia/laudos/docx");
    fs.writeFileSync(path.join(dir, "memorial.docx"), Buffer.from(await (await renderDocx(laudo, LOGO)).arrayBuffer()));
    const res = calcularQuadros(dados);
    fs.writeFileSync(path.join(dir, "unifilar.dxf"), gerarDxf(res, "Teste", { dps: true, vazios: true, balanceamento: true }));
    fs.writeFileSync(path.join(dir, "quadro.xlsx"), await planilhaQuadro(dados, "Teste"));
    fs.writeFileSync(path.join(dir, "diagramas.html"), `<!doctype html><meta charset="utf-8"><body style="background:#fff">${svgPaineis(res).svg}<br>${svgImpedancias(res).svg}</body>`);
  }, 60_000);
});
