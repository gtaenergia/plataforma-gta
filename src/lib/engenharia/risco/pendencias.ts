/**
 * O que falta para calcular. Cada pendência aponta a etapa e o `id` do campo,
 * para o aviso "Faltam N dados" levar direto ao lugar certo.
 */

import type { EntradaRisco } from "./tipos";

export type EtapaRisco = "estrutura" | "linhas" | "zonas" | "parametros" | "resultados";

export interface Pendencia {
  etapa: EtapaRisco;
  campo: string;
  texto: string;
}

const falta = (v: number | null | undefined) => !(typeof v === "number" && Number.isFinite(v) && v > 0);

export const campoRisco = {
  estrutura: (k: string) => `r-estrutura-${k}`,
  linha: (id: string, k: string) => `r-linha-${id}-${k}`,
  zona: (id: string, k: string) => `r-zona-${id}-${k}`,
};

export function pendenciasRisco(d: EntradaRisco): Pendencia[] {
  const out: Pendencia[] = [];
  const e = d.estrutura;
  const est = (k: string, texto: string) => out.push({ etapa: "estrutura", campo: campoRisco.estrutura(k), texto });
  if (falta(e.NG)) est("NG", "Densidade de descargas NG (busque a cidade ou digite)");
  if (falta(e.L)) est("L", "Comprimento L da estrutura");
  if (falta(e.W)) est("W", "Largura W da estrutura");
  if (falta(e.H)) est("H", "Altura H da estrutura");
  if (!e.semBlindagemKs1 && falta(e.KS1)) est("KS1", "Valor de KS1 (blindagem espacial da estrutura)");

  d.linhas.forEach((l) => {
    const lin = (k: string, texto: string) => out.push({ etapa: "linhas", campo: campoRisco.linha(l.id, k), texto: `${l.nome}: ${texto}` });
    if (!l.nome.trim()) lin("nome", "nome da linha");
    if (falta(l.LL)) lin("LL", "comprimento LL");
    if (l.adjacente) {
      if (falta(l.adjacente.L) || falta(l.adjacente.W) || falta(l.adjacente.H)) lin("adj", "dimensões da estrutura adjacente");
    }
  });

  if (!d.zonas.length) out.push({ etapa: "zonas", campo: "r-zonas", texto: "Pelo menos uma zona de estudo" });
  const algumaL1 = d.zonas.some((z) => z.perdas.L1);
  if (algumaL1 && falta(e.nt)) out.push({ etapa: "zonas", campo: campoRisco.estrutura("nt"), texto: "Total de pessoas na estrutura (nt)" });
  const somaNz = d.zonas.filter((z) => z.perdas.L1).reduce((s, z) => s + (z.nz ?? 0), 0);
  if (algumaL1 && !falta(e.nt) && somaNz > (e.nt ?? 0)) {
    out.push({ etapa: "zonas", campo: campoRisco.estrutura("nt"), texto: `A soma das pessoas nas zonas (${somaNz}) passa do total da estrutura (${e.nt})` });
  }

  d.zonas.forEach((z) => {
    const zon = (etapa: EtapaRisco, k: string, texto: string) => out.push({ etapa, campo: campoRisco.zona(z.id, k), texto: `${z.nome}: ${texto}` });
    if (!z.nome.trim()) zon("zonas", "nome", "nome da zona");
    const { L1, L3, L4, F } = z.perdas;
    if (!L1 && !L3 && !L4 && !F) zon("zonas", "perdas", "marque ao menos uma perda (L1, L3, L4 ou F)");
    if (L1) {
      if (z.nz == null || !(z.nz >= 0)) zon("zonas", "nz", "número de pessoas na zona");
      if (falta(z.tz)) zon("zonas", "tz", "tempo de permanência (h/ano)");
      else if ((z.tz ?? 0) > 8760) zon("zonas", "tz", "tempo de permanência acima de 8 760 h/ano");
    }
    if (!z.semBlindagemKs2 && falta(z.KS2)) zon("parametros", "KS2", "valor de KS2 (blindagem interna)");
    if (L3 && falta(z.L3.cz)) zon("parametros", "cz", "valor do patrimônio cultural da zona (cz)");
    if (L4) {
      const t = (z.L4.ca ?? 0) + (z.L4.cb ?? 0) + (z.L4.cc ?? 0) + (z.L4.cs ?? 0);
      if (!(t > 0)) zon("parametros", "L4", "valores econômicos da zona (animais, edificação, conteúdo, sistemas)");
    }
  });

  return out;
}

export type StatusEtapa = "completa" | "pendente";

export function statusEtapasRisco(d: EntradaRisco): Record<Exclude<EtapaRisco, "resultados">, StatusEtapa> {
  const p = pendenciasRisco(d);
  const st = (etapa: EtapaRisco): StatusEtapa => (p.some((x) => x.etapa === etapa) ? "pendente" : "completa");
  return { estrutura: st("estrutura"), linhas: st("linhas"), zonas: st("zonas"), parametros: st("parametros") };
}
