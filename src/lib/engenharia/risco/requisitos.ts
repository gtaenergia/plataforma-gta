/**
 * Requisitos mínimos que decorrem das medidas adotadas na análise de risco:
 * SPDA (ABNT NBR 5419-3:2026) a partir do PB, e DPS (ABNT NBR 5419-4:2026) a
 * partir do PEB. É texto de orientação para o laudo — o projeto do SPDA e a
 * especificação dos DPS seguem as próprias normas.
 */

import { PB, PEB, rotulo, valor } from "./tabelas";
import type { EntradaRisco } from "./tipos";
import { estruturaComExplosao, estruturaEfetiva, type ResultadoRisco } from "./motor";

export type NivelSpda = "I" | "II" | "III" | "IV";

/** Nível de proteção do SPDA implícito no PB escolhido (null = sem SPDA). */
export function nivelDoPb(pbId: string): NivelSpda | null {
  switch (pbId) {
    case "IV":
    case "III":
    case "II":
    case "I":
      return pbId;
    case "I-descida-natural":
    case "cobertura-metalica":
      return "I";
    default:
      return null;
  }
}

/** NP do DPS classe I implícito no PEB escolhido (null = sem DPS classe I). */
export function nivelDoPeb(pebId: string): "I" | "II" | "III-IV" | null {
  switch (pebId) {
    case "III-IV":
      return "III-IV";
    case "II":
      return "II";
    case "I":
    case "melhor-I":
    case "melhor-I-0001":
      return "I";
    default:
      return null;
  }
}

const SPDA_TABELA: Record<NivelSpda, { esfera: number; malha: number; descidas: number; aneis: number }> = {
  I: { esfera: 20, malha: 5, descidas: 10, aneis: 10 },
  II: { esfera: 30, malha: 10, descidas: 10, aneis: 10 },
  III: { esfera: 45, malha: 15, descidas: 15, aneis: 15 },
  IV: { esfera: 60, malha: 20, descidas: 20, aneis: 20 },
};

/** Corrente de pico da primeira descarga para dimensionamento, por NP (ABNT NBR 5419-1). */
export const CORRENTE_NP: Record<"I" | "II" | "III" | "IV", number> = { I: 200, II: 150, III: 100, IV: 100 };

export interface RequisitosSpda {
  nivel: NivelSpda;
  pb: number;
  pbRotulo: string;
  cartoes: { valor: string; rotulo: string; ref: string }[];
  captacao: string[];
  descida: string[];
  aterramento: string[];
  nota: string;
}

export function requisitosSpda(entrada: EntradaRisco): RequisitosSpda | null {
  const nivel = nivelDoPb(entrada.estrutura.PB);
  if (!nivel) return null;
  const t = SPDA_TABELA[nivel];
  const L = entrada.estrutura.L ?? 0;
  const W = entrada.estrutura.W ?? 0;
  const perimetro = 2 * (L + W);
  const minDescidas = perimetro > 0 ? Math.max(2, Math.ceil(perimetro / t.descidas)) : 2;
  return {
    nivel,
    pb: valor(PB, entrada.estrutura.PB),
    pbRotulo: rotulo(PB, entrada.estrutura.PB),
    cartoes: [
      { valor: `${t.esfera} m`, rotulo: "Raio da esfera rolante", ref: "Tabela 2 — NBR 5419-3" },
      { valor: `${t.malha} × ${t.malha} m`, rotulo: "Módulo da malha de captação", ref: "Tabela 2 — NBR 5419-3" },
      { valor: `${t.descidas} m`, rotulo: "Distância entre descidas", ref: "Tabela 5 — NBR 5419-3" },
      { valor: `${t.aneis} m`, rotulo: "Distância entre anéis intermediários", ref: "Tabela 5 — NBR 5419-3" },
    ],
    captacao: [
      `Raio da esfera rolante: ${t.esfera} m`,
      `Módulo da malha de captação: máximo ${t.malha} × ${t.malha} m`,
      "Ângulo de proteção conforme a Figura 1 da norma",
      "Captores nos cantos, pontas expostas e beiradas superiores",
      "Captores verticais interconectados no topo",
    ],
    descida: [
      `Distância máxima entre condutores de descida: ${t.descidas} m`,
      `Distância máxima entre anéis intermediários: ${t.aneis} m`,
      perimetro > 0
        ? `Mínimo de ${minDescidas} condutores de descida (perímetro de ${fmt1(perimetro)} m ÷ ${t.descidas} m)`
        : "Mínimo de 2 condutores de descida (perímetro ÷ distância entre descidas)",
      "Priorizar os cantos da estrutura no posicionamento",
      "Estrutura metálica ou concreto armado contínuo pode ser descida natural",
    ],
    aterramento: [
      "Comprimento mínimo l1 conforme a Figura 3 da norma (função da resistividade do solo)",
      "Eletrodo em anel enterrado a no mínimo 0,5 m de profundidade",
      "Distância de cerca de 1 m das paredes externas",
      "Preferencialmente: armadura da fundação com interligação horizontal",
      "Complementação com hastes verticais ou radiais quando re < l1",
    ],
    nota:
      "Os condutores de descida podem ter tolerância de até 20% no espaçamento (Tabela 5, 5.4.3.3). Uma das dimensões da malha pode ser aumentada em até 25%, desde que o perímetro do módulo não aumente (5.3.2.7). Materiais: cobre, aço zincado a quente, alumínio ou aço inoxidável conforme as Tabelas 6 e 7 da NBR 5419-3.",
  };
}

