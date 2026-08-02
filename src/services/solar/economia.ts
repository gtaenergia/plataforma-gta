/**
 * Economia e payback — codifica a aba "Payback" da planilha da GTA.
 *
 * Para cada mês:
 *   Gasto SEM solar = consumo × tarifa + iluminação pública
 *   Energia injetada = geração × (1 − simultaneidade)   (o resto é consumo direto)
 *   Custo do Fio B  = energia injetada × %FioB × tarifaFioB
 *   Gasto COM solar = MAX(disponibilidade × tarifa, custo Fio B) + iluminação
 *   Economia mensal = Gasto SEM − Gasto COM
 *
 * Ao longo dos anos: a tarifa sobe (inflação), a geração cai (degradação do
 * módulo) e o %FioB avança pela rampa da Lei 14.300 — que é por ANO-CALENDÁRIO,
 * não por ano de projeto.
 *
 * Obs.: a planilha original tem uma célula pontual (dez/ano 2) sobrescrita à mão
 * com um valor inconsistente; aqui usamos a fórmula uniforme das demais 47 células.
 */

export interface EconomiaInput {
  consumo: number[]; // 12 meses (kWh)
  geracaoMensal: number[]; // 12 meses (kWh) — base, sem degradação
  disponibilidade: number; // kWh (30/50/100)
  tarifaEnergia: number; // R$/kWh (tarifa cheia da conta)
  fioB: number; // R$/kWh (DB_Tarifas)
  simultaneidade: number; // fração consumida direto (ex.: 0,7)
  /**
   * Ano-calendário em que o sistema entra em operação. Define onde a projeção
   * começa na rampa do Fio B — um sistema que entra em 2026 paga 60% no
   * primeiro ano, 75% no segundo, e assim por diante.
   */
  anoInicial: number;
  iluminacao: number; // R$/mês (custo fixo)
  investimento: number; // R$ (valor total do sistema)
  inflacaoTarifa?: number; // fração a.a. (default 0,10)
  degradacao?: number; // fração a.a. (default 0,005)
  anos?: number; // horizonte (default 25)
}

export interface EconomiaResultado {
  economiaAno1: number;
  economiaMensalMedia: number;
  gastoSemSolarAno1: number;
  gastoComSolarAno1: number;
  paybackAnos: number; // fração de anos (ex.: 2,05)
  paybackMeses: number; // arredondado
  economiaPorAno: number[]; // economia anual (ano 1..N)
  saldo: number[]; // saldo acumulado: saldo[0] = −investimento, saldo[Y]
  economiaHorizonte: number; // soma da economia no horizonte
}

/**
 * Rampa de cobrança do Fio B sobre a energia injetada — Lei 14.300/2022.
 *
 * É indexada pelo ANO-CALENDÁRIO, não pelo ano do projeto. A versão anterior
 * usava ano 1 = informado, ano 2 = 90%, ano 3+ = 100%, o que não corresponde à
 * lei em ano nenhum: comprimia a rampa e encarecia demais os anos 2 e 3.
 *
 * Antes de 2023 a compensação era integral (sem Fio B). De 2029 em diante vale
 * o percentual pleno.
 */
export const FIO_B_POR_ANO: Readonly<Record<number, number>> = {
  2023: 0.15,
  2024: 0.30,
  2025: 0.45,
  2026: 0.60,
  2027: 0.75,
  2028: 0.90,
};

export function fioBPctDoAno(ano: number): number {
  if (ano < 2023) return 0;
  return FIO_B_POR_ANO[ano] ?? 1;
}

export function simularEconomia(i: EconomiaInput): EconomiaResultado {
  const inflacao = i.inflacaoTarifa ?? 0.1;
  const degr = i.degradacao ?? 0.005;
  const anos = i.anos ?? 25;

  const economiaPorAno: number[] = [];
  const saldo: number[] = [-i.investimento];
  let gastoSem1 = 0;
  let gastoCom1 = 0;

  for (let Y = 1; Y <= anos; Y++) {
    const tarifaY = i.tarifaEnergia * Math.pow(1 + inflacao, Y - 1);
    const degrY = Math.pow(1 - degr, Y - 1);
    const pctY = fioBPctDoAno(i.anoInicial + Y - 1);

    let econY = 0;
    let semY = 0;
    let comY = 0;
    for (let m = 0; m < 12; m++) {
      const sem = i.consumo[m] * tarifaY + i.iluminacao;
      const injetada = i.geracaoMensal[m] * degrY * (1 - i.simultaneidade);
      const custoFioB = injetada * pctY * i.fioB;
      const custoDisponibilidade = i.disponibilidade * tarifaY;
      const com = Math.max(custoDisponibilidade, custoFioB) + i.iluminacao;
      econY += sem - com;
      semY += sem;
      comY += com;
    }
    economiaPorAno.push(econY);
    saldo.push(saldo[saldo.length - 1] + econY);
    if (Y === 1) {
      gastoSem1 = semY;
      gastoCom1 = comY;
    }
  }

  // Payback: primeiro ano com saldo ≥ 0, interpolando dentro do ano.
  let paybackAnos = anos + 1; // não paga dentro do horizonte
  for (let Y = 1; Y <= anos; Y++) {
    if (saldo[Y] >= 0) {
      const faltava = -saldo[Y - 1]; // quanto ainda faltava no início do ano Y
      const ganhoAno = economiaPorAno[Y - 1];
      const frac = ganhoAno > 0 ? faltava / ganhoAno : 0;
      paybackAnos = Y - 1 + frac;
      break;
    }
  }

  return {
    economiaAno1: economiaPorAno[0],
    economiaMensalMedia: economiaPorAno[0] / 12,
    gastoSemSolarAno1: gastoSem1,
    gastoComSolarAno1: gastoCom1,
    paybackAnos,
    paybackMeses: Math.round(paybackAnos * 12),
    economiaPorAno,
    saldo,
    economiaHorizonte: economiaPorAno.reduce((s, v) => s + v, 0),
  };
}
