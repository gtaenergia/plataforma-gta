/**
 * Laudo da análise de risco — mesma estrutura do relatório de referência:
 * capa, sumário, painel de risco, seções 1 a 12 e fecho com assinatura.
 */

import type { DadosProjeto } from "../tipos";
import { soEntrada, type DadosRisco } from "../risco/tipos";
import {
  CHAVES,
  META_COMPONENTE,
  META_RISCO,
  calcularRisco,
  componenteDominante,
  reducao,
  type ChaveRisco,
  type ResultadoRisco,
} from "../risco/motor";
import {
  BLINDAGEM,
  CD,
  CE,
  CI,
  CT,
  FT,
  HZ,
  KS3,
  LF_L1,
  LF_L3,
  LF_L4,
  LO_L1,
  LO_L4,
  LT_L1,
  LT_L4,
  PB,
  PEB,
  PSPD,
  PTA,
  PTU,
  RF,
  RP,
  RS_ESTRUTURA,
  RT_PISO,
  opcaoCl,
  rotulo,
  valor,
} from "../risco/tabelas";
import { IIMP_PREFERENCIAIS, observacoesNorma, requisitosDps, requisitosSpda } from "../risco/requisitos";
import { formatBRL } from "../../format";
import { fmtCient, fmtData, fmtFixo, fmtFreq, fmtNum, fmtParam, fmtPct, fmtRisco } from "../formato";
import { CORES_COMPONENTE, posicaoLog, svgBarraEmpilhada, svgMedidores, type Medidor } from "./graficos";
import { c, cr, type Bloco, type Celula, type Laudo, type LinhaTabela } from "./modelo";

const sym = (s: string): Celula => c(s, { b: true, cor: "1A2F4A" });

function medidasTexto(d: DadosRisco): string[] {
  const m: string[] = [];
  const pb = d.estrutura.PB;
  if (pb !== "sem-spda") m.push(pb === "I-descida-natural" || pb === "cobertura-metalica" ? "SPDA nível I (com elementos naturais)" : `SPDA nível ${pb}`);
  if (d.estrutura.PEB !== "sem") m.push(`DPS ${rotulo(PEB, d.estrutura.PEB).replace(/^NP/, "NP")}`);
  if (d.zonas.some((z) => z.energia.PSPD !== "sem" || z.sinal.PSPD !== "sem")) m.push("sistema coordenado de DPS");
  return m;
}

