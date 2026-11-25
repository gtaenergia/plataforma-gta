/**
 * Tabelas da ABNT NBR 5410:2004 usadas no dimensionamento do quadro de cargas,
 * mais os dados de catálogo que a norma não traz (resistência e reatância dos
 * cabos, energia passante dos disjuntores).
 *
 * Os valores de capacidade de condução foram conferidos linha a linha com as
 * Tabelas 36 a 39 da norma (extraídas do PDF em modo tabela).
 */

export type Material = "Cu" | "Al";
export type Isolacao = "PVC" | "EPR" | "XLPE";
export type MetodoRef = "A1" | "A2" | "B1" | "B2" | "C" | "D" | "E" | "F" | "G";
export type ConfigCabos = "multipolar" | "unipolar-justaposto" | "unipolar-trifolio" | "unipolar-espacado-h" | "unipolar-espacado-v";

export const SECOES_CU = [0.5, 0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000];
export const SECOES_AL = [16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000];

export function secoesDe(material: Material): number[] {
  return material === "Al" ? SECOES_AL : SECOES_CU;
}

// Colunas: A1(2,3) A2(2,3) B1(2,3) B2(2,3) C(2,3) D(2,3)
type Linha12 = [number, number, number, number, number, number, number, number, number, number, number, number];

/** Tabela 36 — PVC, 70 °C. */
const T36_CU: Linha12[] = [
  [7, 7, 7, 7, 9, 8, 9, 8, 10, 9, 12, 10],
  [9, 9, 9, 9, 11, 10, 11, 10, 13, 11, 15, 12],
  [11, 10, 11, 10, 14, 12, 13, 12, 15, 14, 18, 15],
  [14.5, 13.5, 14, 13, 17.5, 15.5, 16.5, 15, 19.5, 17.5, 22, 18],
  [19.5, 18, 18.5, 17.5, 24, 21, 23, 20, 27, 24, 29, 24],
  [26, 24, 25, 23, 32, 28, 30, 27, 36, 32, 38, 31],
  [34, 31, 32, 29, 41, 36, 38, 34, 46, 41, 47, 39],
  [46, 42, 43, 39, 57, 50, 52, 46, 63, 57, 63, 52],
  [61, 56, 57, 52, 76, 68, 69, 62, 85, 76, 81, 67],
  [80, 73, 75, 68, 101, 89, 90, 80, 112, 96, 104, 86],
  [99, 89, 92, 83, 125, 110, 111, 99, 138, 119, 125, 103],
  [119, 108, 110, 99, 151, 134, 133, 118, 168, 144, 148, 122],
  [151, 136, 139, 125, 192, 171, 168, 149, 213, 184, 183, 151],
  [182, 164, 167, 150, 232, 207, 201, 179, 258, 223, 216, 179],
  [210, 188, 192, 172, 269, 239, 232, 206, 299, 259, 246, 203],
  [240, 216, 219, 196, 309, 275, 265, 236, 344, 299, 278, 230],
  [273, 245, 248, 223, 353, 314, 300, 268, 392, 341, 312, 258],
  [321, 286, 291, 261, 415, 370, 351, 313, 461, 403, 361, 297],
  [367, 328, 334, 298, 477, 426, 401, 358, 530, 464, 408, 336],
  [438, 390, 398, 355, 571, 510, 477, 425, 634, 557, 478, 394],
  [502, 447, 456, 406, 656, 587, 545, 486, 729, 642, 540, 445],
  [578, 514, 526, 467, 758, 678, 626, 559, 843, 743, 614, 506],
  [669, 593, 609, 540, 881, 788, 723, 645, 978, 865, 700, 577],
  [767, 679, 698, 618, 1012, 906, 827, 738, 1125, 996, 792, 652],
];
const T36_AL: Linha12[] = [
  [48, 43, 44, 41, 60, 53, 54, 48, 66, 59, 62, 52],
  [63, 57, 58, 53, 79, 70, 71, 62, 83, 73, 80, 66],
  [77, 70, 71, 65, 97, 86, 86, 77, 103, 90, 96, 80],
  [93, 84, 86, 78, 118, 104, 104, 92, 125, 110, 113, 94],
  [118, 107, 108, 98, 150, 133, 131, 116, 160, 140, 140, 117],
  [142, 129, 130, 118, 181, 161, 157, 139, 195, 170, 166, 138],
  [164, 149, 150, 135, 210, 186, 181, 160, 226, 197, 189, 157],
  [189, 170, 172, 155, 241, 214, 206, 183, 261, 227, 213, 178],
  [215, 194, 195, 176, 275, 245, 234, 208, 298, 259, 240, 200],
  [252, 227, 229, 207, 324, 288, 274, 243, 352, 305, 277, 230],
  [289, 261, 263, 237, 372, 331, 313, 278, 406, 351, 313, 260],
  [345, 311, 314, 283, 446, 397, 372, 331, 488, 422, 366, 305],
  [396, 356, 360, 324, 512, 456, 425, 378, 563, 486, 414, 345],
  [456, 410, 416, 373, 592, 527, 488, 435, 653, 562, 471, 391],
  [529, 475, 482, 432, 687, 612, 563, 502, 761, 654, 537, 446],
  [607, 544, 552, 495, 790, 704, 643, 574, 878, 753, 607, 505],
];

