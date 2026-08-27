/**
 * Saneamento de uma proposta Solar salva, na hora de reabrir.
 *
 * O formulário de hoje impede os valores abaixo, mas propostas antigas foram
 * salvas quando ele não impedia — quantidade de inversores zerada (o campo
 * aceitava ficar vazio, e vazio virava 0), potência de painel apagada no modo
 * "outro". Reabrir esses registros deixava o cálculo mudo para sempre: a API
 * recusava o corpo inteiro e a tela engolia a recusa.
 *
 * Curar AQUI, e não só no servidor, faz o campo mostrar o valor que será
 * usado — o usuário vê "1", e não um vazio que calcula como 1.
 */

/** Mensagens de erro de cálculo da API, em frase única legível. */
export function fraseDoErroDeCalculo(json: unknown): string {
  const j = json as { error?: string; issues?: { fieldErrors?: Record<string, string[]> } } | null;
  const campos: Record<string, string> = {
    municipio: "Cidade da instalação",
    consumo: "Consumo mensal",
    potenciaPainel: "Potência do painel",
    potenciaInversor: "Potência do inversor",
    qtdInversores: "Quantidade de inversores",
    eficiencia: "Eficiência",
    overloadDesejado: "Overload desejado",
    nPaineis: "Número de painéis",
    microPotenciaKw: "Potência do microinversor",
    microQtd: "Quantidade de microinversores",
    margemSeguranca: "Margem de segurança",
    anoInicial: "Ano de emissão",
    tarifaEnergia: "Tarifa de energia",
  };
  const erros = j?.issues?.fieldErrors;
  if (erros) {
    const [campo, msgs] = Object.entries(erros).find(([, m]) => m?.length) ?? [];
    if (campo && msgs) {
      const msg = /greater than 0/.test(msgs[0])
        ? "precisa ser maior que zero"
        : /less than or equal to (\S+)/.test(msgs[0])
          ? `no máximo ${/less than or equal to (\S+)/.exec(msgs[0])![1]}`
          : /greater than or equal to (\S+)/.test(msgs[0])
            ? `no mínimo ${/greater than or equal to (\S+)/.exec(msgs[0])![1]}`
            : msgs[0];
      return `${campos[campo] ?? campo}: ${msg}.`;
    }
  }
  if (j?.error) return j.error;
  return "A API recusou os dados do cálculo.";
}

/** Números que o formulário exige e propostas antigas podem ter estragado. */
export function sanearFormSolar<T extends { qtdInversores?: number; potenciaPainel?: number }>(dados: T): T {
  const saida = { ...dados };
  const qtd = Number(saida.qtdInversores);
  if (!Number.isFinite(qtd) || qtd < 1) saida.qtdInversores = 1;
  else saida.qtdInversores = Math.floor(qtd);
  const painel = Number(saida.potenciaPainel);
  // 700 é o mesmo padrão do formulário em branco — não inventa engenharia nova,
  // devolve o campo ao estado que ele teria se nunca tivesse sido estragado.
  if (!Number.isFinite(painel) || painel <= 0) saida.potenciaPainel = 700;
  return saida;
}
