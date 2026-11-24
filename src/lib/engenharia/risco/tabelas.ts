/**
 * Tabelas da ABNT NBR 5419-2:2026 usadas na análise de risco.
 *
 * Cada parâmetro de menu é uma lista de opções com o valor normativo, o texto
 * que vai para o laudo e a referência da tabela. A entrada guarda o `id` da
 * opção, e não o número: assim o laudo sabe dizer POR QUE o valor é aquele
 * ("SPDA Nível I"), e uma correção de texto aqui alcança os projetos antigos.
 */

export interface Opcao {
  id: string;
  valor: number;
  rotulo: string;
}

export interface Parametro {
  simbolo: string;
  nome: string;
  ref: string;
  opcoes: Opcao[];
}

const p = (simbolo: string, nome: string, ref: string, opcoes: [string, number, string][]): Parametro => ({
  simbolo,
  nome,
  ref,
  opcoes: opcoes.map(([id, valor, rotulo]) => ({ id, valor, rotulo })),
});

// ------------------------------------------------------------- estrutura

export const CD = p("CD", "Fator de localização da estrutura", "Tabela A.1", [
  ["cercada-mais-altos", 0.25, "Estrutura cercada por objetos significativamente mais altos"],
  ["cercada-mesma-altura", 0.5, "Estrutura cercada por objetos da mesma altura ou ligeiramente mais baixos"],
  ["isolada", 1, "Estrutura isolada: nenhum outro objeto nas vizinhanças ou cercada por objetos significativamente mais baixos"],
  ["topo-colina", 2, "Estrutura isolada no topo de uma colina ou monte"],
]);

export const PB = p("PB", "Prob. de danos físicos por descarga na estrutura (SPDA)", "Tabela B.2", [
  ["sem-spda", 1, "Estrutura não protegida por SPDA"],
  ["IV", 0.2, "SPDA Nível IV"],
  ["III", 0.1, "SPDA Nível III"],
  ["II", 0.05, "SPDA Nível II"],
  ["I", 0.02, "SPDA Nível I"],
  ["I-descida-natural", 0.01, "Captação conforme SPDA NP I e estrutura metálica contínua ou de concreto armado como descida natural"],
  ["cobertura-metalica", 0.001, "Cobertura metálica como captação natural, instalações da cobertura protegidas e estrutura metálica/concreto armado como descida natural"],
]);

export const PEB = p("PEB", "Prob. de danos por ligação equipotencial (DPS classe I)", "Tabela B.7", [
  ["sem", 1, "Sem DPS classe I"],
  ["III-IV", 0.05, "NP III-IV"],
  ["II", 0.02, "NP II"],
  ["I", 0.01, "NP I"],
  ["melhor-I", 0.005, "Iimp maior que o requerido para NP I (0,005)"],
  ["melhor-I-0001", 0.001, "Iimp muito maior que o requerido para NP I (0,001)"],
]);

export const RS_ESTRUTURA = p("rS", "Fator tipo de estrutura", "Tabela C.7", [
  ["simples", 2, "Simples: madeira ou alvenaria simples"],
  ["robusta", 1, "Robusta: estrutura metálica ou concreto armado"],
]);

// ----------------------------------------------------------------- linhas

export const CE = p("CE", "Fator ambiental da linha", "Tabela A.4", [
  ["rural", 1, "Rural"],
  ["suburbano", 0.5, "Suburbano"],
  ["urbano", 0.1, "Urbano"],
  ["urbano-20m", 0.01, "Urbano com estruturas acima de 20 m de altura"],
]);

export const CT = p("CT", "Fator tipo de linha", "Tabela A.3", [
  ["bt-sinal", 1, "Linha elétrica de energia em BT ou linha de sinal"],
  ["at-trafo", 0.2, "Linha elétrica de energia em AT (com transformador AT/BT com enrolamentos eletricamente separados)"],
]);

export const CI = p("CI", "Fator de instalação da linha", "Tabela A.2", [
  ["aereo", 1, "Aéreo"],
  ["enterrado", 0.5, "Enterrado"],
  ["enterrado-malha", 0.01, "Enterrado no interior dos limites de um eletrodo de aterramento em malha"],
]);