/** Tabela 37 — EPR/XLPE, 90 °C. */
const T37_CU: Linha12[] = [
  [10, 9, 10, 9, 12, 10, 11, 10, 12, 11, 14, 12],
  [12, 11, 12, 11, 15, 13, 15, 13, 16, 14, 18, 15],
  [15, 13, 14, 13, 18, 16, 17, 15, 19, 17, 21, 17],
  [19, 17, 18.5, 16.5, 23, 20, 22, 19.5, 24, 22, 26, 22],
  [26, 23, 25, 22, 31, 28, 30, 26, 33, 30, 34, 29],
  [35, 31, 33, 30, 42, 37, 40, 35, 45, 40, 44, 37],
  [45, 40, 42, 38, 54, 48, 51, 44, 58, 52, 56, 46],
  [61, 54, 57, 51, 75, 66, 69, 60, 80, 71, 73, 61],
  [81, 73, 76, 68, 100, 88, 91, 80, 107, 96, 95, 79],
  [106, 95, 99, 89, 133, 117, 119, 105, 138, 119, 121, 101],
  [131, 117, 121, 109, 164, 144, 146, 128, 171, 147, 146, 122],
  [158, 141, 145, 130, 198, 175, 175, 154, 209, 179, 173, 144],
  [200, 179, 183, 164, 253, 222, 221, 194, 269, 229, 213, 178],
  [241, 216, 220, 197, 306, 269, 265, 233, 328, 278, 252, 211],
  [278, 249, 253, 227, 354, 312, 305, 268, 382, 322, 287, 240],
  [318, 285, 290, 259, 407, 358, 349, 307, 441, 371, 324, 271],
  [362, 324, 329, 295, 464, 408, 395, 348, 506, 424, 363, 304],
  [424, 380, 386, 346, 546, 481, 462, 407, 599, 500, 419, 351],
  [486, 435, 442, 396, 628, 553, 529, 465, 693, 576, 474, 396],
  [579, 519, 527, 472, 751, 661, 628, 552, 835, 692, 555, 464],
  [664, 595, 604, 541, 864, 760, 718, 631, 966, 797, 627, 525],
  [765, 685, 696, 623, 998, 879, 825, 725, 1122, 923, 711, 596],
  [885, 792, 805, 721, 1158, 1020, 952, 837, 1311, 1074, 811, 679],
  [1014, 908, 923, 826, 1332, 1173, 1088, 957, 1515, 1237, 916, 767],
];
const T37_AL: Linha12[] = [
  [64, 58, 60, 55, 79, 71, 72, 64, 84, 76, 73, 61],
  [84, 76, 78, 71, 105, 93, 94, 84, 101, 90, 93, 78],
  [103, 94, 96, 87, 130, 116, 115, 103, 126, 112, 112, 94],
  [125, 113, 115, 104, 157, 140, 138, 124, 154, 136, 132, 112],
  [158, 142, 145, 131, 200, 179, 175, 156, 198, 174, 163, 138],
  [191, 171, 175, 157, 242, 217, 210, 188, 241, 211, 193, 164],
  [220, 197, 201, 180, 281, 251, 242, 216, 280, 245, 220, 186],
  [253, 226, 230, 206, 323, 289, 277, 248, 324, 283, 249, 210],
  [288, 256, 262, 233, 368, 330, 314, 281, 371, 323, 279, 236],
  [338, 300, 307, 273, 433, 389, 368, 329, 439, 382, 322, 272],
  [387, 344, 352, 313, 499, 447, 421, 377, 508, 440, 364, 308],
  [462, 409, 421, 372, 597, 536, 500, 448, 612, 529, 426, 361],
  [530, 468, 483, 426, 687, 617, 573, 513, 707, 610, 482, 408],
  [611, 538, 556, 490, 794, 714, 658, 590, 821, 707, 547, 464],
  [708, 622, 644, 566, 922, 830, 760, 682, 958, 824, 624, 529],
  [812, 712, 739, 648, 1061, 955, 870, 780, 1108, 950, 706, 598],
];

