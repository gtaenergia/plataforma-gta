import type { ReactNode } from "react";

/** Primitivas visuais compartilhadas pelas páginas de ajuda "Como precificar". */

/** Seção com título (e número opcional, para o passo a passo). */
export function AjudaSecao({ n, titulo, children }: { n?: number; titulo: string; children: ReactNode }) {
  return (
    <section className="section-card">
      <h2 className="section-title flex items-center gap-2.5">
        {n != null && (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gta-indigo text-xs font-bold text-white">{n}</span>
        )}
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

/** Caixa de fórmula (monoespaçada) com nota opcional. */
export function Formula({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <code className="block whitespace-pre-wrap text-[13px] leading-relaxed text-gta-navy dark:text-indigo-200">{children}</code>
      {nota && <p className="mt-2 hint">{nota}</p>}
    </div>
  );
}

/** Destaque inline de um termo/valor. */
export function Destaque({ children }: { children: ReactNode }) {
  return <span className="rounded bg-indigo-50 px-1 font-semibold text-gta-indigo dark:bg-indigo-500/15 dark:text-indigo-300">{children}</span>;
}

/**
 * Rodapé compartilhado por TODAS as páginas "Como precificar": os dois recursos
 * que existem em todos os configuradores — as condições de pagamento e a
 * exportação da planilha .xlsx com fórmulas vivas. Fica no fim de cada tutorial.
 */
export function RodapeAjuda() {
  return (
    <>
      <AjudaSecao titulo="Condições de pagamento">
        <p>
          Antes de gerar a proposta, todo serviço tem a seção <strong>Condições de pagamento</strong>, com dois modos:
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Parcelado (tabela de %).</strong> Você define o <strong>percentual</strong> e o <strong>texto</strong> de
            cada parcela; o app calcula o <strong>valor em R$</strong> de cada uma a partir do total e monta a frase da
            proposta — ex.: <em>“20% (R$ 3.000) na assinatura, 50% (R$ 7.500) na entrega e 30% (R$ 4.500) na aprovação”</em>.
          </li>
          <li>
            <strong>A combinar.</strong> Escreve simplesmente <Destaque>A combinar</Destaque> — para quando o pagamento será
            negociado à parte (comum em obras/execução).
          </li>
        </ul>
        <p>
          A soma dos percentuais deve fechar <strong>100%</strong> (o app avisa se não fechar). Cada serviço já abre com uma
          sugestão típica — ajuste as parcelas livremente ou troque para “A combinar”.
        </p>
      </AjudaSecao>

      <AjudaSecao titulo="Baixar a planilha (.xlsx)">
        <p>
          Ao lado de <strong>Gerar .docx</strong> há o botão <strong>Baixar .xlsx</strong>. Ele exporta{" "}
          <strong>toda a precificação</strong> deste serviço para uma planilha Excel — e não como números soltos: com{" "}
          <strong>fórmulas vivas</strong>.
        </p>
        <p>
          Abra no Excel ou Google Sheets, mude uma entrada (custo, Fator K, quantidade, área…) e o{" "}
          <strong>faturamento e a margem se recalculam sozinhos</strong> — exatamente como no configurador. Serve para{" "}
          <strong>negociar</strong>, simular cenários ou <strong>arquivar o raciocínio</strong> por trás do preço.
        </p>
        <Formula nota="As fórmulas da planilha espelham o motor da plataforma: as células de custo/parâmetro são editáveis e as de resultado são fórmulas de Excel de verdade.">
          Faturamento = custo × Fator K   (célula editável){"\n"}
          Impostos    = faturamento × NF{"\n"}
          Lucro       = faturamento − custo − impostos{"\n"}
          Margem      = lucro ÷ faturamento
        </Formula>
      </AjudaSecao>
    </>
  );
}

/** Tabela simples de duas ou três colunas (ex.: valores padrão). */
export function TabelaAjuda({ colunas, linhas }: { colunas: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table-compacta">
        <thead>
          <tr className="border-b border-slate-200 uppercase tracking-wide dark:border-slate-700">
            {colunas.map((c, i) => <th key={i} className="py-2 pr-4 font-semibold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-700/60">
              {linha.map((cel, j) => (
                <td key={j} className={`py-2 pr-4 align-top ${j === 0 ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-300"}`}>{cel}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
