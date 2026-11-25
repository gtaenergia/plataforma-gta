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

/** NBR 5419-3:2026 — Tabela 2 (esfera e malha), Tabela 5 (descidas e anéis) e Tabela 11 (ki). */
const SPDA_TABELA: Record<NivelSpda, { esfera: number; malha: number; descidas: number; aneis: number; ki: number }> = {
  I: { esfera: 20, malha: 5, descidas: 10, aneis: 10, ki: 0.08 },
  II: { esfera: 30, malha: 10, descidas: 10, aneis: 10, ki: 0.06 },
  III: { esfera: 45, malha: 15, descidas: 15, aneis: 15, ki: 0.04 },
  IV: { esfera: 60, malha: 20, descidas: 20, aneis: 20, ki: 0.04 },
};

/** Corrente de pico do primeiro impulso positivo por NP (ABNT NBR 5419-1:2026, Tabela 3). */
export const CORRENTE_NP: Record<NivelSpda, number> = { I: 200, II: 150, III: 100, IV: 100 };

export interface RequisitosSpda {
  nivel: NivelSpda;
  pb: number;
  pbRotulo: string;
  cartoes: { valor: string; rotulo: string; ref: string }[];
  captacao: string[];
  descida: string[];
  aterramento: string[];
  equipotencializacao: string[];
  nota: string;
}

export function requisitosSpda(entrada: EntradaRisco): RequisitosSpda | null {
  const nivel = nivelDoPb(entrada.estrutura.PB);
  if (!nivel) return null;
  const t = SPDA_TABELA[nivel];
  const L = entrada.estrutura.L ?? 0;
  const W = entrada.estrutura.W ?? 0;
  const H = entrada.estrutura.H ?? 0;
  const perimetro = 2 * (L + W);
  const minDescidas = perimetro > 0 ? Math.max(2, Math.ceil(perimetro / t.descidas - 1e-9)) : 2;
  const kc = minDescidas >= 3 ? 0.44 : 0.66;
  // 7.3.2 f): um ano para áreas classificadas 0, 1, 20 e 21 e explosivos (rf de "Zonas 0/20" ou "Zonas 1/21").
  const inspecaoAnual = entrada.zonas.some((z) => z.rf === "explosao-z0" || z.rf === "explosao-z1");
  const captacao = [
    `Raio da esfera rolante: ${t.esfera} m`,
    `Módulo da malha de captação: máximo ${t.malha} × ${t.malha} m`,
    "Ângulo de proteção conforme a Figura 1, só até a altura-limite de cada nível (5.3.2.8 e 5.3.2.11)",
    "Captores nos cantos salientes, pontas expostas e beiradas, principalmente no nível superior das fachadas (5.3.2.1)",
    "Captores verticais interligados entre si no topo da estrutura (5.3.1.5)",
    "Coberturas com inclinação acima de 10%: condutores da malha sobre as cumeeiras (5.3.2.6)",
  ];
  if (H > 60) {
    captacao.push("Estrutura acima de 60 m: verificar descargas laterais nos 20% superiores da altura, pela esfera rolante de NP IV, e prever captação lateral (5.3.2.14.2)");
  }
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
    captacao,
    descida: [
      `Distância máxima entre condutores de descida: ${t.descidas} m`,
      `Distância máxima entre anéis intermediários: ${t.aneis} m`,
      perimetro > 0
        ? `Mínimo de ${minDescidas} condutores de descida (perímetro de ${fmt1(perimetro)} m ÷ ${t.descidas} m, nunca menos de 2 — 5.4.3.1)`
        : "Mínimo de 2 condutores de descida (perímetro ÷ distância entre descidas — 5.4.3.1)",
      "Espaçamento o mais uniforme possível, com preferência pelos cantos da estrutura (5.4.3.1)",
      "Descidas retas e verticais, no caminho mais curto até o solo, evitando laços (5.4.4.2)",
      "Conexão de ensaio em cada descida, perto do solo (sugestão: 1,5 m do piso), exceto descidas naturais ligadas ao aterramento natural (5.4.6)",
      "Estrutura metálica ou armadura contínua do concreto armado pode ser descida natural (5.4.5)",
    ],
    aterramento: [
      "Ordem de preferência: armadura da fundação com interligação horizontal; armadura sem interligação (com condutor enterrado); anel fechado (5.5.2.1)",
      "Eletrodo em anel enterrado a no mínimo 0,5 m, a cerca de 1 m das paredes externas (5.5.3)",
      nivel === "III" || nivel === "IV"
        ? "Comprimento mínimo l1 da Figura 3: para NP III e IV, independe da resistividade do solo"
        : `Comprimento mínimo l1 da Figura 3, em função da resistividade ρ do solo (acima de 3 000 Ω·m: l1 = ${nivel === "I" ? "0,03ρ − 10" : "0,02ρ − 11"} m)`,
      "Se o raio médio re da área do eletrodo for menor que l1: hastes verticais lv = (l1 − re)/2 ou radiais lr = l1 − re em cada descida (5.5.2.4)",
      "Dispensa a complementação: fundação interligada com pelo menos dez descidas naturais, ou re ≥ l1 (5.5.2.3)",
      "Um único aterramento integrado para energia, sinal e SPDA (5.5.1.3)",
    ],
    equipotencializacao: [
      "BEP na base da estrutura, ligada diretamente ao aterramento (6.2.2.2 b)",
      "Linhas que entram na estrutura: todos os condutores na BEP; os vivos, por DPS classe I (6.2.4.2)",
      "Condutores entre barras e para o aterramento: cobre 16 mm², alumínio 25 mm², aço 50 mm² (Tabela 9)",
      "Instalações metálicas internas até as barras: cobre 6 mm², alumínio 10 mm², aço 16 mm² (Tabela 10)",
      `Distância de segurança s = ki · kc · l / km: ki = ${fmt1(t.ki, 2)} (Tabela 11), kc = ${fmt1(kc, 2)} com ${minDescidas >= 3 ? "3 ou mais descidas" : "2 descidas"} (Tabela 13), km = 1 no ar e 0,5 em sólido (Tabela 12)`,
      inspecaoAnual
        ? "Inspeção periódica a cada ano: estrutura com áreas classificadas 0, 1, 20 ou 21 (7.3.2 f)"
        : "Inspeção periódica a cada 3 anos; a cada ano em áreas classificadas 0, 1, 20 e 21, explosivos, corrosão severa ou serviços essenciais (7.3.2 f)",
    ],
    nota:
      "O espaçamento entre descidas pode variar até 20% em relação à Tabela 5, sem reduzir o número de descidas (5.4.3.3). Uma das dimensões do módulo da malha pode ser aumentada em até 25%, desde que o perímetro do módulo não aumente (5.3.2.7). Materiais e condições de uso na Tabela 6; seções mínimas de captação e descidas na Tabela 7 (por exemplo, 35 mm² em cobre, 70 mm² em alumínio, 50 mm² em aço zincado a quente) e de eletrodos de aterramento na Tabela 8 (50 mm² em cobre).",
  };
}