// Colunas: E2 E3 F2 F3-trifólio F3-justaposto Gh Gv
type Linha7 = [number, number, number, number, number, number, number];

/** Tabela 38 — PVC, métodos E, F, G. */
const T38_CU: Linha7[] = [
  [11, 9, 11, 8, 9, 12, 10],
  [14, 12, 14, 11, 11, 16, 13],
  [17, 14, 17, 13, 14, 19, 16],
  [22, 18.5, 22, 17, 18, 24, 21],
  [30, 25, 31, 24, 25, 34, 29],
  [40, 34, 41, 33, 34, 45, 39],
  [51, 43, 53, 43, 45, 59, 51],
  [70, 60, 73, 60, 63, 81, 71],
  [94, 80, 99, 82, 85, 110, 97],
  [119, 101, 131, 110, 114, 146, 130],
  [148, 126, 162, 137, 143, 181, 162],
  [180, 153, 196, 167, 174, 219, 197],
  [232, 196, 251, 216, 225, 281, 254],
  [282, 238, 304, 264, 275, 341, 311],
  [328, 276, 352, 308, 321, 396, 362],
  [379, 319, 406, 356, 372, 456, 419],
  [434, 364, 463, 409, 427, 521, 480],
  [514, 430, 546, 485, 507, 615, 569],
  [593, 497, 629, 561, 587, 709, 659],
  [715, 597, 754, 656, 689, 852, 795],
  [826, 689, 868, 749, 789, 982, 920],
  [958, 798, 1005, 855, 905, 1138, 1070],
  [1118, 930, 1169, 971, 1119, 1325, 1251],
  [1292, 1073, 1346, 1079, 1296, 1528, 1448],
];
const T38_AL: Linha7[] = [
  [73, 61, 73, 62, 65, 84, 73],
  [89, 78, 98, 84, 87, 112, 99],
  [111, 96, 122, 105, 109, 139, 124],
  [135, 117, 149, 128, 133, 169, 152],
  [173, 150, 192, 166, 173, 217, 196],
  [210, 183, 235, 203, 212, 265, 241],
  [244, 212, 273, 237, 247, 308, 282],
  [282, 245, 316, 274, 287, 356, 327],
  [322, 280, 363, 315, 330, 407, 376],
  [380, 330, 430, 375, 392, 482, 447],
  [439, 381, 497, 434, 455, 557, 519],
  [528, 458, 600, 526, 552, 671, 629],
  [608, 528, 694, 610, 640, 775, 730],
  [705, 613, 808, 711, 640, 775, 730], // linha 630 mm² repete a de 500 nas colunas F/G — assim está impresso na norma
  [822, 714, 944, 832, 875, 1050, 1000],
  [948, 823, 1092, 965, 1015, 1213, 1161],
];

