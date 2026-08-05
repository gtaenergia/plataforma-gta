import type {
  Composicao,
  ConfigMaoDeObra,
  Funcao,
  LinhaCalculada,
  LinhaMaoDeObra,
} from "./types";

/**
 * Do total de horas ao preço final.
 *
 * Puro: sem I/O, sem `Date`, sem ler configuração de lugar nenhum. Roda no
 * cliente para o preço acompanhar a digitação, e no servidor para gravar a
 * ficha — sem arrastar `node:fs` para o bundle.
 *
 * ## A conta
 *
 * ```
 * custo   = Σ (pessoas × horas × R$/h)
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

export function divisorDe(imposto: number, margem: number): number {
  return 1 - imposto - margem;
}

/** Markup = quanto o preço é maior que o custo. Só depende das duas taxas. */
export function markupDe(imposto: number, margem: number): number {
  const divisor = divisorDe(imposto, margem);
  return divisor > 0 ? 1 / divisor : 0;
}

export function calcularComposicao(
  linhas: readonly LinhaMaoDeObra[],
  config: Pick<ConfigMaoDeObra, "funcoes">,
  taxas: { imposto: number; margem: number },
): Composicao {
  const porId = new Map<string, Funcao>(config.funcoes.map((f) => [f.id, f]));

  /*
   * O custo é arredondado LINHA A LINHA, e não só no total.
   *
   * A recomendação usual é o contrário — arredondar uma vez no fim evita
   * acumular resto. Ela vale quando as parcelas não aparecem. Aqui a tela
   * mostra o valor de cada linha, e quem confere soma o que está vendo: se o
   * total viesse de outra conta, ele fecharia um centavo diferente da soma
   * visível, e a planilha do cliente acusaria.
   */
  const calculadas: LinhaCalculada[] = linhas.map((linha) => {
    const funcao = porId.get(linha.funcaoId);
    const pessoas = Number.isFinite(linha.pessoas) ? Math.max(0, linha.pessoas) : 0;
    const horas = Number.isFinite(linha.horas) ? Math.max(0, linha.horas) : 0;
    const horasTotais = pessoas * horas;
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

  const custoCent = calculadas.reduce((s, l) => s + l.custoCent, 0);
  // Linha com horas zeradas não conta como pendência — quem digitou 0 quis 0.
  const incompleta = calculadas.some((l) => l.incompleta && l.horasTotais > 0);

  const divisor = divisorDe(taxas.imposto, taxas.margem);
  if (!Number.isFinite(divisor) || divisor <= 0) {
    // Imposto + margem chegando a 100% do preço não é "preço muito alto": é
    // uma conta sem solução. Devolver um número aqui seria inventar.
    return {
      linhas: calculadas,
      custoCent,
      impostoCent: 0,
      lucroCent: 0,
      precoCent: 0,
      markup: 0,
      incompleta,
      impedimento: "divisor_invalido",
    };
  }

  const precoCent = Math.round(custoCent / divisor);
  const impostoCent = Math.round(precoCent * taxas.imposto);
  /*
   * O lucro é o RESTO, não `preço × margem`.
   *
   * Calculados os três de forma independente, o arredondamento faria
   * `custo + imposto + lucro` errar o preço por um centavo de vez em quando —
   * e a ficha do orçamento passaria a não fechar. Como resto, a identidade é
   * exata sempre, e o centavo cai onde deve: na margem, que é o resíduo do
   * negócio.
   */
  const lucroCent = precoCent - custoCent - impostoCent;

  return {
    linhas: calculadas,
    custoCent,
    impostoCent,
    lucroCent,
    precoCent,
    // Sem custo não há proporção a exibir; `preço / 0` viraria Infinity.
    markup: custoCent > 0 ? precoCent / custoCent : 0,
    incompleta,
  };
}
