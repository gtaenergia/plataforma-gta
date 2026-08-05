import type ExcelJS from "exceljs";
import { Aba, BRL, NUM, PCT, cabecalho, novaPlanilha, num, tabelaCusto } from "./core";

/**
 * Memória de cálculo da mão de obra terceirizada.
 *
 * Não é um relatório: é uma planilha VIVA. O preço, o imposto, o lucro e o
 * markup saem de fórmulas que apontam para as células de custo e de taxa —
 * quem receber o arquivo muda a margem para 40% e vê o preço se mover, sem
 * precisar da plataforma aberta.
 *
 * É a diferença entre entregar o número e entregar a conta.
 */

interface Linha {
  funcao: string;
  pessoas: number;
  horas: number;
  custoHora: number;
}

export function planilhaMaoDeObra(d: {
  cliente?: string;
  servico?: string;
  linhas?: Linha[];
  imposto?: number; // 0..1
  margem?: number; // 0..1
}): ExcelJS.Workbook {
  const wb = novaPlanilha();
  const a = new Aba(wb, "Mão de obra");
  const linhas = Array.isArray(d.linhas) ? d.linhas : [];
  const imposto = num(d.imposto);
  const margem = num(d.margem);

  a.titulo(
    "Mão de obra terceirizada",
    "Memória de cálculo. As células em fórmula recalculam sozinhas — altere as horas ou as taxas e o preço acompanha.",
  );
  cabecalho(a, "", { cliente: d.cliente, referencia: d.servico });

  a.secao("Equipe e horas");
  /*
   * `tabelaCusto` espera quantidade × preço unitário. Aqui a quantidade é o
   * total de horas (pessoas × horas cada), o que mantém a planilha legível: a
   * coluna de horas é o que o cliente confere.
   */
  const somaCusto = tabelaCusto(
    a,
    linhas.map((l) => ({
      descricao: `${l.funcao}${num(l.pessoas) > 1 ? ` (${num(l.pessoas)} pessoas)` : ""}`,
      unidade: "h",
      qtd: num(l.pessoas) * num(l.horas),
      precoUnit: num(l.custoHora),
    })),
    "Custo total da mão de obra",
  );

  a.secao("Precificação");
  const refImposto = a.campo("Imposto sobre o preço", imposto, { fmt: PCT });
  const refMargem = a.campo("Margem de contribuição", margem, { fmt: PCT });

  /*
   * O divisor sai explícito, e não embutido nas fórmulas seguintes, para a
   * conta ficar auditável: quem abrir a planilha vê de onde veio o markup.
   *
   * A anotação original do dono trazia `1 − Imp + MC`, com sinal de mais, que
   * daria divisor 1,20 e contradiz os outros valores da mesma folha. O correto
   * é `1 − (Imp + MC)`.
   */
  const divisor = 1 - imposto - margem;
  const refDivisor = a.formula(
    "Divisor (1 − imposto − margem)",
    `1-${refImposto}-${refMargem}`,
    divisor,
    { fmt: NUM, nota: "Abaixo ou igual a zero significa que não existe preço possível" },
  );

  const custo = linhas.reduce((s, l) => s + num(l.pessoas) * num(l.horas) * num(l.custoHora), 0);

  if (divisor <= 0) {
    /*
     * Sem divisor não há preço, e a planilha precisa DIZER isso.
     *
     * Emitir as linhas mesmo assim produzia um "Lucro: −R$ 900,00" —
     * matematicamente coerente com preço zero, e completamente sem sentido
     * para quem abre o arquivo. Número sem significado é pior que número
     * ausente: ele parece resposta.
     */
    a.campo(
      "Sem preço possível",
      "Imposto e margem somam 100% ou mais do preço — não sobra nada para o custo.",
      { destaque: true },
    );
    return wb;
  }

  const preco = custo / divisor;

  a.formula("Markup", `IF(${refDivisor}>0,1/${refDivisor},0)`, 1 / divisor, { fmt: NUM });
  const refPreco = a.formula(
    "Preço ao cliente",
    `IF(${refDivisor}>0,${somaCusto}/${refDivisor},0)`,
    preco,
    { fmt: BRL, destaque: true },
  );

  a.secao("Composição do preço");
  a.formula("Custo da mão de obra", `${somaCusto}`, custo, { fmt: BRL });
  a.formula("Imposto", `${refPreco}*${refImposto}`, preco * imposto, { fmt: BRL });
  // O lucro sai como RESTO, igual ao motor da plataforma: assim as três
  // parcelas sempre somam o preço, sem sobrar centavo de arredondamento.
  a.formula("Lucro", `${refPreco}-${somaCusto}-(${refPreco}*${refImposto})`, preco - custo - preco * imposto, {
    fmt: BRL,
    bold: true,
  });

  return wb;
}