/** Tabela 39 — EPR/XLPE, métodos E, F, G. */
const T39_CU: Linha7[] = [
  [13, 12, 13, 10, 10, 15, 12],
  [17, 15, 17, 13, 14, 19, 16],
  [21, 18, 21, 16, 17, 23, 19],
  [26, 23, 27, 21, 22, 30, 25],
  [36, 32, 37, 29, 30, 41, 35],
  [49, 42, 50, 40, 42, 56, 48],
  [63, 54, 65, 53, 55, 73, 63],
  [86, 75, 90, 74, 77, 101, 88],
  [115, 100, 121, 101, 105, 137, 120],
  [149, 127, 161, 135, 141, 182, 161],
  [185, 158, 200, 169, 176, 226, 201],
  [225, 192, 242, 207, 216, 275, 246],
  [289, 246, 310, 268, 279, 353, 318],
  [352, 298, 377, 328, 342, 430, 389],
  [410, 346, 437, 383, 400, 500, 454],
  [473, 399, 504, 444, 464, 577, 527],
  [542, 456, 575, 510, 533, 661, 605],
  [641, 538, 679, 607, 634, 781, 719],
  [741, 621, 783, 703, 736, 902, 833],
  [892, 745, 940, 823, 868, 1085, 1008],
  [1030, 859, 1083, 946, 998, 1253, 1169],
  [1196, 995, 1254, 1088, 1151, 1454, 1362],
  [1396, 1159, 1460, 1252, 1328, 1696, 1595],
  [1613, 1336, 1683, 1420, 1511, 1958, 1849],
];
const T39_AL: Linha7[] = [
  [91, 77, 90, 76, 79, 103, 90],
  [108, 97, 121, 103, 107, 138, 122],
  [135, 120, 150, 129, 135, 172, 153],
  [164, 146, 184, 159, 165, 210, 188],
  [211, 187, 237, 206, 215, 271, 244],
  [257, 227, 289, 253, 264, 332, 300],
  [300, 263, 337, 296, 308, 387, 351],
  [346, 304, 389, 343, 358, 448, 408],
  [397, 347, 447, 395, 413, 515, 470],
  [470, 409, 530, 471, 492, 611, 561],
  [543, 471, 613, 547, 571, 708, 652],
  [654, 566, 740, 663, 694, 856, 792],
  [756, 652, 856, 770, 806, 991, 921],
  [879, 755, 996, 899, 942, 1154, 1077],
  [1026, 879, 1164, 1056, 1106, 1351, 1266],
  [1186, 1012, 1347, 1226, 1285, 1565, 1472],
];

const COL_AD: Record<"A1" | "A2" | "B1" | "B2" | "C" | "D", number> = { A1: 0, A2: 2, B1: 4, B2: 6, C: 8, D: 10 };

/**
 * Capacidade de condução tabelada (A), Tabelas 36 a 39.
 * `carregados` é 2 ou 3 (quatro condutores carregados usa a coluna de 3 com o fator 0,86, aplicado fora).
 */
export function izTabelado(opts: {
  material: Material;
  isolacao: Isolacao;
  metodo: MetodoRef;
  config: ConfigCabos;
  carregados: 2 | 3;
  secao: number;
}): number | null {
  const { material, isolacao, metodo, config, carregados, secao } = opts;
  const secoes = secoesDe(material);
  const i = secoes.indexOf(secao);
  if (i < 0) return null;
  const pvc = isolacao === "PVC";
  if (metodo in COL_AD) {
    const t = pvc ? (material === "Cu" ? T36_CU : T36_AL) : material === "Cu" ? T37_CU : T37_AL;
    return t[i][COL_AD[metodo as keyof typeof COL_AD] + (carregados === 3 ? 1 : 0)];
  }
  const t = pvc ? (material === "Cu" ? T38_CU : T38_AL) : material === "Cu" ? T39_CU : T39_AL;
  const linha = t[i];
  if (metodo === "E") return linha[carregados === 3 ? 1 : 0];
  if (metodo === "F") {
    if (carregados === 2) return linha[2];
    return config === "unipolar-trifolio" ? linha[3] : linha[4];
  }
  // G — espaçados no mesmo plano
  return config === "unipolar-espacado-v" ? linha[6] : linha[5];
}

// ------------------------------------------------- Tabela 33 — maneiras de instalar

export type TabelaAgrupamento = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface MetodoInstalacao {
  numero: string;
  descricao: string;
  /** Método de referência. "EF" vira E (multipolar) ou F (unipolares) conforme a configuração. */
  ref: MetodoRef | "EF";
  /**
   * Tabela de agrupamento: linhas 1 a 5 da Tabela 42 (1 = feixe; 2 = camada
   * única em parede/bandeja não perfurada; 3 = teto; 4 = bandeja perfurada;
   * 5 = leito/suporte); 0 = Tabela 45 (eletrodutos enterrados); 6 = Tabela 44
   * (diretamente enterrados); 7 = sem redução (condutores espaçados, nota 2
   * da Tabela 42).
   */
  agrupamento: TabelaAgrupamento;
}

