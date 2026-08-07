import ExcelJS from "exceljs";
import { Aba, novaPlanilha, cabecalho, num, BRL, PCT, NUM } from "./core";

/** Dias por mês (28 em fevereiro, sem bissexto — como na planilha de geração). */
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const HSP_FMT = "0.000";
const KWH_MES = '#,##0 "kWh/mês"';
const HSP2 = "0.00";
const WP = '#,##0 "Wp"';
const KWFMT = '0.0 "kW"';
const KWP = '#,##0.00 "kWp"';
const INT = "0";
const KWH = '#,##0 "kWh"';
const ANOS = '0.0 "anos"';

/**
 * Planilha COMPLETA do Solar (fotovoltaico on-grid) com FÓRMULAS VIVAS.
 * Cinco abas espelham o motor do configurador (sizing/pricing/generation/economia)
 * e a lista de materiais (bom):
 *
 *   1. Dimensionamento — kWp necessária, nº de painéis, kWp total, overload
 *   2. Preço           — Total = (Kit+civil)×Fator; custos → lucro/margem líquida
 *   3. Materiais       — lista genérica (BOM) para cotar o kit
 *   4. Geração         — HSP × kWp × Eficiência × Dias, 12 meses + total anual
 *   5. Payback         — fluxo de caixa de 25 anos; saldo acumulado por fórmula
 */
