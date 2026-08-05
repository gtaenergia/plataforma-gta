import type {
  Composicao,
  ComposicaoTotal,
  ConfigMaoDeObra,
  Funcao,
  LinhaCalculada,
  LinhaEquipe,
  LinhaEquipeCalculada,
  LinhaMaoDeObra,
} from "./types";

/**
 * Das horas ao preço.
 *
 * Puro: sem I/O, sem `Date`, sem ler configuração de lugar nenhum. Roda no
 * cliente para o preço acompanhar a digitação, e no servidor para gravar a
 * ficha — sem arrastar `node:fs` para o bundle.
 *
 * ## A conta
 *
 * ```
 * custo   = custo terceirizado + custo da equipe interna
 * divisor = 1 − imposto − margem
 * preço   = custo / divisor
 * ```
 *
 * Imposto e margem são percentuais do PREÇO, não do custo. É o que faz a conta
 * do dono fechar: com custo 4.171,72, imposto 15% e margem 35%, o divisor é
 * 0,50 e o preço 8.343,45 — os quatro números da folha dele.
 *
 * ## Cuidado com a fórmula escrita à mão
 *
 * A anotação original traz `CMV / (1 − Imp + MC)`, com sinal de mais. Lida ao
 * pé da letra ela dá divisor 1,20 e preço 3.476,44, o que contradiz todos os
 * outros valores da mesma página. O `+` é deslize de notação para
 * `1 − (Imp + MC)`. Seguir o escrito cobraria 42% do preço certo.
 */

/** Tudo em centavos inteiros: a identidade abaixo tem que fechar na moeda. */
const aCentavos = (reais: number): number => Math.round(reais * 100);

/** Número que veio de formulário: absorve NaN, Infinity e negativo. */
const saneado = (v: number): number => (Number.isFinite(v) ? Math.max(0, v) : 0);

export function divisorDe(imposto: number, margem: number): number {
  return 1 - imposto - margem;
}

/** Markup = quanto o preço é maior que o custo. Só depende das duas taxas. */
export function markupDe(imposto: number, margem: number): number {
  const divisor = divisorDe(imposto, margem);
  return divisor > 0 ? 1 / divisor : 0;
}

/**
 * Custo da mão de obra TERCEIRIZADA.
 *
 * O custo é arredondado LINHA A LINHA, e não só no total. A recomendação usual
 * é o contrário — arredondar uma vez no fim evita acumular resto. Ela vale
 * quando as parcelas não aparecem. Aqui a tela mostra o valor de cada linha, e
 * quem confere soma o que está vendo: se o total viesse de outra conta, ele
 * fecharia um centavo diferente da soma visível.
 */
export function custoDeLinhas(
  linhas: readonly LinhaMaoDeObra[],
  funcoes: readonly Funcao[],
): { linhas: LinhaCalculada[]; custoCent: number; incompleta: boolean } {
  const porId = new Map<string, Funcao>(funcoes.map((f) => [f.id, f]));

  const calculadas: LinhaCalculada[] = linhas.map((linha) => {
    const funcao = porId.get(linha.funcaoId);
    const horasTotais = saneado(linha.pessoas) * saneado(linha.horas);
    const custoHora = funcao && Number.isFinite(funcao.custoHora) ? funcao.custoHora : 0;
    return {
      linha,
      funcao,
      horasTotais,
      custoCent: aCentavos(horasTotais * custoHora),
      // Função apagada do catálogo, ou cadastrada sem valor: o total sai por
      // baixo e ninguém percebe, porque zero é um número plausível.
      incompleta: !funcao || custoHora <= 0,
    };
  });

  return {
    linhas: calculadas,
    custoCent: calculadas.reduce((s, l) => s + l.custoCent, 0),
    // Linha com horas zeradas não conta como pendência — quem digitou 0 quis 0.
    incompleta: calculadas.some((l) => l.incompleta && l.horasTotais > 0),
  };
}

/**
 * Custo da EQUIPE INTERNA da GTA.
 *
 * `pessoas` é um mapa simples de e-mail para R$/h, e não a configuração
 * inteira, de propósito: o motor não pode depender do módulo que lê o banco,
 * senão deixa de rodar no cliente.
 */