export const METODOS_INSTALACAO: MetodoInstalacao[] = [
  { numero: "1", descricao: "Condutores isolados ou cabos unipolares em eletroduto circular embutido em parede termicamente isolante", ref: "A1", agrupamento: 1 },
  { numero: "2", descricao: "Cabo multipolar em eletroduto circular embutido em parede termicamente isolante", ref: "A2", agrupamento: 1 },
  { numero: "3", descricao: "Condutores isolados ou cabos unipolares em eletroduto aparente sobre parede", ref: "B1", agrupamento: 1 },
  { numero: "4", descricao: "Cabo multipolar em eletroduto aparente sobre parede", ref: "B2", agrupamento: 1 },
  { numero: "7", descricao: "Condutores isolados ou cabos unipolares em eletroduto circular embutido em alvenaria", ref: "B1", agrupamento: 1 },
  { numero: "8", descricao: "Cabo multipolar em eletroduto circular embutido em alvenaria", ref: "B2", agrupamento: 1 },
  { numero: "11", descricao: "Cabos unipolares ou cabo multipolar sobre parede", ref: "C", agrupamento: 2 },
  { numero: "11A", descricao: "Cabos unipolares ou cabo multipolar fixado diretamente no teto", ref: "C", agrupamento: 3 },
  { numero: "12", descricao: "Cabos unipolares ou cabo multipolar em bandeja não perfurada, perfilado ou prateleira", ref: "C", agrupamento: 2 },
  { numero: "13", descricao: "Cabos unipolares ou cabo multipolar em bandeja perfurada", ref: "EF", agrupamento: 4 },
  { numero: "14", descricao: "Cabos sobre suportes horizontais, eletrocalha aramada ou tela", ref: "EF", agrupamento: 5 },
  { numero: "16", descricao: "Cabos unipolares ou cabo multipolar em leito", ref: "EF", agrupamento: 5 },
  { numero: "18", descricao: "Condutores nus ou isolados sobre isoladores", ref: "G", agrupamento: 7 },
  { numero: "31", descricao: "Condutores isolados ou cabos unipolares em eletrocalha sobre parede", ref: "B1", agrupamento: 1 },
  { numero: "31A", descricao: "Cabo multipolar em eletrocalha sobre parede", ref: "B2", agrupamento: 1 },
  { numero: "35", descricao: "Condutores isolados ou cabos unipolares em eletrocalha ou perfilado suspenso", ref: "B1", agrupamento: 1 },
  { numero: "36", descricao: "Cabo multipolar em eletrocalha ou perfilado suspenso", ref: "B2", agrupamento: 1 },
  { numero: "61", descricao: "Cabo multipolar em eletroduto ou canaleta não ventilada enterrado(a)", ref: "D", agrupamento: 0 },
  { numero: "61A", descricao: "Cabos unipolares em eletroduto ou canaleta não ventilada enterrado(a)", ref: "D", agrupamento: 0 },
  { numero: "63", descricao: "Cabos diretamente enterrados com proteção mecânica adicional", ref: "D", agrupamento: 6 },
];

export function metodoInstalacao(numero: string): MetodoInstalacao {
  return METODOS_INSTALACAO.find((m) => m.numero === numero) ?? METODOS_INSTALACAO[4];
}

export function metodoReferencia(numero: string, config: ConfigCabos): MetodoRef {
  const m = metodoInstalacao(numero);
  if (m.ref !== "EF") return m.ref;
  return config === "multipolar" ? "E" : "F";
}

// ------------------------------------------------- Tabela 40 — temperatura