/** Blindagem do cabo (linhas da Tabela B.8). */
export const BLINDAGEM = p("RS", "Blindagem do cabo da linha", "Tabela B.8", [
  ["nao-blindada", 0, "Não blindada, ou blindagem não interligada à referência de equipotencialização do equipamento"],
  ["5-20", 20, "Blindada e interligada: 5 Ω/km < RS ≤ 20 Ω/km"],
  ["1-5", 5, "Blindada e interligada: 1 Ω/km < RS ≤ 5 Ω/km"],
  ["ate-1", 1, "Blindada e interligada: RS ≤ 1 Ω/km"],
]);

/** Tabela B.4 — pares CLD/CLI. */
export interface OpcaoCl {
  id: string;
  CLD: number;
  CLI: number;
  rotulo: string;
}
export const CLD_CLI: OpcaoCl[] = [
  { id: "aerea-nao-blindada", CLD: 1, CLI: 1, rotulo: "Linha elétrica aérea não blindada / Nenhuma ou indefinida" },
  { id: "subterranea-nao-blindada", CLD: 1, CLI: 1, rotulo: "Linha elétrica subterrânea não blindada / Nenhuma ou indefinida" },
  { id: "neutro-multiaterrado", CLD: 1, CLI: 0.2, rotulo: "Linha de energia com neutro multiaterrado / Nenhuma" },
  { id: "subterranea-blindada-nao-interligada", CLD: 1, CLI: 0.3, rotulo: "Subterrânea blindada / Blindagem não interligada ao BEP do equipamento" },
  { id: "aerea-blindada-nao-interligada", CLD: 1, CLI: 0.1, rotulo: "Aérea blindada / Blindagem não interligada ao BEP do equipamento" },
  { id: "blindada-interligada", CLD: 1, CLI: 0, rotulo: "Aérea ou subterrânea blindada / Blindagem interligada ao BEP do equipamento" },
  { id: "duto-metalico", CLD: 0, CLI: 0, rotulo: "Cabo de proteção, duto ou eletroduto metálico interligado ao BEP do equipamento" },
  { id: "sem-linha-externa", CLD: 0, CLI: 0, rotulo: "Nenhuma linha externa (sistemas independentes)" },
  { id: "interface-isolante", CLD: 0, CLI: 0, rotulo: "Interfaces isolantes conforme a ABNT NBR 5419-4" },
];

/** Tensões suportáveis de impulso da Tabela B.8, em kV. */
export const UW_VALORES = [0.35, 0.5, 1, 1.5, 2.5, 4, 6] as const;

/** Tabela B.8 — PLD por blindagem × UW (mesma ordem de UW_VALORES). */
const TABELA_PLD: Record<string, number[]> = {
  "nao-blindada": [1, 1, 1, 1, 1, 1, 1],
  "5-20": [1, 1, 1, 1, 0.95, 0.9, 0.8],
  "1-5": [1, 1, 0.9, 0.8, 0.6, 0.3, 0.1],
  "ate-1": [1, 0.85, 0.6, 0.4, 0.2, 0.04, 0.02],
};

/** Tabela B.9 — PLI por tipo de linha × UW (1; 1,5; 2,5; 4; 6 kV). */
const UW_PLI = [1, 1.5, 2.5, 4, 6];
const TABELA_PLI: Record<"energia" | "sinal", number[]> = {
  energia: [1, 0.6, 0.3, 0.16, 0.1],
  sinal: [1, 0.5, 0.2, 0.08, 0.04],
};

/** Índice do UW na tabela; um valor fora da lista cai no degrau imediatamente abaixo (a favor da segurança). */
function indiceUw(uw: number, lista: readonly number[]): number {
  let idx = -1;
  for (let i = 0; i < lista.length; i++) if (uw + 1e-9 >= lista[i]) idx = i;
  return idx;
}

export function pld(blindagem: string, uw: number): number {
  const linha = TABELA_PLD[blindagem] ?? TABELA_PLD["nao-blindada"];
  const i = indiceUw(uw, UW_VALORES);
  return i < 0 ? 1 : linha[i];
}

/** UW abaixo de 1 kV não consta da Tabela B.9: adota-se PLI = 1. */
export function pli(tipo: "energia" | "sinal", uw: number): number {
  const i = indiceUw(uw, UW_PLI);
  return i < 0 ? 1 : TABELA_PLI[tipo][i];
}