export function planilhaSolar(d: {
  cliente?: string;
  referencia?: string;
  // dimensionamento
  sizing?: {
    consumoMedio: number;
    hspMedia: number;
    disponibilidade: number;
    kwpNecessaria: number;
    nPaineis: number;
    potenciaPainel: number;
    potenciaInversor: number;
    qtdInversores: number;
  };
  kwp?: number; // kWp total
  // preço
  kit: number;
  fator: number;
  execucaoCivil?: number;
  valorTotal?: number;
  servicos?: number;
  eficiencia?: number; // fração (0,75 = 75%)
  precoParams?: {
    instalacaoPorPainel: number;
    materialCaPorWp: number;
    deslocamentoUnit: number;
    viagens: number;
    art: number;
    impostoPct: number;
    comissaoPct: number;
  };
  custos?: {
    instalacao: number;
    materialCa: number;
    deslocamento: number;
    art: number;
    imposto: number;
    comissao: number;
  };
  // materiais (lista genérica editável)
  materiais?: { qtde: string; descricao: string }[];
  // geração
  geracao?: { mes: string; hsp: number; dias?: number }[];
  // economia / payback
  economia?: {
    economiaPorAno: number[];
    investimento: number;
    paybackAnos: number;
    economiaAno1: number;
    economiaHorizonte: number;
  };
}): ExcelJS.Workbook {
  const wb = novaPlanilha();
  const kit = num(d.kit);
  const fator = num(d.fator) || 1;
  const ec = num(d.execucaoCivil);
  const kwp = num(d.kwp) || (d.sizing ? (num(d.sizing.nPaineis) * num(d.sizing.potenciaPainel)) / 1000 : 0);
  const efic = num(d.eficiencia);

  // ==================================================== Aba 1 · Dimensionamento
  if (d.sizing) {
    const s = d.sizing;
    const a = new Aba(wb, "Dimensionamento");
    cabecalho(a, "Sistema Fotovoltaico — Dimensionamento", { cliente: d.cliente, referencia: d.referencia });

    a.secao("Entradas (da conta e do local)");
    const consRef = a.campo("Consumo médio", num(s.consumoMedio), { fmt: KWH_MES });
    const hspRef = a.campo("HSP média (irradiação local)", num(s.hspMedia), { fmt: HSP2, nota: "kWh/m²·dia" });
    const dispRef = a.campo("Disponibilidade (mín. da concessionária)", num(s.disponibilidade), { fmt: KWH });
    const eficRef = a.campo("Eficiência do sistema", efic, { fmt: PCT, nota: "perdas totais (cabos, inversor, sujeira, temperatura)" });
    a.espaco();

    a.secao("Dimensionamento (fórmulas da planilha GTA)");
    const kwpNecNum = num(s.kwpNecessaria);
    const kwpNecRef = a.formula(
      "Potência necessária (kWp)",
      `((${consRef}-${dispRef})/30/${hspRef}/${eficRef})*1.15`,
      kwpNecNum,
      { fmt: KWP, nota: "((consumo − disponibilidade)/30 / HSP / eficiência) × 1,15" },
    );
    const wpRef = a.campo("Potência do painel", num(s.potenciaPainel), { fmt: WP });
    const nRef = a.campo("Nº de painéis (aplicado)", num(s.nPaineis), { fmt: INT, nota: `sugestão ≈ ${Math.ceil((kwpNecNum * 1000) / (num(s.potenciaPainel) || 1))}` });
    const kwpTotalNum = kwp;
    const kwpTotalRef = a.formula("Potência instalada (kWp)", `${nRef}*${wpRef}/1000`, kwpTotalNum, { fmt: KWP, destaque: true });
    const invRef = a.campo("Inversor (potência)", num(s.potenciaInversor), { fmt: KWFMT });
    a.campo("Qtd. de inversores", num(s.qtdInversores), { fmt: INT });
    const invKw = num(s.potenciaInversor);
    a.formula("Overload do inversor", `${kwpTotalRef}/${invRef}-1`, invKw > 0 ? kwpTotalNum / invKw - 1 : 0, { fmt: PCT, nota: "kWp dos painéis ÷ inversor − 1" });
  }

  // =============================================================== Aba 2 · Preço
  const a = new Aba(wb, "Preço");
  cabecalho(a, "Sistema Fotovoltaico On-Grid — Preço", { cliente: d.cliente, referencia: d.referencia });

  a.secao("Kit e fator (Total = (Kit + Execução civil) × Fator)");
  const kitRef = a.campo("Kit (cotação do distribuidor)", kit, { fmt: BRL });
  const ecRef = a.campo("Execução civil", ec, { fmt: BRL });
  const fatorRef = a.campo("Fator (markup)", fator, { fmt: NUM, nota: "editável — recalcula abaixo" });
  const totalNum = d.valorTotal != null ? num(d.valorTotal) : (kit + ec) * fator;
  const totalRef = a.formula("Valor total (ao cliente)", `(${kitRef}+${ecRef})*${fatorRef}`, totalNum, { fmt: BRL, destaque: true });
  const servicosNum = d.servicos != null ? num(d.servicos) : totalNum - kit - ec;
  const servRef = a.formula("Serviços GTA (faturamento)", `${totalRef}-${kitRef}-${ecRef}`, servicosNum, { fmt: BRL, bold: true });
  a.espaco();

  if (d.precoParams && d.sizing) {
    // --- custos VIVOS: derivados dos parâmetros × drivers (nº painéis, Wp, viagens) ---
    const p = d.precoParams;
    const nPaineis = num(d.sizing.nPaineis);
    const wpInstalado = kwp * 1000;
    a.secao("Custos e margem (uso interno — fórmulas vivas)");
    const nRef = a.campo("Nº de painéis", nPaineis, { fmt: INT });
    const instUnitRef = a.campo("Instalação por painel", num(p.instalacaoPorPainel), { fmt: BRL });
    const instNum = num(p.instalacaoPorPainel) * nPaineis;
    const instRef = a.formula("Instalação", `${nRef}*${instUnitRef}`, instNum, { fmt: BRL });
    const wpRef2 = a.campo("Potência instalada (Wp)", wpInstalado, { fmt: WP });
    const caUnitRef = a.campo("Material CA por Wp", num(p.materialCaPorWp), { fmt: BRL });
    const caNum = num(p.materialCaPorWp) * wpInstalado;
    const caRef = a.formula("Material CA", `${wpRef2}*${caUnitRef}`, caNum, { fmt: BRL });
    const deslUnitRef = a.campo("Deslocamento (unitário)", num(p.deslocamentoUnit), { fmt: BRL });
    const viagRef = a.campo("Viagens", num(p.viagens), { fmt: INT });
    const deslNum = num(p.deslocamentoUnit) * num(p.viagens);
    const deslRef = a.formula("Deslocamento", `${deslUnitRef}*${viagRef}`, deslNum, { fmt: BRL });
    const artRef = a.campo("ART", num(p.art), { fmt: BRL });
    const impPctRef = a.campo("Imposto / NF", num(p.impostoPct), { fmt: PCT });
    const impNum = servicosNum * num(p.impostoPct);
    const impRef = a.formula("Imposto (R$)", `${servRef}*${impPctRef}`, impNum, { fmt: BRL });
    a.espaco();

    // Custo base (SEM comissão) → lucro/margem, como no pricing.ts.
    // A execução civil fica FORA: "Serviços GTA" já a descontou junto com o
    // kit, e subtraí-la de novo era o defeito herdado da planilha-fonte.
    const parcelas = [instRef, caRef, deslRef, artRef, impRef];
    const custoBaseNum = instNum + caNum + deslNum + num(p.art) + impNum;
    const custoBaseRef = a.formula("Custo base (sem comissão)", parcelas.join("+"), custoBaseNum, { fmt: BRL, bold: true });
    const lucroNum = servicosNum - custoBaseNum;
    const lucroRef = a.formula("Lucro", `${servRef}-${custoBaseRef}`, lucroNum, { fmt: BRL });
    a.formula("Margem", `${lucroRef}/${servRef}`, servicosNum > 0 ? lucroNum / servicosNum : 0, { fmt: PCT });
    a.espaco();

    // comissão → lucro/margem LÍQUIDOS
    const comPctRef = a.campo("Comissão", num(p.comissaoPct), { fmt: PCT });
    const comNum = servicosNum * num(p.comissaoPct);
    const comRef = a.formula("Comissão (R$)", `${servRef}*${comPctRef}`, comNum, { fmt: BRL });
    const lucroLiqNum = lucroNum - comNum;
    const lucroLiqRef = a.formula("Lucro líquido", `${lucroRef}-${comRef}`, lucroLiqNum, { fmt: BRL, destaque: true });
    a.formula("Margem líquida", `${lucroLiqRef}/${servRef}`, servicosNum > 0 ? lucroLiqNum / servicosNum : 0, { fmt: PCT, destaque: true });
  } else if (d.custos) {
    // --- fallback: custos já calculados (sem os parâmetros para montar fórmulas) ---
    const c = d.custos;
    a.secao("Custos e margem (uso interno)");
    const instRef = a.campo("Instalação", num(c.instalacao), { fmt: BRL });
    const caRef = a.campo("Material CA", num(c.materialCa), { fmt: BRL });
    const deslRef = a.campo("Deslocamento", num(c.deslocamento), { fmt: BRL });
    const artRef = a.campo("ART", num(c.art), { fmt: BRL });
    const impRef = a.campo("Imposto / NF", num(c.imposto), { fmt: BRL });
    const custoBaseNum = num(c.instalacao) + num(c.materialCa) + num(c.deslocamento) + num(c.art) + num(c.imposto);
    const custoBaseRef = a.formula("Custo base (sem comissão)", `${instRef}+${caRef}+${deslRef}+${artRef}+${impRef}`, custoBaseNum, { fmt: BRL, bold: true });
    const lucroNum = servicosNum - custoBaseNum;
    const lucroRef = a.formula("Lucro", `${servRef}-${custoBaseRef}`, lucroNum, { fmt: BRL });
    a.formula("Margem", `${lucroRef}/${servRef}`, servicosNum > 0 ? lucroNum / servicosNum : 0, { fmt: PCT });
    const comRef = a.campo("Comissão", num(c.comissao), { fmt: BRL });
    const lucroLiqNum = lucroNum - num(c.comissao);
    const lucroLiqRef = a.formula("Lucro líquido", `${lucroRef}-${comRef}`, lucroLiqNum, { fmt: BRL, destaque: true });
    a.formula("Margem líquida", `${lucroLiqRef}/${servRef}`, servicosNum > 0 ? lucroLiqNum / servicosNum : 0, { fmt: PCT, destaque: true });
  }

  // =========================================================== Aba 3 · Materiais
  const mats = (d.materiais ?? []).filter((m) => (m.descricao ?? "").trim());
  if (mats.length) {
    const m = new Aba(wb, "Materiais");
    cabecalho(m, "Lista de Materiais (para cotar o kit)", { cliente: d.cliente, referencia: d.referencia });
    m.secao("Composição do sistema — lista genérica (sem marca)");
    m.tabela(
      ["Material", "Qtde"],
      mats.map((it) => [it.descricao || "—", it.qtde || ""]),
      [undefined, undefined],
    );
    m.espaco();
    m.campo("Itens", mats.length, { fmt: INT, nota: "Quantidades estimadas — ajuste na cotação com o distribuidor." });
  }

  // ============================================================ Aba 4 · Geração
  const linhasGer = d.geracao ?? [];
  if (linhasGer.length) {
    const g = new Aba(wb, "Geração");
    cabecalho(g, "Previsão de Geração (12 meses)", { cliente: d.cliente, referencia: d.referencia });
    g.secao("Geração = HSP × kWp × Eficiência × Dias");

    const dataStart = g.linhaAtual + 1; // 1ª linha de dados (após o cabeçalho da tabela)
    const linhas = linhasGer.map((l, i) => {
      const rn = dataStart + i;
      const dias = num(l.dias) || DIAS[i] || 30;
      const hsp = num(l.hsp);
      return [
        l.mes,
        hsp,
        kwp,
        efic,
        dias,
        { formula: `B${rn}*C${rn}*D${rn}*E${rn}`, result: hsp * kwp * efic * dias },
      ];
    });
    const t = g.tabela(
      ["Mês", "HSP", "kWp", "Efic.", "Dias", "Geração (kWh)"],
      linhas,
      [undefined, HSP_FMT, NUM, PCT, "0", NUM],
    );
    const totalNumGer = linhasGer.reduce((s, l, i) => s + num(l.hsp) * kwp * efic * (num(l.dias) || DIAS[i] || 30), 0);
    g.espaco();
    g.formula("Geração anual (kWh)", `SUM(F${t.primeira}:F${t.ultima})`, totalNumGer, { fmt: NUM, destaque: true });
  }

  // ============================================================= Aba 5 · Payback
  const eco = d.economia;
  if (eco && eco.economiaPorAno.length) {
    const p = new Aba(wb, "Payback");
    cabecalho(p, "Retorno do Investimento (25 anos)", { cliente: d.cliente, referencia: d.referencia });

    p.secao("Fluxo de caixa (saldo acumulado por fórmula)");
    const investNum = num(eco.investimento);
    const investRef = p.campo("Investimento (valor total)", investNum, { fmt: BRL, destaque: true });
    p.espaco();

    const anos = eco.economiaPorAno.length;
    const primeira = p.linhaAtual + 1; // 1ª linha de dados (após o cabeçalho da tabela)
    let saldoAcc = -investNum;
    const linhas = eco.economiaPorAno.map((econ, i) => {
      const rn = primeira + i;
      const e = num(econ);
      saldoAcc += e;
      // Saldo acumulado = saldo anterior + economia do ano (ano 1: −investimento + economia)
      const saldoFormula = i === 0 ? `-${investRef}+B${rn}` : `C${rn - 1}+B${rn}`;
      return [i + 1, e, { formula: saldoFormula, result: saldoAcc }];
    });
    const t = p.tabela(
      ["Ano", "Economia do ano", "Saldo acumulado"],
      linhas,
      [INT, BRL, BRL],
    );
    p.espaco();

    p.secao("Resumo");
    p.formula("Economia no 1º ano", `B${t.primeira}`, num(eco.economiaAno1), { fmt: BRL });
    p.formula("Economia média por mês", `B${t.primeira}/12`, num(eco.economiaAno1) / 12, { fmt: BRL });
    p.formula(`Economia total (${anos} anos)`, `SUM(B${t.primeira}:B${t.ultima})`, num(eco.economiaHorizonte), { fmt: BRL, destaque: true });
    p.campo("Payback", num(eco.paybackAnos), { fmt: ANOS, destaque: true, nota: eco.paybackAnos > anos ? "acima do horizonte" : "1º ano com saldo ≥ 0" });
    p.espaco();
    p.campo("", "", { nota: "A economia de cada ano já embute a inflação da tarifa, a degradação dos módulos e o avanço do Fio B (Lei 14.300)." });
  }

  return wb;
}