const T40_AR: [number, number, number][] = [
  [10, 1.22, 1.15], [15, 1.17, 1.12], [20, 1.12, 1.08], [25, 1.06, 1.04], [30, 1, 1],
  [35, 0.94, 0.96], [40, 0.87, 0.91], [45, 0.79, 0.87], [50, 0.71, 0.82], [55, 0.61, 0.76],
  [60, 0.5, 0.71], [65, 0, 0.65], [70, 0, 0.58], [75, 0, 0.5], [80, 0, 0.41],
];
const T40_SOLO: [number, number, number][] = [
  [10, 1.1, 1.07], [15, 1.05, 1.04], [20, 1, 1], [25, 0.95, 0.96], [30, 0.89, 0.93],
  [35, 0.84, 0.89], [40, 0.77, 0.85], [45, 0.71, 0.8], [50, 0.63, 0.76], [55, 0.55, 0.71],
  [60, 0.45, 0.65], [65, 0, 0.6], [70, 0, 0.53], [75, 0, 0.46], [80, 0, 0.38],
];

/** Fator k1 da Tabela 40. Temperaturas entre degraus usam o degrau imediatamente superior (a favor da segurança). */
export function fatorTemperatura(temperatura: number, isolacao: Isolacao, enterrado: boolean): number {
  const t = enterrado ? T40_SOLO : T40_AR;
  const col = isolacao === "PVC" ? 1 : 2;
  const linha = t.find((l) => l[0] >= temperatura - 1e-9) ?? t[t.length - 1];
  return linha[col];
}

// ------------------------------------------------- Tabelas 42 e 45 — agrupamento

const T42: Record<1 | 2 | 3 | 4 | 5, number[]> = {
  1: [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5, 0.45, 0.41, 0.38],
  2: [1, 0.85, 0.79, 0.75, 0.73, 0.72, 0.72, 0.71, 0.7],
  3: [0.95, 0.81, 0.72, 0.68, 0.66, 0.64, 0.63, 0.62, 0.61],
  4: [1, 0.88, 0.82, 0.77, 0.75, 0.73, 0.73, 0.72, 0.72],
  5: [1, 0.87, 0.82, 0.8, 0.8, 0.79, 0.79, 0.78, 0.78],
};
/** Tabela 45 — cabos multipolares em eletrodutos enterrados, espaçamento nulo. */
const T45_NULO = [1, 0.85, 0.75, 0.7, 0.65, 0.6];
/** Tabela 44 — cabos diretamente enterrados, distância nula entre cabos. */
const T44_NULA = [1, 0.75, 0.65, 0.6, 0.55, 0.5];

/** Fator k2 para `n` circuitos agrupados (Tabela 42; 44 e 45 para linhas enterradas). */
export function fatorAgrupamento(n: number, linhaTabela: TabelaAgrupamento): number {
  const k = Math.max(1, Math.round(n));
  if (linhaTabela === 7) return 1;
  if (linhaTabela === 0) return T45_NULO[Math.min(k, T45_NULO.length) - 1];
  if (linhaTabela === 6) return T44_NULA[Math.min(k, T44_NULA.length) - 1];
  const t = T42[linhaTabela];
  if (linhaTabela === 1) {
    if (k <= 8) return t[k - 1];
    if (k <= 11) return t[8];
    if (k <= 15) return t[9];
    if (k <= 19) return t[10];
    return t[11];
  }
  // Linhas 2 a 5: a partir de 9 circuitos o fator não cai mais.
  return t[Math.min(k, 9) - 1];
}

// ------------------------------------------------- Tabelas 47, 48 e 58

export function secaoMinima(uso: "iluminacao" | "forca", material: Material): number {
  if (material === "Al") return 16;
  return uso === "iluminacao" ? 1.5 : 2.5;
}

const T48: [number, number][] = [
  [35, 25], [50, 25], [70, 35], [95, 50], [120, 70], [150, 70], [185, 95], [240, 120], [300, 150], [400, 185],
];
/** Tabela 48 — seção reduzida do neutro (só para fase > 25 mm²). */
export function neutroReduzido(secaoFase: number): number {
  if (secaoFase <= 25) return secaoFase;
  const l = T48.find(([f]) => f === secaoFase);
  if (l) return l[1];
  // Acima de 400 mm² a Tabela 48 não dá valor: sem redução.
  return secaoFase;
}

/**
 * Tabela 58 — seção mínima do condutor de proteção. Resultado fora da série vai
 * para a seção padronizada mais próxima (6.4.3.1.3); no empate, a maior.
 */