/** Tabela D.1 da NBR 5419-4 — valores preferenciais de Iimp (kA) com carga Q (C) e energia específica W/R (kJ/Ω). */
export const IIMP_PREFERENCIAIS = [1, 2, 5, 10, 12.5, 20, 25].map((kA) => ({ kA, Q: kA * 0.5, WR: kA * kA * 0.25 }));

export interface RequisitosDps {
  np: "I" | "II" | "III-IV";
  peb: number;
  pebRotulo: string;
  classes: { classe: string; ensaio: string; onda: string; uso: string; adotada: boolean }[];
  instalacao: string[];
  dimensionamento: {
    npCorrente: "I" | "II" | "III" | "IV";
    origemNp: string;
    total: number;
    aterramento: number;
    linhas: number;
    nLinhas: number;
    porLinha: number;
    porCondutor: { linha: string; condutores: number; kA: number; adotado: number | null }[];
  };
  nota: string;
}

export function requisitosDps(entrada: EntradaRisco): RequisitosDps | null {
  const np = nivelDoPeb(entrada.estrutura.PEB);
  if (!np) return null;
  // A corrente a repartir é a da descarga para a qual a estrutura está protegida:
  // o NP do SPDA, se houver; sem SPDA, o NP do próprio DPS classe I.
  const nivelSpda = nivelDoPb(entrada.estrutura.PB);
  const npCorrente: "I" | "II" | "III" | "IV" = nivelSpda ?? (np === "III-IV" ? "III" : np);
  const total = CORRENTE_NP[npCorrente];
  const metalicas = entrada.linhas.filter((l) => !["sem-linha-externa", "interface-isolante"].includes(l.clc));
  const nLinhas = Math.max(1, metalicas.length);
  const porLinha = total / 2 / nLinhas;
  return {
    np,
    peb: valor(PEB, entrada.estrutura.PEB),
    pebRotulo: rotulo(PEB, entrada.estrutura.PEB),
    classes: [
      { classe: "Classe I (Iimp)", ensaio: "Conforme dimensionamento (Anexo D)", onda: "10/350 µs", uso: "Entrada da linha (fronteira ZPR 0A/1)", adotada: true },
      { classe: "Classe II (In)", ensaio: "In conforme coordenação", onda: "8/20 µs", uso: "Quadros secundários (fronteira ZPR 1/2)", adotada: false },
      { classe: "Classe III (Isc)", ensaio: "Onda combinada", onda: "8/20 µs", uso: "Próximo ao equipamento protegido", adotada: false },
    ],
    instalacao: [
      "DPS classe I na entrada (fronteira ZPR 0A/1): Iimp conforme o dimensionamento do Anexo D",
      "DPS classe II nos quadros secundários (fronteira ZPR 1/2), coordenado com o classe I",
      "DPS classe III próximo aos equipamentos sensíveis: onda combinada",
      "Nível de proteção Up/f menor que a tensão suportável Uw do equipamento",
      "Coordenação entre DPS conforme IEC 61643-12 / ABNT NBR 5410",
      "Equipotencialização na fronteira de cada ZPR",
    ],
    dimensionamento: {
      npCorrente,
      origemNp: nivelSpda ? `SPDA nível ${nivelSpda}` : `DPS ${np === "III-IV" ? "NP III-IV" : `NP ${np}`}`,
      total,
      aterramento: total / 2,
      linhas: total / 2,
      nLinhas,
      porLinha,
      porCondutor: metalicas.map((l) => {
        const kA = porLinha / Math.max(1, l.condutores);
        const adotado = IIMP_PREFERENCIAIS.find((v) => v.kA + 1e-9 >= kA)?.kA ?? null;
        return { linha: l.nome, condutores: l.condutores, kA, adotado };
      }),
    },
    nota:
      "Se a estrutura necessitar de SPDA, devem ser utilizados DPS ensaiados na classe I (C.1.7). O DPS protege adequadamente quando Up/f < Uw do equipamento (C.1.10). A repartição da corrente entre as linhas e os condutores ativos deve ser feita conforme a ABNT NBR 5419-4:2026; o DPS deve ser especificado com Iimp igual ou superior ao valor resultante, escolhido entre os valores preferenciais da Tabela D.1. Para DPS de sinal, seguir a IEC 61643-21.",
  };
}

