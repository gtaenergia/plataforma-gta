/**
 * Memorial de cálculo do quadro de cargas — ABNT NBR 5410:2004.
 * Seções 1 a 4 (objetivo, referências, normas, definições), 5 (metodologia,
 * com equações numeradas), 6 (resultados), 7 (anexos em paisagem) e fecho.
 */

import type { DadosProjeto } from "../tipos";
import { ORIGENS_QUEDA, LIMITE_TERMINAL, type DadosQuadro } from "../quadro/tipos";
import { C_MAX, C_MIN, calcularQuadros, type ResultadoCircuito, type ResultadoQuadro } from "../quadro/motor";
import { nomeGrupo, tempoSeccionamento, tensaoContatoLimite } from "../quadro/tabelas";
import { fmtData, fmtNum } from "../formato";
import { c, cr, type Bloco, type Celula, type Laudo, type LinhaTabela, type Trecho } from "./modelo";

/** "I_b = S / U_0" → trechos com subscrito; "S^2" → sobrescrito. */
function fx(s: string): Trecho[] {
  const out: Trecho[] = [];
  const rx = /([_^])(\{[^}]*\}|[A-Za-z0-9θΔ]+)/g;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s))) {
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    const corpo = m[2].startsWith("{") ? m[2].slice(1, -1) : m[2];
    out.push(m[1] === "_" ? { t: corpo, sub: true } : { t: corpo, sup: true });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  return out;
}

let numEq = 0;
const eq = (expr: string, onde: [string, string][], referencia: string): Bloco => ({ tipo: "equacao", numero: ++numEq, expressao: fx(expr), onde, referencia });
const p = (t: string): Bloco => ({ tipo: "paragrafo", texto: t });
const h1 = (t: string, quebra = false): Bloco => ({ tipo: "titulo", nivel: 1, texto: t, quebraAntes: quebra });
const h2 = (t: string): Bloco => ({ tipo: "titulo", nivel: 2, texto: t });
const h3 = (t: string): Bloco => ({ tipo: "titulo", nivel: 3, texto: t, sumario: false });

const v = (x: ResultadoCircuito["verif"][keyof ResultadoCircuito["verif"]]): Celula =>
  c(x === "ok" ? "Atende" : x === "falha" ? "Não atende" : "Faltam dados", { selo: x === "ok" ? "ok" : x === "falha" ? "falha" : "neutro" });

