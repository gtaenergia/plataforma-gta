import type { Negociacao } from "@/lib/crm/types";
import { valoresDaNegociacao } from "@/lib/crm/types";
import { hojeBrasilia } from "./datas";
import type { ReceitaCrm } from "./tipos";

/**
 * Negociações GANHAS no CRM, como o Financeiro as enxerga.
 *
 * Só a situação "ganha" conta: reabrir a negociação a tira do DRE e do caixa
 * sozinha, sem ninguém precisar desfazer nada aqui. O dia do fechamento é o
 * de Brasília — ganhar às 22h do dia 30 é faturamento do dia 30, não do 1º
 * do mês seguinte (o servidor roda em UTC).
 */
export function receitasDoCrm(negociacoes: Pick<Negociacao, "id" | "nome" | "empresaNome" | "valor" | "produtos" | "situacao" | "fechadoEm" | "responsavelNome">[]): ReceitaCrm[] {
  return negociacoes
    .filter((n) => n.situacao === "ganha" && n.fechadoEm)
    .map((n) => {
      const { unico, mensal } = valoresDaNegociacao(n);
      const quando = new Date(n.fechadoEm);
      return {
        negociacaoId: n.id,
        nome: n.nome,
        cliente: n.empresaNome,
        valor: Math.round(unico * 100) / 100,
        mensal: Math.round(mensal * 100) / 100,
        fechadoEm: isNaN(quando.getTime()) ? n.fechadoEm.slice(0, 10) : hojeBrasilia(quando),
        responsavelNome: n.responsavelNome,
      };
    })
    .sort((a, b) => b.fechadoEm.localeCompare(a.fechadoEm));
}