function listaFrase(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function montarLaudoRisco(projeto: DadosProjeto, d: DadosRisco): Laudo {
  const entrada = soEntrada(d);
  const r = calcularRisco(entrada);
  const pre: ResultadoRisco | null = d.preliminar ? calcularRisco(d.preliminar.entrada) : null;
  const ok = r.toleravel;
  const comMedidas = d.analise != null || medidasTexto(d).length > 0;
  const dataAnalise = fmtData((d.analise?.em ?? d.preliminar?.em ?? projeto.data) || null);
  const nome = projeto.nome || "Projeto";
  const riscos = (["R1", "R3", "R4"] as ChaveRisco[]).filter((k) => r[k]);
  const medidas = medidasTexto(d);
  const blocos: Bloco[] = [];

  // ------------------------------------------------------------ painel
  blocos.push({ tipo: "titulo", nivel: 1, texto: "Painel de Risco" });
  const frase = ok
    ? `${medidas.length ? `Com ${listaFrase(medidas)}, os` : "Os"} riscos${r.criterios.some((x) => x.tipo === "frequencia") ? " e as frequências de danos" : ""} estão dentro dos valores toleráveis.`
    : `${medidas.length ? `Mesmo com ${listaFrase(medidas)}, há` : "Há"} risco ou frequência acima do tolerável: medidas de proteção adicionais são necessárias.`;
  blocos.push({
    tipo: "banner",
    ok,
    titulo: ok ? "Riscos dentro do tolerável" : "Proteção necessária",
    texto: frase,
    lateral: { rotulo: "critérios atendidos", valor: `${r.criterios.filter((x) => x.ok).length} de ${r.criterios.length}` },
  });

  const medidores: Medidor[] = [];
  for (const k of riscos) {
    const t = r[k]!;
    const exp = META_RISCO[k].expoente;
    const antes = pre?.[k]?.total ?? null;
    const red = antes != null ? reducao(antes, t.total) : null;
    medidores.push({
      sobrescrito: k,
      titulo: META_RISCO[k].nome,
      valor: fmtRisco(t.total, exp),
      ok: !t.excede,
      limite: `tolerável RT = ${fmtRisco(t.RT, exp)}`,
      posicao: posicaoLog(t.total, t.RT),
      posicaoSem: antes != null ? posicaoLog(antes, t.RT) : null,
      rodape: antes != null ? `sem medidas ${fmtRisco(antes, exp)}${red != null ? ` · redução ${fmtPct(red)}` : ""}` : undefined,
    });
  }
  for (const z of r.zonas) {
    if (!z.F) continue;
    const antes = pre?.zonas.find((x) => x.id === z.id)?.F?.total ?? null;
    const red = antes != null ? reducao(antes, z.F.total) : null;
    medidores.push({
      sobrescrito: `F · ${z.nome}`,
      titulo: "Frequência de danos",
      valor: fmtFreq(z.F.total),
      ok: !z.F.excede,
      limite: `tolerável FT = ${fmtFixo(z.F.FT, 3)}`,
      posicao: posicaoLog(z.F.total, z.F.FT),
      posicaoSem: antes != null ? posicaoLog(antes, z.F.FT) : null,
      rodape: antes != null ? `sem medidas ${fmtFreq(antes)}${red != null ? ` · redução ${fmtPct(red)}` : ""}` : undefined,
    });
  }
  for (let i = 0; i < medidores.length; i += 2) {
    const g = svgMedidores(medidores.slice(i, i + 2));
    blocos.push({ tipo: "svg", svg: g.svg, largura: 480, altura: g.altura });
  }

  if (riscos.length) {
    blocos.push({ tipo: "titulo", nivel: 3, texto: "De onde vem o risco" });
    for (const k of riscos) {
      const t = r[k]!;
      const chaves = CHAVES.filter((x) => t.componentes[x] > 0);
      const g = svgBarraEmpilhada({
        rotulo: k,
        segmentos: chaves.map((x) => ({ rotulo: x, valor: t.componentes[x], cor: CORES_COMPONENTE[x] })),
        status: { texto: t.excede ? "acima do tolerável" : "tolerável", ok: !t.excede },
        legenda: chaves.map((x) => ({ rotulo: x, cor: CORES_COMPONENTE[x], desc: META_COMPONENTE[x].descricao })),
        escala: Math.min(1, t.total / t.RT),
      });
      blocos.push({ tipo: "svg", svg: g.svg, largura: 480, altura: g.altura });
    }
    const principal = r.R1 ?? r[riscos[0]]!;
    const dom = componenteDominante(principal);
    if (dom) {
      blocos.push({
        tipo: "nota",
        tom: "info",
        titulo: "Componente que mais pesa",
        texto: `${dom.chave} responde por ${Math.round(dom.fracao * 100)}% de ${principal.chave} (${META_COMPONENTE[dom.chave].descricao}).`,
      });
    }
  }

  // ------------------------------------------------------------ 1
  blocos.push({ tipo: "titulo", nivel: 1, texto: "1. Identificação do Projeto", quebraAntes: true });
  const rt = projeto.rt;
  blocos.push({
    tipo: "tabela",
    colunas: [{ titulo: "Campo", peso: 1 }, { titulo: "Informação", peso: 2.2 }],
    linhas: [
      ["Projeto", nome],
      ["Responsável Técnico", rt.nome],
      ["Empresa", rt.empresa],
      ["CNPJ da Empresa", rt.cnpj],
      ["CREA/CFT", rt.registro],
      ["ART/TRT", rt.art],
      ["Telefone", rt.telefone],
      ["E-mail", rt.email],
      ["Obra/Cliente", projeto.cliente],
      ["CNPJ/CPF", projeto.documento],
      ["Endereço da Obra", [projeto.endereco, projeto.cidade].filter(Boolean).join(" — ")],
      ["Data da Análise", dataAnalise],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => [c(k, { cor: "64748B" }), c(v, { b: true })]),
  });

  // ------------------------------------------------------------ 2
  const e = d.estrutura;
  blocos.push({ tipo: "titulo", nivel: 1, texto: "2. Dimensões e Parâmetros da Estrutura" });
  const colParam = [{ titulo: "Símbolo", peso: 0.6 }, { titulo: "Parâmetro", peso: 1.7 }, { titulo: "Valor", peso: 0.6, align: "right" as const }, { titulo: "Descrição adotada", peso: 2.2 }];
  blocos.push({
    tipo: "tabela",
    colunas: colParam,
    linhas: [
      { grupo: "Geometria e descargas" },
      [sym("Ng"), c("Densidade de descargas (raios/km²/ano)"), cr(fmtNum(e.NG)), c(e.cidade ? `${e.cidade.nome}/${e.cidade.uf} — Tabela F.1` : "Densidade de descargas atmosféricas para a terra")],
      [sym("L"), c("Comprimento (m)"), cr(fmtNum(e.L)), c("—")],
      [sym("W"), c("Largura (m)"), cr(fmtNum(e.W)), c("—")],
      [sym("H"), c("Altura (m)"), cr(fmtNum(e.H)), c("—")],
      { grupo: "Fatores e probabilidades" },
      [sym("CD"), c(CD.nome), cr(fmtParam(valor(CD, e.CD))), c(rotulo(CD, e.CD))],
      [sym("PB"), c(PB.nome), cr(fmtParam(valor(PB, e.PB))), c(rotulo(PB, e.PB))],
      [sym("PEB"), c(PEB.nome), cr(fmtParam(valor(PEB, e.PEB))), c(rotulo(PEB, e.PEB))],
      [sym("rs"), c(RS_ESTRUTURA.nome), cr(fmtParam(valor(RS_ESTRUTURA, e.rS))), c(rotulo(RS_ESTRUTURA, e.rS))],
      [sym("KS1"), c("Eficácia da blindagem da estrutura"), cr(fmtParam(r.zonas[0]?.prob.KS1 ?? 1)), c(e.semBlindagemKs1 ? "Sem blindagem espacial em forma de malha (KS1 = 1)" : "Blindagem espacial em malha (B.4.12)")],
      [sym("nt"), c("Total de pessoas na estrutura"), cr(fmtNum(e.nt, 0)), c("—")],
    ],
  });

  // ------------------------------------------------------------ 3
  blocos.push({ tipo: "titulo", nivel: 1, texto: "3. Linhas Elétricas Conectadas" });
  if (!d.linhas.length) blocos.push({ tipo: "paragrafo", texto: "A estrutura não possui linhas elétricas externas conectadas." });
  for (const l of d.linhas) {
    const rl = r.linhas.find((x) => x.id === l.id)!;
    const cl = opcaoCl(l.clc);
    blocos.push({ tipo: "titulo", nivel: 2, texto: `${l.nome} (${l.tipo === "energia" ? "Energia" : "Sinal"})` });
    const linhas: LinhaTabela[] = [
      [sym("LL"), c("Comprimento da linha (m)"), cr(fmtNum(l.LL)), c("—")],
      [sym("CE"), c(CE.nome), cr(fmtParam(rl.CE)), c(rotulo(CE, l.CE))],
      [sym("CT"), c(CT.nome), cr(fmtParam(rl.CT)), c(rotulo(CT, l.CT))],
      [sym("CI"), c(CI.nome), cr(fmtParam(rl.CI)), c(rotulo(CI, l.CI))],
      [sym("CLD"), c("Tipo de linha elétrica externa"), cr(fmtParam(cl.CLD)), c(cl.rotulo)],
      [sym("CLI"), c("Ligação equipotencial na entrada"), cr(fmtParam(cl.CLI)), c(cl.rotulo)],
      [sym("RS"), c("Blindagem do cabo"), cr(l.blindagem === "nao-blindada" ? "—" : `≤ ${fmtNum(valor(BLINDAGEM, l.blindagem))} Ω/km`), c(rotulo(BLINDAGEM, l.blindagem))],
      [sym("UW"), c("Tensão suportável (kV)"), cr(fmtNum(l.UW)), c("—")],
      [sym("PLD"), c("Prob. falha por descarga na linha"), cr(fmtParam(rl.PLD)), c(`Tabela B.8 (UW = ${fmtNum(l.UW)} kV)`)],
      [sym("PLI"), c("Prob. falha por descarga próxima"), cr(fmtParam(rl.PLI)), c(`Tabela B.9 (${l.tipo}, UW = ${fmtNum(l.UW)} kV)`)],
    ];
    if (l.adjacente) {
      linhas.push({ grupo: "Estrutura adjacente conectada" });
      linhas.push([sym("LJ × WJ × HJ"), c("Dimensões (m)"), cr(`${fmtNum(l.adjacente.L)} × ${fmtNum(l.adjacente.W)} × ${fmtNum(l.adjacente.H)}`), c("—")]);
      linhas.push([sym("CDJ"), c("Localização da adjacente"), cr(fmtParam(valor(CD, l.adjacente.CDJ))), c(rotulo(CD, l.adjacente.CDJ))]);
    }
    blocos.push({ tipo: "tabela", colunas: colParam, linhas });
  }

  // ------------------------------------------------------------ 4
  blocos.push({ tipo: "titulo", nivel: 1, texto: "4. Parâmetros por Zona" });
  for (const z of d.zonas) {
    const rz = r.zonas.find((x) => x.id === z.id)!;
    blocos.push({ tipo: "titulo", nivel: 2, texto: z.nome });
    const linhas: LinhaTabela[] = [
      { grupo: "Piso, proteção e ocupação" },
      [sym("rt"), c(RT_PISO.nome), cr(fmtParam(valor(RT_PISO, z.rt))), c(rotulo(RT_PISO, z.rt))],
      [sym("PTA"), c(PTA.nome), cr(fmtParam(valor(PTA, z.PTA))), c(rotulo(PTA, z.PTA))],
      [sym("PTU"), c(PTU.nome), cr(fmtParam(valor(PTU, z.PTU))), c(rotulo(PTU, z.PTU))],
      [sym("rf"), c(RF.nome), cr(fmtParam(valor(RF, z.rf))), c(rotulo(RF, z.rf))],
      rz.rp !== valor(RP, z.rp)
        ? [sym("rp"), c(RP.nome), cr(fmtParam(rz.rp)), c(`Estrutura com risco de explosão: rp = 1 (C.3.4). Indicado: ${rotulo(RP, z.rp)}`)]
        : [sym("rp"), c(RP.nome), cr(fmtParam(valor(RP, z.rp))), c(rotulo(RP, z.rp))],
      [sym("hz"), c(HZ.nome), cr(fmtParam(valor(HZ, z.hz))), c(rotulo(HZ, z.hz))],
      [sym("rs"), c(RS_ESTRUTURA.nome), cr(fmtParam(valor(RS_ESTRUTURA, e.rS))), c(rotulo(RS_ESTRUTURA, e.rS))],
      [sym("KS2"), c("Fator blindagem interna"), cr(fmtParam(rz.prob.KS2)), c(z.semBlindagemKs2 ? "Sem blindagem interna em malha" : "Blindagem interna em malha (B.4.12)")],
      [sym("nz / nt"), c("Pessoas na zona / total"), cr(`${fmtNum(z.nz, 0)} / ${fmtNum(e.nt, 0)}`), c("—")],
      [sym("tz"), c("Tempo de permanência (h/ano)"), cr(fmtNum(z.tz, 0)), c("—")],
    ];
    if (z.perdas.L1) {
      linhas.push({ grupo: "Perdas — vida humana (L1)" });
      linhas.push([sym("LT (L1)"), c("Perdas por choque (toque e passo)"), cr(fmtParam(valor(LT_L1, z.L1.LT))), c(rotulo(LT_L1, z.L1.LT))]);
      linhas.push([sym("LF (L1)"), c("Perdas por danos físicos"), cr(fmtParam(valor(LF_L1, z.L1.LF))), c(rotulo(LF_L1, z.L1.LF))]);
      linhas.push([sym("LO (L1)"), c("Perdas por falha de sistemas internos"), cr(fmtParam(valor(LO_L1, z.L1.LO))), c(rotulo(LO_L1, z.L1.LO))]);
    }
    if (z.perdas.L3) {
      linhas.push({ grupo: "Perdas — patrimônio cultural (L3)" });
      linhas.push([sym("LF (L3)"), c("Perdas por danos físicos"), cr(fmtParam(valor(LF_L3, z.L3.LF))), c(rotulo(LF_L3, z.L3.LF))]);
      linhas.push([sym("cz"), c("Valor do patrimônio na zona (mi R$)"), cr(fmtNum(z.L3.cz, 3)), c("—")]);
    }
    if (z.perdas.L4) {
      linhas.push({ grupo: "Perdas — valor econômico (L4)" });
      linhas.push([sym("LT (L4)"), c("Perdas por choque em animais"), cr(fmtParam(valor(LT_L4, z.L4.LT))), c(rotulo(LT_L4, z.L4.LT))]);
      linhas.push([sym("LF (L4)"), c("Perdas por danos físicos"), cr(fmtParam(valor(LF_L4, z.L4.LF))), c(rotulo(LF_L4, z.L4.LF))]);
      linhas.push([sym("LO (L4)"), c("Perdas por falha de sistemas internos"), cr(fmtParam(valor(LO_L4, z.L4.LO))), c(rotulo(LO_L4, z.L4.LO))]);
      linhas.push([
        sym("ca / cb / cc / cs"),
        c("Animais / edificação / conteúdo / sistemas (mi R$)"),
        cr(`${fmtNum(z.L4.ca, 2)} / ${fmtNum(z.L4.cb, 2)} / ${fmtNum(z.L4.cc, 2)} / ${fmtNum(z.L4.cs, 2)}`),
        c("—"),
      ]);
    }
    if (z.perdas.F) {
      linhas.push({ grupo: "Frequência de danos (F)" });
      linhas.push([sym("FT"), c(FT.nome), cr(fmtParam(valor(FT, z.FT))), c(rotulo(FT, z.FT))]);
      linhas.push([sym("ZPR 0A"), c("Equipamentos expostos (FB)"), cr(z.equipamentosExpostos ? "Sim" : "Não"), c("7.1.5")]);
    }
    blocos.push({ tipo: "tabela", colunas: colParam, linhas });
  }

  // ------------------------------------------------------------ 5
  blocos.push({ tipo: "titulo", nivel: 1, texto: "5. Áreas de Exposição e Números de Eventos" });
  const colEv = [{ titulo: "Símbolo", peso: 0.7 }, { titulo: "Grandeza", peso: 1.8 }, { titulo: "Valor", peso: 0.9, align: "right" as const }, { titulo: "Fórmula", peso: 2 }];
  blocos.push({
    tipo: "tabela",
    colunas: colEv,
    linhas: [
      { grupo: "Estrutura" },
      [sym("AD (m²)"), c("Área de exposição da estrutura"), cr(fmtFixo(r.AD, 2)), c("AD = L×W + 6H(L+W) + 9πH²")],
      [sym("AM (m²)"), c("Área de influência perto da estrutura"), cr(fmtFixo(r.AM, 2)), c("AM = 2×500(L+W) + π×500²")],
      [sym("ND"), c("Descargas na estrutura (por ano)"), cr(fmtCient(r.ND)), c("ND = Ng × AD × CD × 10⁻⁶")],
      [sym("NM"), c("Descargas perto da estrutura (por ano)"), cr(fmtCient(r.NM)), c("NM = Ng × AM × 10⁻⁶")],
    ],
  });
  for (const l of r.linhas) {
    blocos.push({
      tipo: "tabela",
      colunas: colEv,
      linhas: [
        { grupo: l.nome },
        [sym("AL (m²)"), c("Área de exposição da linha"), cr(fmtFixo(l.AL, 2)), c("AL = 40 × LL")],
        [sym("AI (m²)"), c("Área de influência perto da linha"), cr(fmtFixo(l.AI, 2)), c("AI = 4000 × LL")],
        [sym("NL"), c("Descargas na linha (por ano)"), cr(fmtCient(l.NL)), c("NL = Ng × AL × CI × CE × CT × 10⁻⁶")],
        [sym("NI"), c("Descargas perto da linha (por ano)"), cr(fmtCient(l.NI)), c("NI = Ng × AI × CI × CE × CT × 10⁻⁶")],
        [sym("NDJ"), c("Descargas na estrutura adjacente (por ano)"), cr(fmtCient(l.NDJ)), c("NDJ = Ng × ADJ × CDJ × CT × 10⁻⁶")],
      ],
    });
  }

  // ------------------------------------------------------------ 6
  blocos.push({ tipo: "titulo", nivel: 1, texto: `6. Componentes de Risco — ${comMedidas ? "Com Medidas de Proteção" : "Sem Medidas de Proteção"}` });
  for (const k of riscos) {
    const t = r[k]!;
    const exp = META_RISCO[k].expoente;
    blocos.push({ tipo: "titulo", nivel: 2, texto: `${k} — ${META_RISCO[k].nome} (×10${exp === -5 ? "⁻⁵" : exp === -4 ? "⁻⁴" : "⁻³"})` });
    const chaves = k === "R3" ? (["RB", "RV"] as const) : CHAVES;
    const fmt = (v: number) => (v === 0 ? "0" : fmtRisco(v, exp).replace(" ×10", "e").replace("⁻⁵", "-5").replace("⁻⁴", "-4").replace("⁻³", "-3"));
    blocos.push({
      tipo: "tabela",
      colunas: [{ titulo: "Comp.", peso: 0.5 }, { titulo: "Fórmula", peso: 1.5 }, ...t.porZona.map((z) => ({ titulo: z.nome, peso: 0.9, align: "right" as const })), { titulo: "Estrutura", peso: 0.9, align: "right" as const }],
      linhas: chaves.map((x) => [sym(x), c(META_COMPONENTE[x].formula, { cor: "64748B" }), ...t.porZona.map((z) => cr(fmt(z.componentes[x]))), cr(fmt(t.componentes[x]), { b: true })]),
      total: [c("TOTAL", { colSpan: 2 }), ...t.porZona.map((z) => cr(fmt(z.total))), cr(fmt(t.total), { selo: t.excede ? "falha" : "ok" })],
    });
  }

  // ------------------------------------------------------------ 7
  const zonasF = r.zonas.filter((z) => z.F);
  if (zonasF.length) {
    blocos.push({ tipo: "titulo", nivel: 1, texto: "7. Frequência de Danos a Equipamentos" });
    for (const z of zonasF) {
      const F = z.F!;
      blocos.push({ tipo: "titulo", nivel: 2, texto: z.nome });
      blocos.push({
        tipo: "tabela",
        colunas: [{ titulo: "Componente", peso: 1.2 }, { titulo: "Valor", peso: 1, align: "right" }, { titulo: "Fórmula", peso: 1.6 }],
        linhas: [
          [sym("FB"), cr(fmtCient(F.FB)), c("ND × PB (só equipamentos na ZPR 0A)")],
          [sym("FC"), cr(fmtCient(F.FC)), c("ND × PC")],
          [sym("FM"), cr(fmtCient(F.FM)), c("NM × PM")],
          [sym("FV"), cr(fmtCient(F.FV)), c("(NL+NDJ) × PEB")],
          [sym("FW"), cr(fmtCient(F.FW)), c("(NL+NDJ) × PW")],
          [sym("FZ"), cr(fmtCient(F.FZ)), c("NI × PZ")],
          [c("F (Total)", { b: true }), cr(fmtCient(F.total), { b: true }), c("Soma (equação 14)")],
          [c("FT (Tolerável)"), cr(fmtCient(F.FT)), c("7.3.4")],
          [c("F > FT? (Parecer)"), c(F.excede ? "Sim — medidas necessárias" : "Não — adequada", { selo: F.excede ? "falha" : "ok", colSpan: 2 })],
        ],
      });
    }
  }

  // ------------------------------------------------------------ 8
  let secao = zonasF.length ? 8 : 7;
  if (pre) {
    blocos.push({ tipo: "titulo", nivel: 1, texto: `${secao}. Comparativo: Sem Proteção vs. Com Medidas` });
    const linhas: LinhaTabela[] = [];
    for (const k of riscos) {
      const a = pre[k]?.total ?? null;
      const t = r[k]!;
      const exp = META_RISCO[k].expoente;
      const red = a != null ? reducao(a, t.total) : null;
      linhas.push([
        c(`${k} (×10${exp === -5 ? "⁻⁵" : exp === -4 ? "⁻⁴" : "⁻³"})`, { b: true, cor: t.excede ? "C62828" : undefined }),
        cr(fmtRisco(a, exp), { cor: "64748B" }),
        cr(fmtRisco(t.total, exp), { b: true }),
        cr(fmtRisco(t.RT, exp)),
        c(red != null ? fmtPct(red) : "—", { selo: red != null && red < 0 ? "ok" : "neutro" }),
        c(t.excede ? "R > RT — Proteção necessária" : "R ≤ RT — Risco tolerável", { selo: t.excede ? "falha" : "ok" }),
      ]);
    }
    for (const z of zonasF) {
      const a = pre.zonas.find((x) => x.id === z.id)?.F?.total ?? null;
      const red = a != null ? reducao(a, z.F!.total) : null;
      linhas.push([
        c(`F — ${z.nome}`, { b: true, cor: z.F!.excede ? "C62828" : undefined }),
        cr(fmtFreq(a), { cor: "64748B" }),
        cr(fmtFreq(z.F!.total), { b: true }),
        cr(fmtFixo(z.F!.FT, 3)),
        c(red != null ? fmtPct(red) : "—", { selo: red != null && red < 0 ? "ok" : "neutro" }),
        c(z.F!.excede ? "F > FT — Medidas necessárias" : "F ≤ FT — Adequado", { selo: z.F!.excede ? "falha" : "ok" }),
      ]);
    }
    blocos.push({
      tipo: "tabela",
      colunas: [{ titulo: "Risco", peso: 1 }, { titulo: "Sem proteção", peso: 1, align: "right" }, { titulo: "Com medidas", peso: 1, align: "right" }, { titulo: "RT/FT tolerável", peso: 1, align: "right" }, { titulo: "Redução", peso: 0.7 }, { titulo: "Parecer", peso: 1.6 }],
      linhas,
      legenda: `Sem proteção: análise preliminar de ${fmtData(d.preliminar!.em)}. Valores na escala indicada em cada linha; em vermelho, o risco que segue acima do tolerável.`,
    });
    secao++;
  }

  // ------------------------------------------------------------ 9
  blocos.push({ tipo: "titulo", nivel: 1, texto: `${secao}. Resultado Final e Parecer Técnico` });
  const finais: LinhaTabela[] = [];
  for (const k of riscos) {
    const t = r[k]!;
    const exp = META_RISCO[k].expoente;
    finais.push([c(`${k} — ${META_RISCO[k].nome}`, { b: true }), cr(fmtRisco(t.total, exp)), cr(fmtRisco(t.RT, exp)), c(t.excede ? "Sim" : "Não"), c(t.excede ? "R > RT — Proteção necessária" : "R ≤ RT — Risco tolerável", { selo: t.excede ? "falha" : "ok" })]);
  }
  for (const z of zonasF) {
    finais.push([c(`F — ${z.nome}`, { b: true }), cr(fmtFreq(z.F!.total)), cr(fmtFixo(z.F!.FT, 3)), c(z.F!.excede ? "Sim" : "Não"), c(z.F!.excede ? "F > FT — Medidas necessárias" : "F ≤ FT — Adequado", { selo: z.F!.excede ? "falha" : "ok" })]);
  }
  blocos.push({
    tipo: "tabela",
    colunas: [{ titulo: "Risco / frequência", peso: 1.5 }, { titulo: "Calculado", peso: 1, align: "right" }, { titulo: "Tolerável", peso: 1, align: "right" }, { titulo: "> Tolerável?", peso: 0.7 }, { titulo: "Parecer", peso: 1.6 }],
    linhas: finais,
  });
  for (const k of riscos) {
    blocos.push({ tipo: "equacao", numero: k === "R1" ? 1 : k === "R3" ? 2 : 3, expressao: META_RISCO[k].equacao, onde: [], referencia: k === "R4" ? "ABNT NBR 5419-2:2026, Anexo D (D.1.4)" : "ABNT NBR 5419-2:2026, 4.3.1" });
  }
  blocos.push({
    tipo: "nota",
    tom: ok ? "ok" : "falha",
    titulo: "Parecer técnico",
    texto: ok
      ? `Com base na análise de risco conforme a ABNT NBR 5419-2:2026, ${medidas.length ? `adotando ${listaFrase(medidas)}, ` : ""}todos os riscos avaliados (${riscos.join(", ")}${zonasF.length ? " e frequência de danos" : ""}) estão dentro dos valores toleráveis. As medidas de proteção devem ser projetadas e executadas conforme as ABNT NBR 5419-3 e 5419-4.`
      : `Com base na análise de risco conforme a ABNT NBR 5419-2:2026, ao menos um risco ou frequência de danos excede o valor tolerável (${r.criterios.filter((x) => !x.ok).map((x) => x.rotulo).join(", ")}). São necessárias medidas de proteção adicionais (5.4.4); se o risco não puder ser reduzido ao tolerável, o proprietário deve ser informado e o mais alto nível de proteção providenciado (5.4.6).`,
  });
  const obs = observacoesNorma(entrada, r);
  if (obs.length) blocos.push({ tipo: "nota", tom: "info", titulo: "Observações da norma", texto: obs.join(" ") });
  if (r.custoPerdas) {
    const antes = pre?.custoPerdas?.CL ?? null;
    blocos.push({
      tipo: "nota",
      tom: "neutro",
      titulo: "Avaliação econômica (Anexo D, informativo)",
      texto: `Custo anual estimado das perdas: CL = R4 × ct = ${formatBRL(r.custoPerdas.CL)}/ano (ct = ${fmtNum(r.custoPerdas.ct, 3)} milhões de R$)${antes != null ? `; sem medidas de proteção, ${formatBRL(antes)}/ano — redução de ${formatBRL(antes - r.custoPerdas.CL)}/ano, a comparar com o custo anual das medidas CPM = CP × (i + a + m) (D.2)` : ""}. Na comparação de R4 com o risco tolerável representativo (10⁻³), as razões de valor são tomadas iguais a 1 (nota a da Tabela D.1).`,
    });
  }
  secao++;

  // ------------------------------------------------------------ 10
  blocos.push({ tipo: "titulo", nivel: 1, texto: `${secao}. Medidas de Proteção Adotadas`, quebraAntes: true });
  const spda = requisitosSpda(entrada);
  const dps = requisitosDps(entrada);
  if (!spda && !dps) blocos.push({ tipo: "paragrafo", texto: "Nenhuma medida de proteção (SPDA ou DPS classe I) foi adotada na estrutura." });
  if (spda) {
    blocos.push({ tipo: "titulo", nivel: 2, texto: `Requisitos do SPDA — Nível ${spda.nivel} (NBR 5419-3:2026)` });
    blocos.push({ tipo: "paragrafo", texto: [{ t: "Parâmetro adotado: " }, { t: `PB = ${fmtParam(spda.pb)} — ${spda.pbRotulo}`, b: true }] });
    blocos.push({ tipo: "cartoes", itens: spda.cartoes.map((x) => ({ valor: x.valor, rotulo: x.rotulo, sub: x.ref })) });
    blocos.push({ tipo: "lista", titulo: "Subsistema de captação", itens: spda.captacao, colunas: 2 });
    blocos.push({ tipo: "lista", titulo: "Subsistema de descida", itens: spda.descida, colunas: 2 });
    blocos.push({ tipo: "lista", titulo: "Subsistema de aterramento", itens: spda.aterramento, colunas: 2 });
    blocos.push({ tipo: "nota", tom: "info", titulo: "Nota", texto: spda.nota });
  }
  if (dps) {
    blocos.push({ tipo: "titulo", nivel: 2, texto: `Requisitos Mínimos do DPS — NP ${dps.np} (NBR 5419-4:2026)` });
    blocos.push({ tipo: "paragrafo", texto: [{ t: "Parâmetro adotado: " }, { t: `PEB = ${fmtParam(dps.peb)} — ${dps.pebRotulo}`, b: true }] });
    blocos.push({
      tipo: "tabela",
      colunas: [{ titulo: "Classe", peso: 1 }, { titulo: "Ensaio", peso: 1.3 }, { titulo: "Forma de onda", peso: 0.8 }, { titulo: "Uso", peso: 1.6 }],
      linhas: dps.classes.map((x) => [c(x.adotada ? `${x.classe} · adotada` : x.classe, x.adotada ? { selo: "info" } : { b: true }), c(x.ensaio), c(x.onda), c(x.uso)]),
    });
    blocos.push({ tipo: "lista", titulo: "Requisitos de instalação e coordenação", itens: dps.instalacao, colunas: 2 });
    const dm = dps.dimensionamento;
    blocos.push({ tipo: "titulo", nivel: 3, texto: `Dimensionamento da corrente de impulso Iimp — NP ${dm.npCorrente} (NBR 5419-1 / NBR 5419-4, Anexo D)` });
    blocos.push({
      tipo: "lista",
      marcador: "ponto",
      itens: [
        `Corrente total de impulso do NP ${dm.npCorrente} (${dm.origemNp}): I = ${dm.total} kA (10/350 µs)`,
        `Parcela escoada pelo aterramento (50%): ${dm.aterramento} kA`,
        `Parcela distribuída pelas linhas entrantes (50%): ${dm.linhas} kA`,
        `Linhas metálicas entrantes consideradas: ${dm.nLinhas}`,
        [{ t: `Parcela por linha entrante: ${dm.linhas} kA / ${dm.nLinhas} = ${fmtNum(dm.porLinha, 1)} kA`, b: true }],
        ...dm.porCondutor.map((p) => `${p.linha}: ${fmtNum(dm.porLinha, 1)} kA / ${p.condutores} condutores = ${fmtNum(p.kA, 2)} kA por condutor → Iimp ≥ ${p.adotado != null ? `${fmtNum(p.adotado, 1)} kA` : "25 kA (consultar o fabricante)"}`),
      ],
    });
    const adotados = new Set(dm.porCondutor.map((p) => p.adotado));
    blocos.push({
      tipo: "tabela",
      colunas: [{ titulo: "Iimp (kA)", peso: 1, align: "center" }, { titulo: "Carga Q (C)", peso: 1, align: "center" }, { titulo: "W/R (kJ/Ω)", peso: 1, align: "center" }, { titulo: "Situação", peso: 1.2 }],
      linhas: IIMP_PREFERENCIAIS.map((v) => [
        c(fmtNum(v.kA, 1), { b: true }),
        c(fmtNum(v.Q, 2)),
        c(fmtNum(v.WR, 2)),
        adotados.has(v.kA) ? c("adotado", { selo: "info" }) : c("—", { cor: "94A3B8" }),
      ]),
      legenda: "Tabela D.1 — Valores preferenciais para Iimp (NBR 5419-4, Anexo D).",
    });
    blocos.push({ tipo: "nota", tom: "info", titulo: "Nota", texto: dps.nota });
  }
  secao++;

  // ------------------------------------------------------------ 11
  blocos.push({ tipo: "titulo", nivel: 1, texto: `${secao}. DPS por Zona` });
  const tiposLinha = (["energia", "sinal"] as const).filter((t) => d.linhas.some((l) => l.tipo === t));
  const dpsLinhas: LinhaTabela[] = [];
  for (const z of d.zonas) {
    const rz = r.zonas.find((x) => x.id === z.id)!;
    for (const t of tiposLinha) {
      dpsLinhas.push([
        c(z.nome, { b: true }),
        c(t === "energia" ? "Energia" : "Sinal"),
        cr(fmtParam(rz.prob.porTipo[t]?.KS3 ?? valor(KS3, z[t].KS3))),
        c(rotulo(KS3, z[t].KS3) + (z[t].comprimento && z[t].comprimento! < 100 ? ` — reduzido a ${fmtNum(z[t].comprimento)} m` : "")),
        cr(fmtParam(valor(PSPD, z[t].PSPD))),
        c(rotulo(PSPD, z[t].PSPD)),
      ]);
    }
  }
  if (dpsLinhas.length)
    blocos.push({
      tipo: "tabela",
      colunas: [{ titulo: "Zona", peso: 0.8 }, { titulo: "Tipo de linha", peso: 0.7 }, { titulo: "KS3", peso: 0.5, align: "right" }, { titulo: "Descrição KS3", peso: 2 }, { titulo: "PSPD", peso: 0.5, align: "right" }, { titulo: "Descrição PSPD", peso: 1.1 }],
      linhas: dpsLinhas,
      legenda: "DPS por zona — linhas internas de energia e sinal.",
    });
  else blocos.push({ tipo: "paragrafo", texto: "Sem linhas externas: não há DPS de linha a especificar por zona." });
  secao++;

  // ------------------------------------------------------------ 12
  blocos.push({ tipo: "titulo", nivel: 1, texto: `${secao}. Medidas por Zona` });
  for (const z of d.zonas) {
    const rz = r.zonas.find((x) => x.id === z.id)!;
    blocos.push({ tipo: "titulo", nivel: 2, texto: z.nome });
    const linhas: LinhaTabela[] = [
      [c("rt (tipo de piso)"), cr(fmtParam(valor(RT_PISO, z.rt)), { b: true }), c(rotulo(RT_PISO, z.rt))],
      [c("PTA (toque/passo)"), cr(fmtParam(valor(PTA, z.PTA)), { b: true }), c(rotulo(PTA, z.PTA))],
      [c("PTU (surtos em linhas internas)"), cr(fmtParam(valor(PTU, z.PTU)), { b: true }), c(rotulo(PTU, z.PTU))],
      [c("KS2 (blindagem espacial da zona)"), cr(fmtParam(rz.prob.KS2), { b: true }), c(z.semBlindagemKs2 ? "Sem blindagem interna em malha" : "Blindagem interna em malha")],
      ...tiposLinha.flatMap((t) => [
        [c(`KS3 — linhas de ${t === "energia" ? "energia" : "sinal/telecom"}`), cr(fmtParam(rz.prob.porTipo[t]?.KS3 ?? 1), { b: true }), c(rotulo(KS3, z[t].KS3))],
        [c(`PSPD — linhas de ${t === "energia" ? "energia" : "sinal/telecom"}`), cr(fmtParam(valor(PSPD, z[t].PSPD)), { b: true }), c(rotulo(PSPD, z[t].PSPD))],
      ]),
      [c("rp (proteção contra incêndio)"), cr(fmtParam(valor(RP, z.rp)), { b: true }), c(rotulo(RP, z.rp))],
      [c("rf (risco de incêndio)"), cr(fmtParam(valor(RF, z.rf)), { b: true }), c(rotulo(RF, z.rf))],
      [c("hz (perigo especial)"), cr(fmtParam(valor(HZ, z.hz)), { b: true }), c(rotulo(HZ, z.hz))],
    ];
    blocos.push({ tipo: "tabela", colunas: [{ titulo: "Medida", peso: 1.4 }, { titulo: "Valor", peso: 0.5, align: "right" }, { titulo: "Descrição", peso: 2.4 }], linhas });
  }

  blocos.push({
    tipo: "assinatura",
    local: projeto.cidade || "________________",
    data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
    nome: rt.nome,
    registro: rt.registro,
    empresa: rt.empresa,
    art: rt.art,
  });

  return {
    // Padrão da GTA para o arquivo baixado: "CLIENTE - ANÁLISE DE RISCO - GTA ENERGIA".
    arquivo: `${(projeto.cliente.trim() || nome).toLocaleUpperCase("pt-BR")} - ANÁLISE DE RISCO - GTA ENERGIA`,
    cabecalho: `Análise de Risco — NBR 5419-2:2026 — ${nome}`,
    emitidoEm: new Date().toLocaleDateString("pt-BR"),
    capa: {
      faixa: "Análise de Risco - SPDA",
      titulo: "Proteção contra Descargas Atmosféricas",
      subtitulo: nome,
      norma: "NBR 5419-2:2026",
      veredito: {
        ok,
        titulo: ok ? "Riscos dentro do tolerável" : "Proteção necessária",
        texto: ok ? (medidas.length ? "Com as medidas de proteção adotadas." : "Sem necessidade de medidas de proteção.") : "Riscos acima do tolerável — adotar medidas de proteção.",
      },
      metadados: [
        { rotulo: "Norma", valor: "ABNT NBR 5419-2:2026" },
        { rotulo: "Data da análise", valor: dataAnalise },
        { rotulo: "Responsável técnico", valor: rt.nome },
        { rotulo: "CREA/CFT", valor: rt.registro },
        { rotulo: "Empresa", valor: rt.empresa },
        { rotulo: "Obra/Cliente", valor: projeto.cliente },
        { rotulo: "Endereço da obra", valor: [projeto.endereco, projeto.cidade].filter(Boolean).join(" — ") },
        ...(rt.art ? [{ rotulo: "ART/TRT", valor: rt.art }] : []),
      ],
    },
    sumario: true,
    blocos,
  };
}