export function custoDaEquipe(
  linhas: readonly LinhaEquipe[],
  pessoas: Readonly<Record<string, number>>,
): { linhas: LinhaEquipeCalculada[]; custoCent: number; incompleta: boolean } {
  const calculadas: LinhaEquipeCalculada[] = linhas.map((linha) => {
    const bruto = pessoas[linha.email?.trim().toLowerCase() ?? ""] ?? pessoas[linha.email] ?? 0;
    const custoHora = Number.isFinite(bruto) ? Math.max(0, bruto) : 0;
    const horas = saneado(linha.horas);
    return {
      linha,
      custoHora,
      custoCent: aCentavos(horas * custoHora),
      incompleta: custoHora <= 0,
    };
  });

  return {
    linhas: calculadas,
    custoCent: calculadas.reduce((s, l) => s + l.custoCent, 0),
    incompleta: calculadas.some((l) => l.incompleta && saneado(l.linha.horas) > 0),
  };
}

interface Preco {
  precoCent: number;
  impostoCent: number;
  lucroCent: number;
  markup: number;
  impedimento?: "divisor_invalido";
}

/**
 * A conta compartilhada pelas duas fontes: do custo total ao preço.
 *
 * O lucro é o RESTO, não `preço × margem`. Calculados de forma independente, o
 * arredondamento faria `custo + imposto + lucro` errar o preço por um centavo
 * de vez em quando — e a ficha do orçamento passaria a não fechar. Como resto,
 * a identidade é exata sempre, e o centavo cai onde deve: na margem, que é o
 * resíduo do negócio.
 */
export function aplicarMarkup(custoCent: number, taxas: { imposto: number; margem: number }): Preco {
  const divisor = divisorDe(taxas.imposto, taxas.margem);
  if (!Number.isFinite(divisor) || divisor <= 0) {
    // Imposto + margem chegando a 100% do preço não é "preço muito alto": é
    // uma conta sem solução. Devolver um número aqui seria inventar.
    return { precoCent: 0, impostoCent: 0, lucroCent: 0, markup: 0, impedimento: "divisor_invalido" };
  }
  const precoCent = Math.round(custoCent / divisor);
  const impostoCent = Math.round(precoCent * taxas.imposto);
  return {
    precoCent,
    impostoCent,
    lucroCent: precoCent - custoCent - impostoCent,
    // Sem custo não há proporção a exibir; `preço / 0` viraria Infinity.
    markup: custoCent > 0 ? precoCent / custoCent : 0,
  };
}

/** Composição só com mão de obra terceirizada. Assinatura preservada. */
export function calcularComposicao(
  linhas: readonly LinhaMaoDeObra[],
  config: Pick<ConfigMaoDeObra, "funcoes">,
  taxas: { imposto: number; margem: number },
): Composicao {
  const t = custoDeLinhas(linhas, config.funcoes);
  const p = aplicarMarkup(t.custoCent, taxas);
  return {
    linhas: t.linhas,
    custoCent: t.custoCent,
    impostoCent: p.impostoCent,
    lucroCent: p.lucroCent,
    precoCent: p.precoCent,
    markup: p.markup,
    incompleta: t.incompleta,
    ...(p.impedimento ? { impedimento: p.impedimento } : {}),
  };
}

/**
 * Composição com as DUAS fontes.
 *
 * As duas somam ANTES do markup — é o "custo administrativo mais o custo da
 * terceirização" do áudio. Cada uma sozinha também vale: "cada caso vai ser um
 * caso".
 */
export function calcularComposicaoTotal(
  entrada: { terceirizada?: readonly LinhaMaoDeObra[]; interna?: readonly LinhaEquipe[] },
  catalogos: { funcoes: readonly Funcao[]; pessoas: Readonly<Record<string, number>> },
  taxas: { imposto: number; margem: number },
): ComposicaoTotal {
  const t = custoDeLinhas(entrada.terceirizada ?? [], catalogos.funcoes);
  const i = custoDaEquipe(entrada.interna ?? [], catalogos.pessoas);
  const custoCent = t.custoCent + i.custoCent;
  const p = aplicarMarkup(custoCent, taxas);

  return {
    terceirizada: t.linhas,
    interna: i.linhas,
    custoTerceirizadoCent: t.custoCent,
    custoAdministrativoCent: i.custoCent,
    custoCent,
    impostoCent: p.impostoCent,
    lucroCent: p.lucroCent,
    precoCent: p.precoCent,
    markup: p.markup,
    incompleta: t.incompleta || i.incompleta,
    ...(p.impedimento ? { impedimento: p.impedimento } : {}),
  };
}