function fmt1(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Observações que a norma pede para registrar conforme o caso — vão para a
 * tela de resultados e para o parecer do laudo.
 */
export function observacoesNorma(entrada: EntradaRisco, r: ResultadoRisco): string[] {
  const obs: string[] = [];
  const e = entrada.estrutura;
  if (e.NG != null && !e.cidade) {
    obs.push("NG informado manualmente: para a análise de risco, a norma exige os valores do Anexo F, Tabela F.1 (A.1.3).");
  }
  const semEfeito = entrada.zonas.filter((z) => !estruturaEfetiva(e.PB, z.PTA));
  const ptaIgnorado = semEfeito.filter((z) => z.PTA !== "nenhuma").map((z) => z.nome);
  if (ptaIgnorado.length) {
    obs.push(`${ptaIgnorado.join(", ")}: sem SPDA nem estrutura como descida natural, a medida contra toque/passo não reduz PA — adotado PTA = 1 (Tabela B.1, nota 1).`);
  }
  const dpsIgnorado = semEfeito.filter((z) => z.energia.PSPD !== "sem" || z.sinal.PSPD !== "sem").map((z) => z.nome);
  if (dpsIgnorado.length && entrada.linhas.length) {
    obs.push(`${dpsIgnorado.join(", ")}: sem SPDA nem estrutura como descida natural, o DPS coordenado não reduz PC — adotado PSPD = 1 no PC (Tabela B.3, nota 1); continua valendo em PM, PW e PZ.`);
  }
  const explosao = entrada.zonas.some((z) => z.rf.startsWith("explosao"));
  const rpForcado = estruturaComExplosao(entrada) ? entrada.zonas.filter((z) => z.rp !== "nenhuma").map((z) => z.nome) : [];
  if (rpForcado.length) {
    obs.push(`${rpForcado.join(", ")}: estrutura com risco de explosão — adotado rp = 1, qualquer que seja a providência contra incêndio (C.3.4 e Tabela C.4).`);
  }
  const nivel = nivelDoPb(e.PB);
  if (explosao && nivel !== "I" && nivel !== "II") {
    obs.push("Zona com risco de explosão: se a proteção for exigida pela autoridade competente, deve ser adotado no mínimo SPDA nível II (5.4.7).");
  }
  if (r.R1 && r.R1.excede && r.R1.componentes.RA + r.R1.componentes.RB < r.R1.RT) {
    obs.push("RA + RB < RT: um SPDA completo pode não ser necessário; ligações equipotenciais (diretas ou por DPS) conforme a ABNT NBR 5419-3 podem ser suficientes para R1 ≤ RT (Figura 1, nota a).");
  }
  const naoReduzivel = r.criterios.filter((c) => !c.ok);
  if (naoReduzivel.length && (e.PB === "I" || e.PB === "I-descida-natural" || e.PB === "cobertura-metalica") && (e.PEB === "I" || e.PEB.startsWith("melhor"))) {
    obs.push("Mesmo com o nível de proteção mais alto, há critério acima do tolerável: o proprietário deve ser informado e o mais alto nível de proteção providenciado (5.4.6 e 7.3.8).");
  }
  return obs;
}
