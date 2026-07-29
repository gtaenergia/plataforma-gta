import type { MapResult } from "../types";
import {
  addDays,
  buildReference,
  capitalize,
  formatBRL,
  formatDateLong,
  formatDateShort,
  formatMoney,
  moneyToWords,
  parseNumber,
} from "@/lib/format";
import { patchSolarChart } from "@/lib/docx/patchChart";
import { getDistribuidor } from "./presets";
import type { SolarFormData } from "./config";

/**
 * Transforma os dados do formulário Solar nos marcadores do molde e prepara o
 * patch do gráfico nativo (Geração × Consumo).
 */
export function mapSolar(form: SolarFormData): MapResult {
  const emissao = new Date(`${form.dataEmissao}T12:00:00`);
  const ano = emissao.getFullYear();
  const validadeData = addDays(emissao, form.validadeDias);

  const cidadeCurta = form.cidadeUf.split("/")[0]?.trim() || "Goiânia";

  const dist = getDistribuidor(form.distribuidor);
  const distribuidorNome = form.distribuidorNome?.trim() || dist.nome;
  const distribuidorCnpj = form.distribuidorCnpj?.trim() || dist.cnpj;

  // Totais anuais somados a partir dos 12 meses
  const somaEnergia = form.simulacao.reduce((s, m) => s + parseNumber(m.energia), 0);
  const somaConsumo = form.simulacao.reduce((s, m) => s + parseNumber(m.consumo), 0);

  // Investimento
  const valorKitNum = parseNumber(form.valorKit);
  const valorGtaNum = parseNumber(form.valorGta);
  const valorTotalNum = valorKitNum + valorGtaNum;

  const ehMicro = form.tipoInversor === "microinversor";
  const labelQtdInversores = ehMicro ? "Quantidade de Microinversores" : "Quantidade de Inversores";
  // No micro a linha traz a potência CA TOTAL do conjunto (não a de uma unidade),
  // que é o número que a distribuidora usa no parecer de acesso.
  const labelPotInversor = ehMicro ? "Potência Total dos Microinversores (kW)" : "Potência do Inversor (kWp)";

  const data = {
    // cabeçalho
    subtitulo: form.subtitulo,
    clienteTitulo: `${form.clienteNome.toUpperCase()} — ${form.cidadeUf.toUpperCase()}`,
    clienteCidade: `${form.clienteNome} — ${form.cidadeUf}`,
    objeto: form.objeto,
    referencia: buildReference("SOLAR", form.clienteNome, form.referenciaSeq, ano),
    dataEmissao: formatDateLong(emissao, cidadeCurta),
    validade: `${formatDateShort(validadeData)} (${form.validadeDias} dias corridos)`,
    formaPagamento: form.formaPagamento,

    // objetivo
    textoObjetivo: form.textoObjetivo,

    // dimensionamento
    potenciaPainel: form.potenciaPainel,
    qtdPaineis: form.qtdPaineis,
    potenciaTotal: form.potenciaTotal,
    potenciaInversor: form.potenciaInversor,
    overload: form.overload,
    qtdInversores: form.qtdInversores,
    labelPotInversor,
    labelQtdInversores,

    // simulação (loop) + totais
    simulacao: form.simulacao.map((m) => ({
      mes: m.mes,
      insolacao: m.insolacao,
      energia: m.energia,
      consumo: m.consumo,
    })),
    totalEnergia: `${formatMoney(somaEnergia)} kWh`,
    totalConsumo: `${formatMoney(somaConsumo)} kWh`,
    textoObservacao: form.textoObservacao,

    // materiais (loop)
    materiais: form.materiais.map((m) => ({ qtde: m.qtde, descricao: m.descricao })),

    // investimento
    distribuidorNome,
    distribuidorNomeCurto: dist.nomeCurto || distribuidorNome,
    distribuidorCnpj,
    kitItens: form.kitItens,
    valorKit: formatBRL(valorKitNum),
    valorGta: formatBRL(valorGtaNum),
    valorTotal: formatBRL(valorTotalNum),
    valorTotalExtenso: capitalize(moneyToWords(valorTotalNum)) + ".",

    // economia/payback (bloco condicional — só aparece quando calculado)
    temEconomia: Boolean(form.economiaMensal?.trim()),
    economiaMensal: form.economiaMensal ?? "",
    economiaAno1: form.economiaAno1 ?? "",
    paybackTexto: form.paybackTexto ?? "",

    // garantia
    textoGarantia: dist.garantia,

    // prazo
    prazoExecucao: form.prazoExecucao,

    // aceite
    clienteNomeUpper: form.clienteNome.toUpperCase(),
    cidadeUf: form.cidadeUf,
  };

  const geracao = form.simulacao.map((m) => parseNumber(m.energia));
  const consumo = form.simulacao.map((m) => parseNumber(m.consumo));

  return {
    data,
    patch: (zip) => patchSolarChart(zip, { geracao, consumo }),
  };
}
