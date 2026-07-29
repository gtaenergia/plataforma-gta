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
  /** Só no microinversor: potência CA de cada unidade (kW) e nº de ramais de tronco. */
  microPotenciaKw?: number;
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
 * Lista genérica de um sistema on-grid, do lado CC ao lado CA.
 *
 * É deliberadamente CORINGA: só os itens que definem o sistema (módulo,
 * inversor) vão soltos e contados; todo o resto — cabeamento, proteção,
 * eletrodutos, aterramento, acessórios — vem agrupado em KITS de quantidade 1,
 * do jeito que o distribuidor cota e o instalador compra. Assim a lista já sai
 * pronta e quase não precisa ser editada.
 *
 * As estimativas (metragens, nº de conectores) não somem: viram uma referência
 * entre parênteses dentro da descrição do kit, para o comprador dimensionar sem
 * ter que recontar. Distingue string × microinversor.
 */
export function gerarBom(i: BomInput): BomItem[] {
  const invLabel = i.tipoInversor === "micro" ? "MICROINVERSOR" : "INVERSOR";
  const micro = i.tipoInversor === "micro";
  const nMod = Math.max(1, i.nPaineis);
  const ramais = Math.max(1, i.microRamais ?? 1);

  // Estimativas genéricas — entram como referência na descrição dos kits.
  const caboCC = round5(nMod * 2.5, 30); // por polaridade, lado CC (string)
  const caboCCMicro = round5(nMod * 0.5, 10); // extensão curta módulo → micro
  const caboCA = round5(nMod * 1.2, 15); // até o quadro de proteção
  const eletroduto = round5(nMod * 1.5, 20);
  const aterramento = round5(nMod, 15);
  const caboTronco = round5(nMod * 1.5, 20);
  const paresMC4 = Math.max(4, Math.ceil(nMod / 10) * 2 + 2);

  // No micro a linha traz a potência de CADA unidade (é isso que se compra);
  // no string, a do inversor central.
  const linhaInversor = micro && i.microPotenciaKw
    ? { qtde: String(i.qtdInversores), descricao: `${invLabel} ${formatDecimal(i.microPotenciaKw, 2)} kW` }
    : { qtde: String(i.qtdInversores), descricao: `${invLabel} ${formatDecimal(i.potenciaInversor, 2)} kW` };

  const itens: BomItem[] = [
    { qtde: String(nMod), descricao: `MÓDULO FOTOVOLTAICO ${i.potenciaPainel} Wp` },
    linhaInversor,
    // "PARA TELHADO X" não serve para Laje/Solo — o tipo já se explica sozinho.
    { qtde: "1", descricao: `KIT DE FIXAÇÃO ${i.tipoTelhado.toUpperCase()} — PARA ${nMod} MÓDULOS (perfis, grampos, ganchos e parafusos)` },
  ];

  // Lado CC: no micro é uma extensão curta módulo → micro (o micro já traz
  // proteção CC e desligamento integrados, dispensando string box).
  if (micro) {
    itens.push({
      qtde: "1",
      descricao: `KIT DE CABEAMENTO CC — CABO SOLAR 6 MM² + CONECTORES MC4 (≈ ${caboCCMicro} m, extensão módulo → microinversor)`,
    });
    itens.push({
      qtde: "1",
      descricao: `KIT DE CONEXÃO CA DOS MICROINVERSORES — CABO, CONECTORES E VEDAÇÃO PARA ${i.qtdInversores} ${i.qtdInversores > 1 ? "UNIDADES" : "UNIDADE"} (≈ ${caboTronco} m)`,
    });
  } else {
    itens.push({
      qtde: "1",
      descricao: `KIT DE CABEAMENTO CC — CABO SOLAR 6 MM² 1,8 kV PRETO E VERMELHO + ${paresMC4} PARES DE CONECTORES MC4 (≈ ${caboCC} m por polaridade)`,
    });
    itens.push({ qtde: "1", descricao: "STRING BOX CC — DPS CC + FUSÍVEIS + CHAVE SECCIONADORA (conforme projeto)" });
  }

  itens.push(
    {
      qtde: "1",
      descricao: micro
        ? `KIT DE PROTEÇÃO CA — QUADRO + DISJUNTOR GERAL (potência CA total) + ${ramais} ${ramais > 1 ? "DISJUNTORES DE CIRCUITO" : "DISJUNTOR DE CIRCUITO"} + DPS CLASSE II (conforme projeto)`
        : "KIT DE PROTEÇÃO CA — QUADRO + DISJUNTOR GERAL (dimensionado para o inversor) + DPS CLASSE II (conforme projeto)",
    },
    {
      qtde: "1",
      descricao: `KIT DE CABEAMENTO E INFRAESTRUTURA CA — CABO DE COBRE FLEXÍVEL + ELETRODUTO E ACESSÓRIOS (≈ ${caboCA} m de cabo, ≈ ${eletroduto} m de eletroduto)`,
    },
    {
      qtde: "1",
      descricao: `KIT DE ATERRAMENTO — CABO DE COBRE 6–16 MM² + HASTE COBREADA 5/8" × 2,4 m + CONECTORES (≈ ${aterramento} m)`,
    },
    {
      qtde: "1",
      descricao: "KIT DE INSTALAÇÃO E ACABAMENTO — TERMINAIS, CONECTORES, FIXAÇÃO, VEDAÇÃO E PLACA DE SINALIZAÇÃO DE GERAÇÃO DISTRIBUÍDA",
    },
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
