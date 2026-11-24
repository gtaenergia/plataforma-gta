import dados from "./data/ng-municipios.json";

/**
 * Densidade de descargas atmosféricas NG por município — Tabela F.1 da
 * ABNT NBR 5419-2:2026 (Anexo F). A norma exige que o NG venha exclusivamente
 * deste anexo (A.1.3), por isso a busca usa a tabela e não outra fonte.
 * Extraída do PDF da norma: 5 572 linhas (os 5 570 municípios do IBGE mais as
 * duas lagoas que a malha municipal de 2021 traz no RS).
 */

type Linha = [string, string, number];
const LISTA = dados as Linha[];

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .trim();

const INDICE = LISTA.map(([nome, uf, ng]) => ({ nome, uf, ng, chave: sem(nome) }));

export interface MunicipioNg {
  nome: string;
  uf: string;
  ng: number;
}

/** Busca por nome (sem acento), opcionalmente "cidade - UF" / "cidade/UF". */
export function buscarNg(q: string, limite = 15): MunicipioNg[] {
  const m = q.match(/^(.*?)[\s,/-]+([A-Za-z]{2})$/);
  const termo = sem(m ? m[1] : q);
  const uf = m ? m[2].toUpperCase() : null;
  if (termo.length < 2) return [];
  const comeca: MunicipioNg[] = [];
  const contem: MunicipioNg[] = [];
  for (const r of INDICE) {
    if (uf && r.uf !== uf) continue;
    if (r.chave.startsWith(termo)) comeca.push(r);
    else if (r.chave.includes(termo)) contem.push(r);
  }
  return [...comeca, ...contem].slice(0, limite).map(({ nome, uf: u, ng }) => ({ nome, uf: u, ng }));
}
