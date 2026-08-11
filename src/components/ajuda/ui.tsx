import type { ReactNode } from "react";

/**
 * Primitivas das páginas "Como precificar".
 *
 * Elas usam o vocabulário da plataforma — `.section-card`, `.section-title`,
 * `.subcard`, `.hint` —, e não um estilo próprio. A versão anterior tinha
 * enfeites que não existem em nenhuma outra tela: um círculo índigo numerando
 * cada seção e um realce com fundo colorido no meio do texto. Chamavam mais
 * atenção que o conteúdo e faziam a página parecer de outro produto.
 */

/** Seção com título e, no passo a passo, o número da etapa. */
export function AjudaSecao({ n, titulo, children }: { n?: number; titulo: string; children: ReactNode }) {
  return (
    <section className="section-card">
      <h2 className="section-title">
        {/* O número é discreto de propósito: ele ordena, não anuncia. */}
        {n != null && <span className="mr-2 font-normal tabular-nums text-slate-400 dark:text-slate-500">{n}.</span>}
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
    </section>
  );
}

/** Caixa de fórmula (monoespaçada) com nota opcional. */
export function Formula({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="subcard !p-3">
      <code className="block overflow-x-auto whitespace-pre text-[13px] leading-relaxed text-gta-navy dark:text-slate-200">
        {children}
      </code>
      {nota && <p className="mt-2 hint">{nota}</p>}
    </div>
  );
}

/** Um valor que a pessoa vai procurar de novo depois: taxa, preço, prazo. */
export function Destaque({ children }: { children: ReactNode }) {
  return <span className="font-semibold tabular-nums text-gta-navy dark:text-slate-100">{children}</span>;
}

/**
 * Rodapé compartilhado por TODAS as páginas "Como precificar": o que existe em
 * todos os configuradores — o custo da própria equipe, as condições de
 * pagamento e a exportação da planilha .xlsx com fórmulas vivas.
 *
 * Mora aqui, e não copiado em treze arquivos, porque o que é comum a todos os
 * serviços muda para todos ao mesmo tempo: uma explicação duplicada envelhece
 * em treze lugares e ninguém percebe qual ficou para trás.
 */
export function RodapeAjuda() {
  return (
    <>
      <AjudaSecao titulo="O custo da própria equipe">
        <p>
          Todo configurador tem uma seção para apontar <strong>as horas da GTA</strong> neste trabalho. Elas não vão
          para a proposta do cliente — servem para a margem dizer a verdade.
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Custo de elaboração da proposta.</strong> O tempo gasto para <em>montar</em> este orçamento. Existe
            mesmo quando o cliente não fecha, e era o custo que passava despercebido — toda proposta consome horas de
            gente e ninguém contava.
          </li>
          <li>
            <strong>Equipe responsável.</strong> Quem vai <em>executar</em> o trabalho vendido. No Fornecimento de Mão
            de Obra esta seção não aparece: ali a equipe é o que se vende, e tem seção própria com preço.
          </li>
        </ul>
        <p>
          O <strong>Tipo de demanda</strong> puxa as horas do catálogo de Planejamento e capacidade. Se o trabalho não
          tiver equivalente lá, <strong>escreva o seu</strong> — ele vale só para esta proposta e não entra no catálogo,
          porque cadastrar tipo é decisão de planejamento, não efeito de escrever num orçamento.
        </p>
        <p>
          Nos serviços de <strong>Fator K</strong> esse custo entra na base <strong>antes</strong> do markup, então
          mexe no preço sugerido. Nos serviços <strong>por métrica</strong> (tabela de R$/bloco, R$/m²) o preço já vem
          da tabela: ali o custo não muda o preço, só a margem que você vê. O R$/h de cada pessoa vem de{" "}
          <strong>Custo por hora da equipe</strong>, e quem não tem a permissão financeira não vê nada disto — a seção
          inteira some, e os valores não chegam nem ao navegador.
        </p>
      </AjudaSecao>

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
          <tr className="border-b border-slate-200 dark:border-slate-700">
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