// ------------------------------------------------------------------ zonas

export const RT_PISO = p("rt", "Fator tipo de piso", "Tabela C.3", [
  ["terra-concreto", 0.01, "Terra, concreto (resistência de contato ≤ 1 kΩ)"],
  ["marmore-ceramica", 0.001, "Mármore, cerâmica (resistência de contato 1–10 kΩ)"],
  ["brita-carpete", 0.0001, "Brita, tapete, carpete (resistência de contato 10–100 kΩ)"],
  ["asfalto-madeira", 0.00001, "Asfalto, linóleo, madeira (resistência de contato ≥ 100 kΩ)"],
]);

export const PTA = p("PTA", "Prob. de proteção contra toque/passo", "Tabela B.1", [
  ["nenhuma", 1, "Nenhuma medida de proteção"],
  ["avisos", 0.1, "Avisos de alerta"],
  ["isolacao", 0.01, "Isolação elétrica das partes expostas dos condutores de descida (toque)"],
  ["malha-solo", 0.01, "Malha de equipotencialização do solo (passo)"],
  ["descida-natural", 0.001, "Estrutura metálica contínua ou de concreto armado atuando como subsistema de descida natural"],
  ["restricoes", 0, "Restrições físicas fixas"],
]);

export const PTU = p("PTU", "Prob. de proteção contra tensões de toque (linhas)", "Tabela B.6", [
  ["nenhuma", 1, "Nenhuma medida de proteção"],
  ["avisos", 0.1, "Avisos visíveis de alerta"],
  ["isolacao", 0.01, "Isolação elétrica"],
  ["restricoes", 0, "Restrições físicas"],
]);

export const RF = p("rf", "Fator risco de incêndio ou explosão", "Tabela C.5", [
  ["explosao-z0", 1, "Explosão — Zonas 0, 20 e explosivos sólidos"],
  ["explosao-z1", 0.1, "Explosão — Zonas 1, 21"],
  ["explosao-z2", 0.001, "Explosão — Zonas 2, 22"],
  ["incendio-alto", 0.1, "Incêndio — Alto"],
  ["incendio-normal", 0.01, "Incêndio — Normal"],
  ["incendio-baixo", 0.001, "Incêndio — Baixo"],
  ["nenhum", 0, "Nenhum risco de explosão ou incêndio"],
]);

export const RP = p("rp", "Fator proteção contra incêndio", "Tabela C.4", [
  ["nenhuma", 1, "Nenhuma providência ou estrutura com risco de explosão"],
  ["manual", 0.5, "Extintores, instalações fixas manuais, alarme manual, hidrantes, compartimentos à prova de fogo ou rotas de escape"],
  ["automatica", 0.2, "Instalações fixas automáticas ou alarme automático"],
]);

export const HZ = p("hz", "Fator perigo especial", "Tabela C.6", [
  ["sem", 1, "Sem perigo especial"],
  ["panico-baixo", 2, "Baixo nível de pânico (estrutura limitada a 2 andares, até 100 pessoas)"],
  ["panico-medio", 5, "Nível médio de pânico (eventos com 100 a 1 000 pessoas)"],
  ["evacuacao", 5, "Dificuldade de evacuação (pessoas imobilizadas, hospitais)"],
  ["panico-alto", 10, "Alto nível de pânico (eventos com mais de 1 000 pessoas)"],
]);

export const KS3 = p("KS3", "Fator de fiação interna", "Tabela B.5", [
  ["sem-preocupacao", 1, "Cabo não blindado — sem preocupação no roteamento para evitar laços (área do laço ~50 m²)"],
  ["grandes-lacos", 0.5, "Cabo não blindado — roteamento para evitar grandes laços (~25 m²)"],
  ["lacos-medios", 0.2, "Cabo não blindado — roteamento para evitar laços médios (~10 m²)"],
  ["pequenos-lacos", 0.01, "Cabo não blindado — roteamento para evitar pequenos laços (~0,5 m²)"],
  ["blindado", 0.0001, "Cabos blindados ou em condutos metálicos interligados nas duas extremidades"],
]);