export function secaoPE(secaoFase: number, material: Material): number {
  let s: number;
  if (secaoFase <= 16) s = secaoFase;
  else if (secaoFase <= 35) s = 16;
  else s = secaoFase / 2;
  const lista = secoesDe(material);
  let melhor = lista[lista.length - 1];
  for (const x of lista) {
    const d = Math.abs(x - s);
    const dm = Math.abs(melhor - s);
    if (d < dm - 1e-9 || (Math.abs(d - dm) <= 1e-9 && x > melhor)) melhor = x;
  }
  return melhor;
}

// ------------------------------------------------- Tabela 30 — fator k

export function fatorK(material: Material, isolacao: Isolacao, secao: number): number {
  if (isolacao === "PVC") {
    if (material === "Cu") return secao > 300 ? 103 : 115;
    return secao > 300 ? 68 : 76;
  }
  return material === "Cu" ? 143 : 94;
}

export function temperaturaServico(isolacao: Isolacao): number {
  return isolacao === "PVC" ? 70 : 90;
}

// ------------------------------------------------- Tabela 25 — seccionamento TN

export function tempoSeccionamento(U0: number, situacao: 1 | 2): number {
  if (U0 <= 127) return situacao === 1 ? 0.8 : 0.35;
  if (U0 <= 277) return situacao === 1 ? 0.4 : 0.2;
  return situacao === 1 ? 0.2 : 0.05;
}

/** Tabela C.2 — tensão de contato limite em c.a. */
export function tensaoContatoLimite(situacao: 1 | 2): number {
  return situacao === 1 ? 50 : 25;
}

// ------------------------------------------------- catálogo de cabos

/**
 * Resistência máxima em c.c. a 20 °C (Ω/km), ABNT NBR NM 280 (IEC 60228).
 * Classe 2 (encordoamento rígido) e classe 5 (flexível).
 */
const R20: Record<string, Record<number, number>> = {
  "Cu-2": {
    0.5: 36, 0.75: 24.5, 1: 18.1, 1.5: 12.1, 2.5: 7.41, 4: 4.61, 6: 3.08, 10: 1.83, 16: 1.15, 25: 0.727, 35: 0.524,
    50: 0.387, 70: 0.268, 95: 0.193, 120: 0.153, 150: 0.124, 185: 0.0991, 240: 0.0754, 300: 0.0601, 400: 0.047,
    500: 0.0366, 630: 0.0283, 800: 0.0221, 1000: 0.0176,
  },
  "Cu-5": {
    0.5: 39, 0.75: 26, 1: 19.5, 1.5: 13.3, 2.5: 7.98, 4: 4.95, 6: 3.3, 10: 1.91, 16: 1.21, 25: 0.78, 35: 0.554,
    50: 0.386, 70: 0.272, 95: 0.206, 120: 0.161, 150: 0.129, 185: 0.106, 240: 0.0801, 300: 0.0641, 400: 0.0486,
    500: 0.0384, 630: 0.0287, 800: 0.0224, 1000: 0.0177,
  },
  "Al-2": {
    16: 1.91, 25: 1.2, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.32, 120: 0.253, 150: 0.206, 185: 0.164, 240: 0.125,
    300: 0.1, 400: 0.0778, 500: 0.0605, 630: 0.0469, 800: 0.0367, 1000: 0.0291,
  },
};

export function resistencia20(material: Material, classe: 2 | 5, secao: number): number {
  const t = R20[material === "Al" ? "Al-2" : `Cu-${classe}`];
  if (t[secao] != null) return t[secao];
  // Seção fora da tabela: ρ/S com a resistividade do material.
  return (material === "Al" ? 28.26 : 17.24) / secao;
}

/** R na temperatura θ: R20 × [1 + α (θ − 20)]. */
export function resistenciaA(material: Material, classe: 2 | 5, secao: number, temperatura: number): number {
  const alfa = material === "Al" ? 0.00403 : 0.00393;
  return resistencia20(material, classe, secao) * (1 + alfa * (temperatura - 20));
}

/** Reatância indutiva típica de catálogo (Ω/km), pela disposição dos cabos. */
export function reatancia(config: ConfigCabos): number {
  switch (config) {
    case "multipolar":
    case "unipolar-trifolio":
      return 0.08;
    case "unipolar-justaposto":
      return 0.09;
    default:
      return 0.13;
  }
}

// ------------------------------------------------- dispositivos

