import { formatDecimal } from "@/lib/format";

/**
 * Lista de materiais GENÉRICA (sem marca/modelo) — serve para a GTA cotar o kit
 * com o distribuidor. Quantidades derivadas do nº de painéis / kWp.
 */

export type TipoInversor = "string" | "micro";

export interface BomInput {
  nPaineis: number;
  potenciaPainel: number; // W
  tipoInversor: TipoInversor;
  potenciaInversor: number; // kW
  qtdInversores: number;
  tipoTelhado: string; // ex.: "Metálico", "Colonial", "Fibrocimento", "Laje"
  /** Só no microinversor: potência CA de cada unidade (W) e nº de ramais de tronco. */
  microPotenciaW?: number;
  microRamais?: number;
}

export interface BomItem {
  qtde: string;
  descricao: string;
}

/** Arredonda para o múltiplo de 5 mais próximo, com um piso. */
function round5(n: number, piso: number): number {
  return Math.max(piso, Math.round(n / 5) * 5);
}

/**
 * Lista genérica de um sistema on-grid, do lado CC ao lado CA, incluindo
 * aterramento, proteções, eletrodutos e sinalização (itens que a GTA sempre
 * fornece/instala). Quantidades são ESTIMATIVAS derivadas do nº de módulos —
 * o comprador ajusta na cotação. Distingue string × microinversor no lado CC.
 */
export function gerarBom(i: BomInput): BomItem[] {
  const invLabel = i.tipoInversor === "micro" ? "MICROINVERSOR" : "INVERSOR";
  const micro = i.tipoInversor === "micro";
  const nMod = Math.max(1, i.nPaineis);

  // Estimativas genéricas (ajustáveis na cotação):
  const caboCC = round5(nMod * 2.5, 30); // por cor (preto/vermelho), lado CC
  const caboCA = round5(nMod * 1.2, 15); // do inversor ao quadro de proteção
  const eletroduto = round5(nMod * 1.5, 20); // + curvas, luvas, abraçadeiras
  const aterramento = round5(nMod, 15); // cabo de cobre p/ malha de aterramento
  const paresMC4 = Math.max(4, Math.ceil(nMod / 10) * 2 + 2);

  // No micro, o "inversor" é descrito em W por unidade (é isso que se compra).
  const linhaInversor = micro && i.microPotenciaW
    ? { qtde: String(i.qtdInversores), descricao: `${invLabel} ${i.microPotenciaW} W` }
    : { qtde: String(i.qtdInversores), descricao: `${invLabel} ${formatDecimal(i.potenciaInversor, 2)} kW` };

  const itens: BomItem[] = [
    { qtde: String(nMod), descricao: `MÓDULO FOTOVOLTAICO ${i.potenciaPainel} Wp` },
    linhaInversor,
    { qtde: "1", descricao: `ESTRUTURA DE FIXAÇÃO PARA TELHADO ${i.tipoTelhado.toUpperCase()} — KIT PARA ${nMod} MÓDULOS` },
  ];

  // Lado CC: no micro o cabeamento CC é curto (módulo → micro, já com conectores
  // de fábrica); no string percorre todo o telhado até a string box.
  if (micro) {
    itens.push({ qtde: `${round5(nMod * 0.5, 10)} m`, descricao: "CABO SOLAR 6 MM² 1,8 kV CC — EXTENSÃO MÓDULO → MICROINVERSOR" });
  } else {
    itens.push(
      { qtde: `${caboCC} m`, descricao: "CABO SOLAR 6 MM² 1,8 kV CC — PRETO" },
      { qtde: `${caboCC} m`, descricao: "CABO SOLAR 6 MM² 1,8 kV CC — VERMELHO" },
    );
  }
  itens.push({ qtde: `${paresMC4}`, descricao: "PAR DE CONECTORES FOTOVOLTAICOS MC4 (MACHO/FÊMEA)" });

  // Coleta/proteção: string box (string) × tronco CA por ramal (micro). O micro
  // já traz proteção CC e desligamento por módulo integrados — não leva string box.
  if (micro) {
    const ramais = Math.max(1, i.microRamais ?? 1);
    itens.push(
      { qtde: `${round5(nMod * 1.5, 20)} m`, descricao: "CABO TRONCO CA PARA MICROINVERSORES (barramento de conexão rápida)" },
      { qtde: String(i.qtdInversores), descricao: "CONECTOR DE DERIVAÇÃO DO TRONCO CA (1 por microinversor)" },
      { qtde: String(ramais), descricao: "KIT DE TERMINAÇÃO DO TRONCO CA — CONECTOR FINAL + TAMPA DE VEDAÇÃO (1 por ramal)" },
      { qtde: String(ramais), descricao: "DISJUNTOR DE RAMAL CA — PROTEÇÃO DO TRONCO (conforme projeto)" },
    );
  } else {
    itens.push({ qtde: "1", descricao: "STRING BOX CC — DPS CC + FUSÍVEIS + CHAVE SECCIONADORA (conforme projeto)" });
  }

  itens.push(
    { qtde: `${caboCA} m`, descricao: `CABO DE COBRE FLEXÍVEL CA (${micro ? "tronco" : "inversor"} → quadro de proteção)` },
    { qtde: "1", descricao: "QUADRO / CAIXA DE PROTEÇÃO CA (conforme projeto)" },
    { qtde: "1", descricao: `DISJUNTOR CA GERAL — dimensionado para ${micro ? "a potência CA total" : "o inversor"} (conforme projeto)` },
    { qtde: "1", descricao: "DPS CA — CLASSE II (conforme projeto)" },
    { qtde: `${eletroduto} m`, descricao: "ELETRODUTO / CONDUÍTE + ACESSÓRIOS (curvas, luvas, abraçadeiras)" },
    { qtde: `${aterramento} m`, descricao: "CABO DE COBRE PARA ATERRAMENTO 6–16 MM²" },
    { qtde: "1", descricao: 'HASTE DE ATERRAMENTO COBREADA 5/8" × 2,4 m + CONECTOR' },
    { qtde: "1", descricao: "TERMINAIS, CONECTORES E MATERIAIS DE FIXAÇÃO/VEDAÇÃO (kit)" },
    { qtde: "1", descricao: "PLACA DE SINALIZAÇÃO / ADVERTÊNCIA DE GERAÇÃO DISTRIBUÍDA" },
  );

  // O microinversor não tem display: o monitoramento (e a leitura por módulo)
  // depende do gateway de comunicação — item obrigatório do kit.
  if (micro) {
    itens.push({ qtde: "1", descricao: "GATEWAY / DTU DE MONITORAMENTO DOS MICROINVERSORES (Wi-Fi ou Ethernet)" });
  }

  return itens;
}

/** Texto simples da lista (para copiar e enviar ao distribuidor). */
export function bomParaTexto(itens: BomItem[]): string {
  return itens.map((it) => `${it.qtde}\t${it.descricao}`).join("\n");
}