export const PSPD = p("PSPD", "Prob. de o sistema coordenado de DPS limitar a sobretensão", "Tabela B.3", [
  ["sem", 1, "Nenhum sistema coordenado de DPS"],
  ["III-IV", 0.05, "DPS Nível III-IV"],
  ["II", 0.02, "DPS Nível II"],
  ["I", 0.01, "DPS Nível I"],
  ["melhor-I", 0.005, "DPS melhor que o Nível I (0,005)"],
  ["melhor-I-0001", 0.001, "DPS melhor que o Nível I (0,001)"],
]);

export const FT = p("FT", "Frequência tolerável de danos", "7.3.4", [
  ["nao-critico", 1, "Sistema não crítico (FT = 1/ano)"],
  ["critico", 0.1, "Sistema crítico (FT = 0,1/ano)"],
]);

// ------------------------------------------------------------------ perdas

export const LT_L1 = p("LT", "Perdas por choque (toque e passo)", "Tabela C.2", [
  ["todos", 0.01, "Todos os tipos (10⁻²)"],
]);

export const LF_L1 = p("LF", "Perdas por danos físicos", "Tabela C.2", [
  ["explosao", 0.1, "Risco de explosão (10⁻¹)"],
  ["hospital-hotel-escola", 0.1, "Hospital, hotel, escola, edifício cívico (10⁻¹)"],
  ["entretenimento", 0.05, "Entretenimento público, igreja, museu (5×10⁻²)"],
  ["industrial-comercial", 0.02, "Industrial, comercial (2×10⁻²)"],
  ["outros", 0.01, "Outros (10⁻²)"],
]);

export const LO_L1 = p("LO", "Perdas por falha de sistemas internos", "Tabela C.2", [
  ["nao-aplicavel", 0, "Não se aplica (a falha dos sistemas não põe vidas em risco)"],
  ["explosao", 0.1, "Risco de explosão (10⁻¹)"],
  ["uti", 0.01, "UTI e bloco cirúrgico de hospital (10⁻²)"],
  ["hospital", 0.001, "Outras partes de hospital (10⁻³)"],
]);

export const LF_L3 = p("LF", "Perdas por danos físicos (patrimônio cultural)", "Tabela C.9", [
  ["museus", 0.1, "Museus, galerias (10⁻¹)"],
]);

export const LT_L4 = p("LT", "Perdas por choque em animais", "Tabela D.2", [
  ["sem-animais", 0, "Sem animais de valor comercial"],
  ["animais", 0.01, "Estruturas com animais (10⁻²)"],
]);

export const LF_L4 = p("LF", "Perdas por danos físicos (valor econômico)", "Tabela D.2", [
  ["explosao", 1, "Risco de explosão (1)"],
  ["hospital-industrial", 0.5, "Hospital, industrial, museu, agricultura (0,5)"],
  ["hotel-escola-comercial", 0.2, "Hotel, escola, escritório, igreja, entretenimento público, comercial (0,2)"],
  ["outros", 0.1, "Outros (10⁻¹)"],
]);

export const LO_L4 = p("LO", "Perdas por falha de sistemas internos (valor econômico)", "Tabela D.2", [
  ["explosao", 0.1, "Risco de explosão (10⁻¹)"],
  ["hospital-industrial", 0.01, "Hospital, industrial, escritório, hotel, comercial (10⁻²)"],
  ["museu-escola", 0.001, "Museu, agricultura, escola, igreja, entretenimento público (10⁻³)"],
  ["outros", 0.0001, "Outros (10⁻⁴)"],
]);

// --------------------------------------------------------- riscos toleráveis

export const RT_TOLERAVEL = { R1: 1e-5, R3: 1e-4, R4: 1e-3 } as const;

/**
 * Valor da opção. Um id desconhecido (projeto salvo antes de uma opção mudar)
 * cai na primeira da lista — a entrada nova já nasce com ids válidos, então
 * isso só protege contra dado antigo, não escolhe valor por ninguém.
 */
export function valor(param: Parametro, id: string | undefined | null): number {
  return (param.opcoes.find((o) => o.id === id) ?? param.opcoes[0]).valor;
}

export function rotulo(param: Parametro, id: string | undefined | null): string {
  return (param.opcoes.find((o) => o.id === id) ?? param.opcoes[0]).rotulo;
}

export function opcaoCl(id: string | undefined | null): OpcaoCl {
  return CLD_CLI.find((o) => o.id === id) ?? CLD_CLI[0];
}