export function montarMemorialQuadro(projeto: DadosProjeto, dados: DadosQuadro, quadroId: string | null): Laudo {
  numEq = 0;
  const res = calcularQuadros(dados);
  const quadros: ResultadoQuadro[] = quadroId ? res.quadros.filter((q) => q.id === quadroId) : res.quadros;
  const cfg = dados.config;
  const nome = projeto.nome || "Projeto";
  const rt = projeto.rt;
  const origem = ORIGENS_QUEDA.find((o) => o.id === cfg.origemQueda)!;
  const tmax = tempoSeccionamento(res.U0, cfg.situacao);
  const listaQuadros = quadros.map((q) => q.nome).join(", ");
  const b: Bloco[] = [];

  // 1 a 4
  b.push(h1("1. Objetivo"));
  b.push(
    p(
      `Este memorial apresenta o dimensionamento dos circuitos ${quadros.length > 1 ? `dos quadros ${listaQuadros}` : `do quadro ${listaQuadros}`} da obra ${nome}${projeto.cliente ? `, de ${projeto.cliente}` : ""}: corrente de projeto, dispositivos de proteção, seção dos condutores (fase, neutro e proteção), quedas de tensão, correntes de curto-circuito e proteção contra choques elétricos por seccionamento automático, conforme a ABNT NBR 5410:2004.`,
    ),
  );
  b.push(h1("2. Documentos de Referência"));
  b.push({
    tipo: "lista",
    marcador: "ponto",
    itens: [
      "Quadro de cargas e dados de entrada informados no projeto (cargas, comprimentos e maneiras de instalar).",
      `Dados da alimentação: ${cfg.tensao} V, esquema ${cfg.esquema}, ${cfg.ikModo === "manual" ? `Ik presumido na origem de ${fmtNum(cfg.ikManual, 2)} kA` : `transformador de ${fmtNum(cfg.trafo.kva)} kVA, Z = ${fmtNum(cfg.trafo.z)}%`}.`,
      "Catálogos de fabricantes para energia passante (I²t) e curvas dos disjuntores, quando informados.",
    ],
  });
  b.push(h1("3. Normas Aplicáveis"));
  b.push({
    tipo: "lista",
    marcador: "ponto",
    itens: [
      "ABNT NBR 5410:2004 — Instalações elétricas de baixa tensão.",
      "ABNT NBR NM 280 — Condutores de cabos isolados (resistência elétrica dos condutores).",
      "ABNT NBR NM 60898 — Disjuntores para proteção de sobrecorrentes para instalações domésticas e similares.",
      "ABNT NBR IEC 60947-2 — Dispositivos de manobra e comando de baixa tensão — Disjuntores.",
      "IEC 60909-0 — Correntes de curto-circuito em sistemas trifásicos de corrente alternada (método das impedâncias).",
    ],
  });
  b.push(h1("4. Termos e Definições"));
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "Símbolo", peso: 0.6 }, { titulo: "Definição", peso: 3 }],
    linhas: [
      ["Ib", "Corrente de projeto do circuito, incluindo as componentes harmônicas (A)"],
      ["In", "Corrente nominal do dispositivo de proteção (A)"],
      ["Iz", "Capacidade de condução de corrente do condutor, já corrigida (A)"],
      ["I2", "Corrente que assegura a atuação do dispositivo de proteção (A)"],
      ["Im", "Corrente de disparo magnético (instantâneo) do disjuntor (A)"],
      ["Icu", "Capacidade de interrupção do disjuntor (kA)"],
      ["Ik", "Corrente de curto-circuito presumida (kA)"],
      ["Zs", "Impedância do percurso da corrente de falta (laço fase–PE) (Ω)"],
      ["Ia", "Corrente que assegura o seccionamento automático no tempo exigido (A)"],
      ["U0 / UL", `Tensão fase-neutro / fase-fase: ${res.U0} V / ${res.UL} V`],
      ["ΔV", "Queda de tensão, em porcentagem da tensão nominal"],
      ["k", "Fator que depende do material do condutor e da isolação (Tabela 30)"],
    ].map(([a, d]) => [c(a, { b: true }), c(d)]),
  });

  // 5 Metodologia
  b.push(h1("5. Metodologia", true));
  b.push(h2("5.1 Sequência de cálculo"));
  b.push({
    tipo: "lista",
    marcador: "ponto",
    itens: [
      "Potência e corrente de projeto de cada circuito, com fator de potência e harmônicas.",
      "Demanda por grupo de carga e corrente do alimentador (fase mais carregada).",
      "Escolha do disjuntor (Ib ≤ In) e da seção pelo maior dos critérios: capacidade de condução, queda de tensão, atuação magnética no ponto mais afastado e suportabilidade térmica.",
      "Seções do neutro e do condutor de proteção.",
      "Curto-circuito máximo (capacidade de interrupção e I²t) e mínimo (atuação magnética e proteção contra choques), pelo método das impedâncias.",
    ],
  });

  b.push(h2("5.2 Corrente de projeto"));
  b.push(h3("5.2.1 Potência da carga"));
  b.push(eq("P = Σ (n_i · P_i) + P_esp ;  S = P / cos φ ;  Q = √(S^2 − P^2)", [["P", "Potência ativa do circuito (W)"], ["n_i · P_i", "Quantidade × potência unitária de cada tipo de carga (W)"], ["P_esp", "Carga especial (W)"], ["cos φ", "Fator de potência da carga"]].map(([a, d]) => [a.replace(/_/g, ""), d]) as [string, string][], "ABNT NBR 5410:2004, 4.2.1.1"));
  b.push(h3("5.2.2 Corrente do circuito"));
  b.push(eq("I_b = S / U_0  (F+N)   ·   I_b = S / U_L  (2F)   ·   I_b = S / (2·U_0)  (2F+N)   ·   I_b = S / (√3 · U_L)  (3F)", [["S", "Potência aparente (VA)"], ["U0, UL", `Tensões nominais: ${res.U0} V e ${res.UL} V`]], "ABNT NBR 5410:2004, 6.2.5"));
  b.push(eq("I_b = I_1 · √(1 + THD^2)", [["I1", "Corrente fundamental (A)"], ["THD", "Taxa de distorção harmônica da corrente (3ª e múltiplas)"]], "ABNT NBR 5410:2004, 6.2.7.4 (nota 1) e Anexo F"));
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "Tensão nominal", peso: 1 }, { titulo: "U0 (V)", peso: 1, align: "right" }, { titulo: "UL (V)", peso: 1, align: "right" }],
    linhas: [
      [c("127/220 V", { b: cfg.tensao === "127/220" }), cr("127"), cr("220")],
      [c("220/380 V", { b: cfg.tensao === "220/380" }), cr("220"), cr("380")],
    ],
    legenda: "Tensões nominais adotadas.",
  });
  b.push(h3("5.2.3 Demanda do quadro e corrente do alimentador"));
  b.push(eq("P_d = Σ (FD_g · P_{inst,g}) ;  I_{b,alim} = máx (I_A, I_B, I_C)", [["FDg", "Fator de demanda do grupo de carga g"], ["IA, IB, IC", "Correntes demandadas em cada fase (soma dos circuitos ligados à fase)"]], "Fatores de demanda conforme a norma de fornecimento da distribuidora"));

  b.push(h2("5.3 Dispositivo de proteção contra sobrecorrentes"));
  b.push(eq("I_b ≤ I_n ≤ I_z   e   I_2 ≤ 1,45 · I_z", [["I2", "Corrente convencional de atuação; para disjuntores NBR NM 60898 / IEC 60947-2, I2 = 1,45 · In, logo atendida quando In ≤ Iz"]], "ABNT NBR 5410:2004, 5.3.4.1"));

  b.push(h2("5.4 Capacidade de condução de corrente em regime permanente"));
  b.push(eq("I_z = I_{z,tab} · k_1 · k_2 · k_4 · n", [["Iz,tab", "Capacidade das Tabelas 36 a 39, pelo método de referência e nº de condutores carregados"], ["k1", "Fator de temperatura (Tabela 40)"], ["k2", "Fator de agrupamento (Tabelas 42 a 45)"], ["k4", "0,86 para quatro condutores carregados (THD > 15%, 6.2.5.6.1)"], ["n", "Condutores em paralelo por fase"]], "ABNT NBR 5410:2004, 6.2.5"));
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "Isolação", peso: 1.6 }, { titulo: "Serviço contínuo (°C)", peso: 1, align: "right" }, { titulo: "Sobrecarga (°C)", peso: 1, align: "right" }, { titulo: "Curto-circuito (°C)", peso: 1, align: "right" }],
    linhas: [
      [c("PVC até 300 mm²"), cr("70"), cr("100"), cr("160")],
      [c("PVC acima de 300 mm²"), cr("70"), cr("100"), cr("140")],
      [c("EPR / XLPE"), cr("90"), cr("130"), cr("250")],
    ],
    legenda: "Tabela 35 — Temperaturas características dos condutores.",
  });

  b.push(h2("5.5 Condutor neutro"));
  b.push(p("Em circuitos monofásicos e bifásicos com neutro, o neutro tem a seção da fase (6.2.6.2.2 e 6.2.6.2.4). Em circuitos trifásicos com taxa de 3ª harmônica acima de 15%, o neutro não pode ser reduzido (6.2.6.2.3); abaixo disso, com fase acima de 25 mm², circuito equilibrado e neutro protegido, a seção pode seguir a Tabela 48 (6.2.6.2.6)."));
  b.push(h2("5.6 Condutor de proteção"));
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "Seção da fase S (mm²)", peso: 1 }, { titulo: "Seção mínima do PE (mm²)", peso: 1 }],
    linhas: [[c("S ≤ 16"), c("S")], [c("16 < S ≤ 35"), c("16")], [c("S > 35"), c("S/2 (seção padronizada mais próxima)")]],
    legenda: "Tabela 58 — Seção mínima do condutor de proteção (6.4.3.1.3).",
  });

  b.push(h2("5.7 Queda de tensão"));
  b.push(eq("ΔV% = b · I_b · L · (R·cos φ + X·sen φ) / (n · U) · 100", [["b", "2 (F+N, referida a U0; 2F, referida a UL); 1,5 (2F+N equilibrado, referida a U0); √3 (trifásico, referida a UL)"], ["L", "Comprimento do circuito (km)"], ["R, X", "Resistência na temperatura de serviço e reatância do condutor (Ω/km)"], ["n", "Condutores em paralelo por fase"]], "ABNT NBR 5410:2004, 6.2.7"));
  b.push(p(`Limites adotados: ${origem.limite}% da origem até qualquer ponto de utilização (${origem.rotulo.toLowerCase()}, ${origem.ref}) e ${LIMITE_TERMINAL}% no circuito terminal (6.2.7.2). Na seção automática, o alimentador é dimensionado para até ${Math.max(1, origem.limite - LIMITE_TERMINAL)}% acumulados, deixando os ${LIMITE_TERMINAL}% para os circuitos terminais; quando isso não é possível, vale só o limite global.`));
  if (res.quedaOrigem) {
    b.push(p(`Cabo do transformador até a origem: ${fmtNum(cfg.caboOrigem.comprimento)} m, ${fmtNum(cfg.caboOrigem.secao)} mm²${cfg.caboOrigem.condutoresPorFase > 1 ? ` × ${cfg.caboOrigem.condutoresPorFase} por fase` : ""}, com a demanda de todos os quadros (Ib = ${fmtNum(res.quedaOrigem.Ib, 1)} A, cos φ = ${fmtNum(res.quedaOrigem.fp, 2)}): queda de ${fmtNum(res.quedaOrigem.dv, 2)}%, somada à queda de cada alimentador.`));
  }

  b.push(h2("5.8 Curto-circuito máximo"));
  b.push(eq(`c_{máx} = ${fmtNum(C_MAX, 2)} ;  c_{mín} = ${fmtNum(C_MIN, 2)}`, [["c", "Fator de tensão para redes de baixa tensão"]], "IEC 60909-0, Tabela 1"));
  if (cfg.ikModo === "manual") {
    b.push(eq("Z_Q = c_{máx} · U_L / (√3 · I_{k,origem}) ;  R_Q = Z_Q · cos φ_{cc} ;  X_Q = Z_Q · sen φ_{cc}", [["Ik,origem", `Corrente de curto presumida informada: ${fmtNum(cfg.ikManual, 2)} kA`], ["cos φcc", fmtNum(cfg.cosCc, 2)]], "IEC 60909-0, 6.2"));
  } else {
    b.push(eq("Z_T = (u_k / 100) · U_L^2 / S_n ;  R_T = P_k / (3 · I_n^2) ;  X_T = √(Z_T^2 − R_T^2)", [["uk", `Impedância percentual: ${fmtNum(cfg.trafo.z)}%`], ["Sn", `Potência nominal: ${fmtNum(cfg.trafo.kva)} kVA`], ["Pk", cfg.trafo.pk ? `Perdas no cobre: ${fmtNum(cfg.trafo.pk)} W` : `Não informada: R_T estimada com cos φcc = ${fmtNum(cfg.cosCc, 2)}`]], "IEC 60909-0, 6.3"));
  }
  b.push(eq("Z_c = (R_{20} + j·X) · L / n", [["R20", "Resistência do condutor a 20 °C (NBR NM 280), para a corrente máxima"], ["X", "Reatância típica de catálogo pela disposição dos cabos"]], "IEC 60909-0, 6.3.6"));
  b.push(eq("Z_Σ = Z_Q + Z_{alim} + Z_{circ}", [["ZΣ", "Impedância acumulada da fonte ao ponto da falta"]], "IEC 60909-0, método das impedâncias"));
  b.push(eq("I_{k3} = c_{máx} · U_L / (√3 · |Z_Σ|)", [["Ik3", "Corrente de curto trifásica no início (barramento) e no fim de cada trecho"]], "IEC 60909-0, 7.1.1"));

  b.push(h2("5.9 Curto-circuito mínimo"));
  b.push(eq("I_{k,mín} = c_{mín} · U_0 / |Z_Q + Z_{fase,θ} + Z_{N,θ}|   (circuitos com neutro)", [["Z_θ", "Impedâncias com R na temperatura máxima de serviço (70 °C PVC, 90 °C EPR/XLPE)"], ["Sem neutro", "falta fase-fase: c_mín · UL / (2 · |Z1|)"]], "IEC 60909-0, 7.1.2"));
  b.push(h2("5.10 Atuação da proteção no ponto mais afastado"));
  b.push(eq("I_{k,mín} ≥ I_m = m · I_n", [["m", "5 (curva B), 10 (curva C), 20 (curva D) — limite superior da faixa de disparo instantâneo"]], "ABNT NBR 5410:2004, 5.3.5.4; ABNT NBR NM 60898"));
  b.push(h2("5.11 Capacidade de interrupção"));
  b.push(eq("I_{cu} ≥ I_{k,máx}  (no ponto de instalação)", [], "ABNT NBR 5410:2004, 5.3.5.5.1"));
  b.push(h2("5.12 Suportabilidade térmica"));
  b.push(eq("∫ i^2 dt = I^2·t ≤ k^2 · S^2", [["I²t", "Energia que o disjuntor deixa passar com o Ik máximo do ponto de instalação (catálogo do fabricante; na falta, limites da classe 3 de limitação, NBR NM 60898 Anexo ZA, até 32 A, ou Ik²·0,01 s)"], ["S", "Seção do condutor (mm²)"]], "ABNT NBR 5410:2004, 5.3.5.5.2"));
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "Material", peso: 1 }, { titulo: "PVC ≤ 300 mm²", peso: 1, align: "right" }, { titulo: "PVC > 300 mm²", peso: 1, align: "right" }, { titulo: "EPR/XLPE", peso: 1, align: "right" }],
    linhas: [
      [c("Cobre"), cr("115"), cr("103"), cr("143")],
      [c("Alumínio"), cr("76"), cr("68"), cr("94")],
    ],
    legenda: "Tabela 30 — Valores de k para condutores com isolação de PVC, EPR ou XLPE.",
  });

  b.push(h2("5.13 Proteção contra choques elétricos"));
  b.push(eq("Z_s = |Z_Q + Z_{fase,θ} + Z_{PE,θ}|", [["Zs", "Impedância do percurso da corrente de falta: fonte, condutor de fase até o ponto da falta e condutor de proteção de volta à fonte"]], "ABNT NBR 5410:2004, 5.1.2.2.4.2 d)"));
  if (cfg.esquema === "TN-S") {
    b.push(eq("Z_s · I_a ≤ U_0", [["Ia", "Corrente de disparo magnético do disjuntor ou IΔn do DR"], ["U0", `${res.U0} V`]], "ABNT NBR 5410:2004, 5.1.2.2.4.2"));
  } else {
    b.push(eq("R_A · I_{Δn} ≤ U_L", [["RA", `Resistência do eletrodo + condutores de proteção: ${fmtNum(cfg.RA)} Ω`], ["UL", `Tensão de contato limite: ${tensaoContatoLimite(cfg.situacao)} V (situação ${cfg.situacao})`]], "ABNT NBR 5410:2004, 5.1.2.2.4.3"));
  }
  b.push({
    tipo: "nota",
    tom: "info",
    titulo: "Proteção adicional por DR (5.1.3.2.2)",
    texto:
      "Independentemente do esquema de aterramento, exigem DR com IΔn ≤ 30 mA: a) circuitos de locais com banheira ou chuveiro; b) tomadas em áreas externas; c) tomadas internas que possam alimentar equipamentos no exterior; d) em habitações, pontos em cozinhas, copas-cozinhas, lavanderias, áreas de serviço, garagens e áreas molhadas ou sujeitas a lavagens; e) em edificações não residenciais, tomadas nesses mesmos locais.",
  });
  b.push({
    tipo: "tabela",
    colunas: [{ titulo: "U0 (V)", peso: 1 }, { titulo: "Situação 1 (s)", peso: 1, align: "right" }, { titulo: "Situação 2 (s)", peso: 1, align: "right" }],
    linhas: [
      ["115, 120, 127", "0,8", "0,35"],
      ["220", "0,4", "0,20"],
      ["254", "0,4", "0,20"],
      ["277", "0,4", "0,20"],
      ["400", "0,2", "0,05"],
    ].map(([a, x, y]) => [c(a), cr(x), cr(y)]),
    legenda: `Tabela 25 — Tempos de seccionamento máximos no esquema TN. Adotado: ${fmtNum(tmax, 2)} s (U0 = ${res.U0} V, situação ${cfg.situacao}).`,
  });

  // 6 Resultados
  b.push(h1("6. Resultados", true));
  b.push(
    p(
      `Origem: ${res.origem.ikMax != null ? `Ik máximo de ${fmtNum(res.origem.ikMax, 2)} kA` : "Ik não informado"}${res.origem.cosCc != null ? `, cos φcc = ${fmtNum(res.origem.cosCc, 2)}` : ""}. Tensão ${cfg.tensao} V, esquema ${cfg.esquema}, situação ${cfg.situacao}.`,
    ),
  );
  for (const q of quadros) {
    b.push(h2(`Resumo geral — ${q.nome}`));
    const nMag = q.circuitos.filter((r) => r.verif.magnetica === "ok").length;
    const nTer = q.circuitos.filter((r) => r.verif.termica === "ok").length;
    const nIcu = [q.geral, ...q.circuitos].filter((r) => r.verif.icu === "ok").length;
    b.push({
      tipo: "tabela",
      colunas: [{ titulo: "Item", peso: 2 }, { titulo: "Valor", peso: 1.4, align: "right" }],
      linhas: [
        [c("Número de circuitos"), cr(String(q.circuitos.length))],
        [c("Potência ativa instalada / demandada"), cr(`${fmtNum(q.potencias.Pinst / 1000, 2)} / ${fmtNum(q.potencias.Pdem / 1000, 2)} kW`)],
        [c("Potência aparente demandada"), cr(`${fmtNum(q.potencias.Sdem / 1000, 2)} kVA`)],
        [c("Potência reativa demandada"), cr(`${fmtNum(q.potencias.Qdem / 1000, 2)} kvar`)],
        [c("Carga especial"), cr(`${fmtNum(q.potencias.especial / 1000, 2)} kW`)],
        [c("Correntes por fase (A / B / C)"), cr(`${fmtNum(q.fases.A.I, 1)} / ${fmtNum(q.fases.B.I, 1)} / ${fmtNum(q.fases.C.I, 1)} A (dif. ${fmtNum(q.fases.desequilibrio, 1)}%)`)],
        [c("Alimentador"), cr(`${q.geral.condPorFase > 1 ? `${q.geral.condPorFase}×` : ""}${fmtNum(q.geral.secao)} mm² ${q.geral.material} ${q.geral.isolacao} · ${q.geral.In} A ${q.geral.curva}`)],
        [c("Ik no barramento"), cr(q.ikBarramento != null ? `${fmtNum(q.ikBarramento, 2)} kA` : "—")],
        [c("Capacidade de interrupção atendida"), cr(`${nIcu} de ${q.circuitos.length + 1}`)],
        [c("Atuação magnética atendida"), cr(`${nMag} de ${q.circuitos.length}`)],
        [c("Suportabilidade térmica atendida"), cr(`${nTer} de ${q.circuitos.length}`)],
        [c("Proteção contra choques (conformes / não conformes / faltando)"), cr(`${q.resumo.choque.ok} / ${q.resumo.choque.falha} / ${q.resumo.choque.semDados}`)],
      ],
    });
    if (q.grupos.length) {
      b.push({
        tipo: "tabela",
        colunas: [{ titulo: "Grupo", peso: 2.4 }, { titulo: "Instalada (W)", peso: 1, align: "right" }, { titulo: "FD (%)", peso: 0.7, align: "right" }, { titulo: "Demandada (W)", peso: 1, align: "right" }],
        linhas: q.grupos.map((g) => [c(`${g.id} — ${nomeGrupo(g.id)}`), cr(fmtNum(g.Pinst, 0)), cr(fmtNum(g.fd, 0)), cr(fmtNum(g.Pdem, 0))]),
        total: [c("Total"), cr(fmtNum(q.potencias.Pinst, 0)), cr(""), cr(fmtNum(q.potencias.Pdem, 0))],
        legenda: "Demanda por grupo de carga.",
      });
    }
    const comAviso = [q.geral, ...q.circuitos].filter((r) => r.avisos.length);
    if (comAviso.length) {
      b.push({ tipo: "nota", tom: "alerta", titulo: "Avisos", texto: comAviso.map((r) => `${r.tag}: ${r.avisos.join(" ")}`).join(" · ") });
    }
    const falhas = [q.geral, ...q.circuitos].filter((r) => Object.values(r.verif).includes("falha"));
    b.push({
      tipo: "nota",
      tom: falhas.length ? "falha" : "ok",
      titulo: falhas.length ? "Critérios não atendidos" : "Todos os critérios atendidos",
      texto: falhas.length ? falhas.map((r) => `${r.tag}: ${Object.entries(r.verif).filter(([, x]) => x === "falha").map(([k]) => k).join(", ")}`).join(" · ") : "Sobrecarga, queda de tensão, curto-circuito e proteção contra choques verificados em todos os circuitos.",
    });
  }

  // 7 Anexos (paisagem)
  const anexos: Bloco[] = [h1("7. Anexos")];
  for (const q of quadros) {
    const todos = [q.geral, ...q.circuitos];
    anexos.push(h2(`Anexo I — Quadro de circuitos — ${q.nome}`));
    anexos.push({
      tipo: "tabela",
      fonte: 7.5,
      colunas: [
        { titulo: "TAG", peso: 0.6 },
        { titulo: "Descrição", peso: 2 },
        { titulo: "Tipo", peso: 0.9 },
        { titulo: "Fase", peso: 0.5 },
        { titulo: "Carga (W)", peso: 0.8, align: "right" },
        { titulo: "P (W)", peso: 0.8, align: "right" },
        { titulo: "S (VA)", peso: 0.8, align: "right" },
        { titulo: "Ib (A)", peso: 0.6, align: "right" },
        { titulo: "Disjuntor", peso: 0.8 },
        { titulo: "Seção (mm²)", peso: 0.7, align: "right" },
        { titulo: "Iz (A)", peso: 0.6, align: "right" },
        { titulo: "L (m)", peso: 0.6, align: "right" },
        { titulo: "ΔV trecho (%)", peso: 0.7, align: "right" },
        { titulo: "ΔV acum. (%)", peso: 0.7, align: "right" },
      ],
      linhas: todos.map((r) => [
        c(r.tag, { b: true }),
        c(r.descricao || (r.reserva ? "Reserva" : "")),
        c(r.esquema),
        c(r.fase),
        cr(fmtNum(r.tag === "GERAL" ? q.potencias.Pinst : r.P, 0)),
        cr(fmtNum(r.P, 0)),
        cr(fmtNum(r.S, 0)),
        cr(fmtNum(r.Ib, 1)),
        c(`${r.condPorFase > 1 ? "" : ""}${r.In} A ${r.curva}`),
        cr(`${r.condPorFase > 1 ? `${r.condPorFase}×` : ""}${fmtNum(r.secao)}`),
        cr(fmtNum(r.iz, 1)),
        cr(fmtNum(r.comprimento)),
        cr(fmtNum(r.dvTrecho, 2), { cor: r.verif.queda === "falha" ? "C62828" : undefined }),
        cr(fmtNum(r.dvAcumulada, 2), { cor: r.verif.queda === "falha" ? "C62828" : undefined }),
      ]),
      legenda: "Linha GERAL: alimentador do quadro (carga instalada × demanda).",
    });
    anexos.push(h2(`Anexo I-B — Configuração dos condutores — ${q.nome}`));
    anexos.push({
      tipo: "tabela",
      fonte: 7.5,
      colunas: [
        { titulo: "TAG", peso: 0.6 },
        { titulo: "Esquema", peso: 0.9 },
        { titulo: "Material / isolação", peso: 1 },
        { titulo: "Método", peso: 1.1 },
        { titulo: "Cond./fase", peso: 0.6, align: "right" },
        { titulo: "Fase (mm²)", peso: 0.6, align: "right" },
        { titulo: "Neutro (mm²)", peso: 0.6, align: "right" },
        { titulo: "PE (mm²)", peso: 0.6, align: "right" },
        { titulo: "k1", peso: 0.4, align: "right" },
        { titulo: "k2", peso: 0.4, align: "right" },
        { titulo: "Iz tab. → corr. (A)", peso: 0.9, align: "right" },
      ],
      linhas: todos.map((r) => [
        c(r.tag, { b: true }),
        c(r.esquema),
        c(`${r.material} ${r.isolacao} ${r.tensaoIsolacao}`),
        c(`${r.metodo} (ref. ${r.metodoRef})`),
        cr(String(r.condPorFase)),
        cr(fmtNum(r.secao)),
        cr(fmtNum(r.secaoN)),
        cr(fmtNum(r.secaoPE)),
        cr(fmtNum(r.k1, 2)),
        cr(fmtNum(r.k2, 2)),
        cr(`${fmtNum(r.izTab, 1)} → ${fmtNum(r.iz, 1)}`),
      ]),
    });
    anexos.push(h2(`Anexo II — Verificações de curto-circuito — ${q.nome}`));
    anexos.push({
      tipo: "tabela",
      fonte: 7.5,
      colunas: [
        { titulo: "TAG", peso: 0.6 },
        { titulo: "Ik início (kA)", peso: 0.7, align: "right" },
        { titulo: "Icu (kA)", peso: 0.6, align: "right" },
        { titulo: "Interrupção", peso: 0.8 },
        { titulo: "Ik mín fim (A)", peso: 0.7, align: "right" },
        { titulo: "Im (A)", peso: 0.6, align: "right" },
        { titulo: "Sensib. magnética", peso: 0.8 },
        { titulo: "I²t (A²s)", peso: 0.8, align: "right" },
        { titulo: "k²S² (A²s)", peso: 0.9, align: "right" },
        { titulo: "Suport. térmica", peso: 0.8 },
      ],
      linhas: todos.map((r) => [
        c(r.tag, { b: true }),
        cr(fmtNum(r.ikInicio, 2)),
        cr(fmtNum(r.icu)),
        v(r.verif.icu),
        cr(r.ikMinFim != null ? fmtNum(r.ikMinFim * 1000, 0) : "—"),
        cr(fmtNum(r.Im, 0)),
        v(r.verif.magnetica),
        cr(fmtNum(r.i2t, 0)),
        cr(fmtNum(r.k2s2, 0)),
        v(r.verif.termica),
      ]),
    });
    anexos.push(h2(`Anexo III — Proteção contra choques — ${q.nome}`));
    anexos.push({
      tipo: "tabela",
      fonte: 7.5,
      colunas: [
        { titulo: "TAG", peso: 0.6 },
        { titulo: "Dispositivo", peso: 1 },
        { titulo: "Origem de Ia", peso: 1.4 },
        { titulo: "Ia (A)", peso: 0.6, align: "right" },
        { titulo: cfg.esquema === "TN-S" ? "Zs (Ω)" : "RA (Ω)", peso: 0.6, align: "right" },
        { titulo: "Critério", peso: 1.1 },
        { titulo: "t máx (s)", peso: 0.6, align: "right" },
        { titulo: "Resultado", peso: 0.8 },
      ],
      linhas: q.circuitos.map((r) => [
        c(r.tag, { b: true }),
        c(`${r.In} A ${r.curva}${r.dr ? ` + DR ${r.drSens} mA` : ""}`),
        c(r.iaOrigem),
        cr(r.ia != null ? fmtNum(r.ia, r.ia < 1 ? 3 : 0) : "—"),
        cr(cfg.esquema === "TN-S" ? fmtNum(r.zs, 3) : fmtNum(cfg.RA)),
        c(r.zsIa != null ? `${fmtNum(r.zsIa, 1)} V ≤ ${cfg.esquema === "TN-S" ? r.U0 : tensaoContatoLimite(cfg.situacao)} V` : "—"),
        cr(fmtNum(r.tmax, 2)),
        v(r.verif.choque),
      ]) as LinhaTabela[],
    });
  }
  anexos.push({
    tipo: "assinatura",
    local: projeto.cidade || "________________",
    data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    nome: rt.nome,
    registro: rt.registro,
    empresa: rt.empresa,
    art: rt.art,
  });
  b.push({ tipo: "paisagem", blocos: anexos });

  return {
    arquivo: `Memorial de Calculo - ${nome}${quadroId ? ` - ${quadros[0]?.nome ?? ""}` : ""}`,
    cabecalho: `Memorial de Cálculo — ${nome} — NBR 5410`,
    emitidoEm: new Date().toLocaleDateString("pt-BR"),
    capa: {
      faixa: "Memorial de cálculo",
      titulo: "Quadro de Cargas e Dimensionamento de Circuitos",
      subtitulo: `${nome}${quadros.length ? ` — ${listaQuadros}` : ""}`,
      norma: "ABNT NBR 5410:2004",
      metadados: [
        { rotulo: "Norma", valor: "ABNT NBR 5410:2004" },
        { rotulo: "Esquema / tensão", valor: `${cfg.esquema} · ${cfg.tensao} V` },
        { rotulo: "Data", valor: fmtData(projeto.data) },
        { rotulo: "Responsável técnico", valor: rt.nome },
        { rotulo: "Registro", valor: [rt.registro && `CREA/CFT ${rt.registro}`, rt.art && `ART ${rt.art}`].filter(Boolean).join(" · ") },
        { rotulo: "Empresa", valor: rt.empresa },
        { rotulo: "Cliente", valor: projeto.cliente },
        { rotulo: "Endereço", valor: [projeto.endereco, projeto.cidade].filter(Boolean).join(" — ") },
      ],
    },
    sumario: true,
    blocos: b,
  };
}