/** Tabela D.1 da NBR 5419-4 — valores preferenciais de Iimp (kA) com carga Q (C) e energia específica W/R (kJ/Ω). */
export const IIMP_PREFERENCIAIS = [1, 2, 5, 10, 12.5, 20, 25].map((kA) => ({ kA, Q: kA * 0.5, WR: kA * kA * 0.25 }));

/** W/R como impresso na Tabela D.1: inteiro a partir de 10 kJ/Ω (39 e 156, não 39,06 e 156,25). */
export function fmtWR(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 0 : 2 });
}

/** Valores da Tabela D.1 adotados no dimensionamento (linhas de energia). */
export function iimpAdotados(d: RequisitosDps): Set<number> {
  return new Set(d.dimensionamento.porCondutor.flatMap((p) => (p.adotado != null ? [p.adotado] : [])));
}

/** Valores por condutor das Tabelas E.1 (energia em BT) e E.2 (sinal) da NBR 5419-1:2026, em kA, 10/350 µs. */
const TABELA_E: Record<"energia" | "sinal", Record<"I" | "II" | "III-IV", { S3: number; S1: number }>> = {
  energia: { "III-IV": { S3: 5, S1: 12.5 }, II: { S3: 7.5, S1: 18.75 }, I: { S3: 10, S1: 25 } },
  sinal: { "III-IV": { S3: 1, S1: 1.25 }, II: { S3: 1.5, S1: 1.875 }, I: { S3: 2, S1: 2.5 } },
};

/** Mínimo por modo de proteção para DPS classe I de energia (ABNT NBR 5410, 6.3.5.2.4 d). */
export const IIMP_MINIMO_5410 = 12.5;

export interface IimpLinha {
  linha: string;
  tipo: "energia" | "sinal";
  condutores: number;
  /** S1 — parcela da descarga na estrutura, por condutor (NBR 5419-1, E.2). Só para energia. */
  s1: number | null;
  /** S3 — descarga direta na linha, por condutor (Tabela E.1/E.2). */
  s3: number;
  /** Valor típico por condutor da Tabela E.2 para S1 (linhas de sinal). */
  tabelaSinal: number | null;
  exigido: number;
  /** Valor preferencial da Tabela D.1 (só energia). */
  adotado: number | null;
  criterio: string;
}

