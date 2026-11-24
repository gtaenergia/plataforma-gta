/**
 * Geração e download dos laudos no navegador. Carregado sob demanda (import
 * dinâmico) — pdfmake e docx só descem quando alguém clica em baixar.
 */

import type { DadosProjeto } from "../tipos";
import type { DadosRisco } from "../risco/tipos";
import type { DadosQuadro } from "../quadro/tipos";
import type { Laudo } from "./modelo";
import { montarLaudoRisco } from "./risco";

let logoGta: string | null = null;

async function logoDoProjeto(projeto: DadosProjeto): Promise<string> {
  if (projeto.rt.logo) return projeto.rt.logo;
  if (logoGta) return logoGta;
  const blob = await (await fetch("/brand/gta-logo.png")).blob();
  logoGta = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsDataURL(blob);
  });
  return logoGta;
}

/**
 * Nome de arquivo seguro preservando acentos ("ANÁLISE" sai como está):
 * só saem os caracteres que o Windows recusa em nome de arquivo.
 */
export function nomeArquivo(base: string, ext: string): string {
  const limpo = base
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 150);
  return `${limpo || "laudo"}.${ext}`;
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function baixarLaudo(laudo: Laudo, projeto: DadosProjeto, formato: "pdf" | "docx") {
  const logo = await logoDoProjeto(projeto);
  if (formato === "pdf") {
    const { renderPdf } = await import("./pdf");
    baixarBlob(await renderPdf(laudo, logo), nomeArquivo(laudo.arquivo, "pdf"));
  } else {
    const { renderDocx } = await import("./docx");
    baixarBlob(await renderDocx(laudo, logo), nomeArquivo(laudo.arquivo, "docx"));
  }
}

export async function baixarLaudoRisco(projeto: DadosProjeto, risco: DadosRisco, formato: "pdf" | "docx") {
  await baixarLaudo(montarLaudoRisco(projeto, risco), projeto, formato);
}

export async function baixarMemorialQuadro(projeto: DadosProjeto, quadro: DadosQuadro, quadroId: string | null, formato: "pdf" | "docx") {
  const { montarMemorialQuadro } = await import("./quadro");
  await baixarLaudo(montarMemorialQuadro(projeto, quadro, quadroId), projeto, formato);
}

export async function baixarDiagramaPdf(projeto: DadosProjeto, titulo: string, svg: string, largura: number, altura: number) {
  const laudo: Laudo = {
    arquivo: `${titulo} - ${projeto.nome}`,
    cabecalho: `${titulo} — ${projeto.nome}`,
    emitidoEm: new Date().toLocaleDateString("pt-BR"),
    sumario: false,
    folha: "A3-paisagem",
    blocos: [
      { tipo: "titulo", nivel: 1, texto: titulo, sumario: false },
      { tipo: "svg", svg, largura, altura },
    ],
  };
  await baixarLaudo(laudo, projeto, "pdf");
}