export const CORRENTES_DISJUNTOR = [2, 4, 6, 10, 16, 20, 25, 32, 40, 50, 63, 70, 80, 90, 100, 125, 150, 160, 175, 200, 225, 250, 300, 350, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200];
export const CAPACIDADES_INTERRUPCAO = [3, 4.5, 5, 6, 10, 15, 20, 25, 35, 50, 65, 85, 100];
export const CORRENTES_DR = [25, 40, 63, 80, 100, 125];
export const SENSIBILIDADES_DR = [30, 100, 300, 500];

/** Múltiplo de In que garante o disparo magnético (limite superior da faixa da curva). */
export function multiploCurva(curva: "B" | "C" | "D"): number {
  return curva === "B" ? 5 : curva === "C" ? 10 : 20;
}

/**
 * Energia passante I²t (A²s) — limites da classe 3 de limitação de energia da
 * ABNT NBR NM 60898 (Anexo ZA), por Ik presumido. Valem para minidisjuntores
 * até 32 A; para correntes maiores (ou caixa moldada) a estimativa é a de um
 * disjuntor não limitador, Ik² × 0,01 s. Em ambos os casos o projetista pode
 * substituir pelo valor do catálogo do fabricante.
 */
const ZA_PONTOS = [3000, 4500, 6000, 10000];
const ZA: Record<"ate16" | "ate32", Record<"B" | "C", number[]>> = {
  ate16: { B: [15000, 25000, 35000, 70000], C: [18000, 30000, 42000, 84000] },
  ate32: { B: [18000, 32000, 45000, 90000], C: [22000, 39000, 55000, 110000] },
};

export function energiaPassante(In: number, curva: "B" | "C" | "D", ikA: number): { i2t: number; origem: string } {
  if (In <= 32) {
    const serie = ZA[In <= 16 ? "ate16" : "ate32"][curva === "B" ? "B" : "C"];
    let i2t: number;
    if (ikA <= ZA_PONTOS[0]) i2t = serie[0];
    else if (ikA >= ZA_PONTOS[3]) i2t = serie[3] * (ikA / ZA_PONTOS[3]) ** 2;
    else {
      let j = 0;
      while (ikA > ZA_PONTOS[j + 1]) j++;
      const f = (ikA - ZA_PONTOS[j]) / (ZA_PONTOS[j + 1] - ZA_PONTOS[j]);
      i2t = serie[j] + f * (serie[j + 1] - serie[j]);
    }
    return {
      i2t,
      origem:
        curva === "D"
          ? "Classe 3 de limitação, limites da curva C (NBR NM 60898, Anexo ZA, não tabela a curva D): confirmar no catálogo"
          : "Classe 3 de limitação (NBR NM 60898, Anexo ZA)",
    };
  }
  // Sem tabela normativa: um ciclo de 60 Hz, tempo típico de abertura de um
  // disjuntor não limitador. O I²t do catálogo, se informado, prevalece.
  return { i2t: (ikA * ikA) / 60, origem: "Estimativa: Ik² × 1 ciclo (16,7 ms em 60 Hz), disjuntor não limitador; usar o I²t do catálogo" };
}

// ------------------------------------------------- grupos de demanda

export const GRUPOS_DEMANDA: { id: string; nome: string }[] = [
  { id: "a", nome: "Iluminação e tomadas de uso geral" },
  { id: "b", nome: "Aparelhos de aquecimento (geral)" },
  { id: "b1", nome: "Chuveiros, torneiras e aquecedores de passagem" },
  { id: "b2", nome: "Aquecedores de acumulação (boiler)" },
  { id: "b3", nome: "Fornos, fogões e cooktops elétricos" },
  { id: "b4", nome: "Máquinas de lavar e secar" },
  { id: "b5", nome: "Outros aparelhos de aquecimento" },
  { id: "c", nome: "Condicionadores de ar" },
  { id: "d", nome: "Motores e bombas" },
  { id: "e", nome: "Máquinas de solda e aparelhos de raios X" },
  { id: "f", nome: "Elevadores e escadas rolantes" },
  { id: "g", nome: "Equipamentos especiais e de TI" },
  { id: "h", nome: "Outras cargas" },
];

export function nomeGrupo(id: string): string {
  return GRUPOS_DEMANDA.find((g) => g.id === id)?.nome ?? id;
}