export interface RequisitosDps {
  np: "I" | "II" | "III-IV";
  peb: number;
  pebRotulo: string;
  classes: { classe: string; ensaio: string; onda: string; uso: string; adotada: boolean }[];
  instalacao: string[];
  dimensionamento: {
    npCorrente: NivelSpda;
    origemNp: string;
    total: number;
    aterramento: number;
    linhas: number;
    nLinhas: number;
    porLinha: number;
    porCondutor: IimpLinha[];
  };
  nota: string;
}

const RIGOR: Record<NivelSpda, number> = { I: 4, II: 3, III: 2, IV: 1 };

/** Conclusão de uma linha: o Iimp a especificar por condutor. */
export function textoIimp(p: IimpLinha): string {
  if (p.tipo === "sinal") return `Iimp ≥ ${fmt1(p.exigido, 3)} kA por condutor (DPS de sinal, IEC 61643-21)`;
  if (p.adotado != null) return `Iimp ≥ ${fmt1(p.adotado, 1)} kA por condutor`;
  return `Iimp ≥ ${fmt1(p.exigido, 2)} kA por condutor — acima de 25 kA, consultar o fabricante`;
}

export function requisitosDps(entrada: EntradaRisco): RequisitosDps | null {
  const np = nivelDoPeb(entrada.estrutura.PEB);
  if (!np) return null;
  // A corrente a repartir é a do NP mais rigoroso entre o SPDA (a ligação
  // equipotencial do SPDA segue o NP dele — NBR 5419-3, 6.2.4.7) e o DPS
  // classe I (o PEB adotado pressupõe DPS projetado para esse NP — Tabela B.7).
  const nivelSpda = nivelDoPb(entrada.estrutura.PB);
  const nivelDps: NivelSpda = np === "III-IV" ? "III" : np;
  const npCorrente: NivelSpda = nivelSpda && RIGOR[nivelSpda] > RIGOR[nivelDps] ? nivelSpda : nivelDps;
  const origemNp =
    nivelSpda && npCorrente === nivelSpda && nivelSpda !== nivelDps
      ? `SPDA nível ${nivelSpda}, mais rigoroso que o DPS NP ${np}`
      : nivelSpda === npCorrente
        ? `SPDA nível ${nivelSpda} e DPS NP ${np}`
        : `DPS NP ${np}${nivelSpda ? `, mais rigoroso que o SPDA nível ${nivelSpda}` : ""}`;
  const npTabela: "I" | "II" | "III-IV" = npCorrente === "III" || npCorrente === "IV" ? "III-IV" : npCorrente;
  const total = CORRENTE_NP[npCorrente];
  const metalicas = entrada.linhas.filter((l) => !["sem-linha-externa", "interface-isolante"].includes(l.clc));
  const nLinhas = Math.max(1, metalicas.length);
  // E.2.1.4: ke = 0,5 — metade pelo aterramento, metade pelas n linhas.
  const porLinha = total / 2 / nLinhas;
  const porCondutor: IimpLinha[] = metalicas.map((l) => {
    const n = Math.max(1, l.condutores);
    const tab = TABELA_E[l.tipo][npTabela];
    if (l.tipo === "sinal") {
      // E.2.3, nota 2: a divisão pelas equações superestima as linhas de sinal;
      // vale a Tabela E.2. Linha blindada: metade (E.6.2).
      const fator = l.blindagem !== "nao-blindada" ? 0.5 : 1;
      const s1 = tab.S1 * fator;
      const s3 = tab.S3 * fator;
      const exigido = Math.max(s1, s3);
      return {
        linha: l.nome,
        tipo: "sinal",
        condutores: n,
        s1: null,
        s3,
        tabelaSinal: s1,
        exigido,
        adotado: null,
        criterio: `Tabela E.2 (NP ${npTabela})${fator < 1 ? ", linha blindada × 0,5" : ""}: S1 ${fmt1(s1, 3)} kA, S3 ${fmt1(s3, 3)} kA por condutor`,
      };
    }
    const s1 = porLinha / n;
    // Tabela E.1, nota c: S3 para linha trifásica com neutro; com dois condutores, o dobro.
    const s3 = tab.S3 * (n <= 2 ? 2 : 1);
    const exigido = Math.max(s1, s3, IIMP_MINIMO_5410);
    const adotado = IIMP_PREFERENCIAIS.find((v) => v.kA + 1e-9 >= exigido)?.kA ?? null;
    const motivo = exigido === s1 ? "S1" : exigido === s3 ? "S3" : "mínimo da NBR 5410";
    return {
      linha: l.nome,
      tipo: "energia",
      condutores: n,
      s1,
      s3,
      tabelaSinal: null,
      exigido,
      adotado,
      criterio: `S1 ${fmt1(porLinha, 2)} ÷ ${n} = ${fmt1(s1, 2)} kA; S3 (Tabela E.1) ${fmt1(s3, 2)} kA; mínimo NBR 5410 ${fmt1(IIMP_MINIMO_5410, 1)} kA — prevalece ${motivo}`,
    };
  });
  return {
    np,
    peb: valor(PEB, entrada.estrutura.PEB),
    pebRotulo: rotulo(PEB, entrada.estrutura.PEB),
    classes: [
      { classe: "Classe I (Iimp)", ensaio: "Iimp conforme o dimensionamento (NBR 5419-1, Anexo E)", onda: "10/350 µs", uso: "Entrada das linhas (fronteira ZPR 0A/1)", adotada: true },
      { classe: "Classe II (In)", ensaio: "In e Imáx", onda: "8/20 µs", uso: "Quadros de distribuição (fronteira ZPR 1/2)", adotada: false },
      { classe: "Classe III (Uoc)", ensaio: "Onda combinada", onda: "1,2/50 µs e 8/20 µs", uso: "Junto ao equipamento protegido", adotada: false },
    ],
    instalacao: [
      "DPS classe I na entrada de cada linha, o mais perto possível do ponto de entrada (C.3.2)",
      "Todos os condutores vivos ligados à BEP por DPS classe I; PE/PEN direto ou por DPS (NBR 5419-3, 6.2.4.2)",
      "DPS classe II nos quadros de distribuição (ZPR 1/2) e classe III junto aos equipamentos sensíveis, coordenados com o classe I (C.3.4)",
      "Tensão de proteção efetiva Up/f = Up + ΔU menor que a tensão suportável Uw do equipamento (C.1.10)",
      "Condutores de conexão em cobre: 16 mm² (classe I), 6 mm² (classe II), 2,5 mm² (classe III) — Tabela 1",
      "Equipotencialização na fronteira de cada ZPR (5.5); DPS de sinal conforme a IEC 61643-21",
    ],
    dimensionamento: {
      npCorrente,
      origemNp,
      total,
      aterramento: total / 2,
      linhas: total / 2,
      nLinhas,
      porLinha,
      porCondutor,
    },
    nota:
      "Se a estrutura necessitar de SPDA, devem ser utilizados DPS ensaiados na classe I (C.1.7). A corrente de cada linha segue a NBR 5419-1, Anexo E: metade da corrente do NP pelo aterramento (ke = 0,5) e metade dividida igualmente entre as linhas e entre os condutores de cada linha (E.2), comparada com a descarga direta na linha (S3, Tabelas E.1 e E.2). Tubulações metálicas que entram na estrutura também dividem a corrente (E.2.1.2); aqui contam só as linhas elétricas, o que é conservador. Para energia, Iimp não menor que 12,5 kA por modo de proteção (NBR 5410, 6.3.5.2.4 d, citada em D.3.2.2), escolhido entre os valores preferenciais da Tabela D.1 (conexão CT1).",
  };
}

function fmt1(v: number, casas = 1): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
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
  const metalicas = entrada.linhas.filter((l) => !["sem-linha-externa", "interface-isolante"].includes(l.clc));
  if (nivelDoPb(e.PB) && !nivelDoPeb(e.PEB) && metalicas.length) {
    obs.push("Com SPDA, todas as linhas que entram na estrutura precisam de ligação equipotencial, com os condutores vivos ligados por DPS classe I (NBR 5419-3, 6.2.4.2 e NBR 5419-4, C.1.7). Revise o PEB adotado.");
  }
  const naoReduzivel = r.criterios.filter((c) => !c.ok);
  if (naoReduzivel.length && (e.PB === "I" || e.PB === "I-descida-natural" || e.PB === "cobertura-metalica") && (e.PEB === "I" || e.PEB.startsWith("melhor"))) {
    obs.push("Mesmo com o nível de proteção mais alto, há critério acima do tolerável: o proprietário deve ser informado e o mais alto nível de proteção providenciado (5.4.6 e 7.3.8).");
  }
  return obs;
}
