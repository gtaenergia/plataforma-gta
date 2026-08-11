import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — SPDA e Gerenciamento de Risco". Explica o passo a
 * passo, o modelo híbrido de preço (risco por bloco + projeto por m², com piso
 * mínimo) e os valores padrão. Conteúdo estático — reflete src/services/spda.
 */
export function SpdaAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Este serviço entrega o <strong>projeto de SPDA</strong> (Sistema de Proteção contra Descargas Atmosféricas — o
        conjunto de para-raios, descidas e aterramento) junto com o <strong>gerenciamento de risco</strong> exigido pela{" "}
        <strong>ABNT NBR 5419</strong>. A precificação é <strong>híbrida</strong>: soma um componente de{" "}
        <strong>risco cobrado por bloco</strong> (cada edificação tem sua própria análise) com um componente de{" "}
        <strong>projeto cobrado por m²</strong> (o esforço de desenho cresce com a área). A{" "}
        <strong>execução física</strong> (instalação de captores, descidas e malha de aterramento) é orçada à parte — aqui
        você precifica o projeto e o estudo de risco.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Nº de blocos/edificações.</strong> Conte cada estrutura independente que precisa de proteção — cada bloco recebe sua própria análise de risco da NBR 5419.</li>
          <li><strong>Área construída (m²).</strong> A área total de cobertura a proteger. É o que dimensiona o esforço do projeto (captação, descidas, malha).</li>
          <li><strong>Custo logístico</strong> (opcional). Deslocamento, hospedagem, diárias, aluguel de terrômetro, estagiário — entra <em>só</em> na conferência da margem, não muda o preço ao cliente.</li>
          <li><strong>O app calcula.</strong> Ele soma risco (por bloco) + projeto (por m²) e aplica o <Destaque>piso mínimo</Destaque> quando o job é pequeno.</li>
          <li><strong>Confira a margem.</strong> O app mostra o que sobra depois de imposto/NF e do custo logístico informado — conferência interna.</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com o escopo do projeto de SPDA e o gerenciamento de risco.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>
          O faturamento do projeto é a <strong>soma de dois componentes</strong>, protegida por um piso mínimo para não
          desvalorizar jobs pequenos:
        </p>
        <Formula nota="Ex.: 2 blocos + 800 m² → risco 3.300 + projeto 2.400 = R$ 5.700. Já 1 bloco + 200 m² → 1.650 + 600 = 2.250, abaixo do piso → faturamento sobe para R$ 2.500.">
          Risco       = R$ 1.650 × nº de blocos{"\n"}
          Projeto     = R$ 3,00 × área construída (m²){"\n"}
          Faturamento = MÁX(Risco + Projeto ; piso R$ 2.500)
        </Formula>
        <p>
          As âncoras são <Destaque>R$ 1.650 por bloco</Destaque> (gerenciamento de risco), <Destaque>R$ 3,00 por m²</Destaque>{" "}
          (projeto) e um <Destaque>piso de R$ 2.500</Destaque>. Quando a soma fica abaixo do piso, o item de projeto
          absorve a diferença e o faturamento é fixado em R$ 2.500.
        </p>
        <TabelaAjuda
          colunas={["Cenário", "Blocos", "Área (m²)", "Risco + Projeto", "Faturamento"]}
          linhas={[
            ["Prédio único pequeno", "1", "200", "1.650 + 600 = 2.250", <span key="p">R$ 2.500 <span className="hint">(piso)</span></span>],
            ["Condomínio 2 torres", "2", "800", "3.300 + 2.400", "R$ 5.700"],
            ["Galpão industrial", "3", "1.500", "4.950 + 4.500", "R$ 9.450"],
          ]}
        />
        <p>
          Sobre o faturamento, o app aplica <strong>15% de imposto/NF</strong> e desconta o custo logístico que você informar
          para mostrar a <strong>margem</strong>. Isso é <em>conferência interna</em> — o preço ao cliente é o faturamento, não muda com o custo:
        </p>
        <Formula nota="Ex.: faturamento R$ 5.700 → imposto R$ 855; com custo logístico de R$ 1.500 → margem = (5.700 − 855 − 1.500) ÷ 5.700 ≈ 58,7%.">
          Impostos = Faturamento × 15%{"\n"}
          Margem   = (Faturamento − Impostos − Custo logístico) ÷ Faturamento
        </Formula>
      </AjudaSecao>

      {/* Por que híbrido */}
      <AjudaSecao n={3} titulo="Por que híbrido (bloco + m²)">
        <p>
          As duas grandezas medem coisas diferentes, e por isso cada uma tem seu próprio preço:
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Risco → por bloco.</strong> O gerenciamento de risco da NBR 5419-2 é feito <em>por edificação</em>: cada
            bloco tem geometria, uso, ocupação e conteúdo próprios, então cada um exige um estudo completo (frequência de
            descargas, componentes de risco e comparação com o risco tolerável). Dois blocos = dois estudos, independente do
            tamanho de cada um.
          </li>
          <li>
            <strong>Projeto → por m².</strong> O dimensionamento físico (captores, descidas e malha de aterramento) cresce com
            a <em>área a proteger</em>: mais área significa mais pontos de captação, mais condutores de descida e mais malha
            desenhada. Por isso o esforço de projeto acompanha os m².
          </li>
        </ul>
        <p>
          Somando os dois, o preço fica justo tanto para um <strong>condomínio de vários blocos pequenos</strong> (muitos
          estudos de risco, pouca área cada) quanto para um <strong>galpão único e grande</strong> (um só estudo, muita área).
        </p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={4} titulo="Valores padrão">
        <p>Todos ajustáveis em <strong>Parâmetros</strong> (chave <code>spda:parametros</code>). Os padrões vêm da planilha real da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="a">Valor por bloco</span>, <Destaque key="av">R$ 1.650</Destaque>, "Gerenciamento de risco por bloco/edificação (análise NBR 5419-2)"],
            [<span key="b">Preço por m²</span>, <Destaque key="bv">R$ 3,00</Destaque>, "Projeto de SPDA por m² de área construída/cobertura"],
            [<span key="c">Piso mínimo</span>, <Destaque key="cv">R$ 2.500</Destaque>, "Faturamento mínimo do projeto — protege jobs pequenos"],
            [<span key="d">Imposto / NF</span>, <Destaque key="dv">15%</Destaque>, "Alíquota sobre o faturamento — entra só na conferência da margem"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Motor de cálculo: <strong>planilha real de custo do CESSG</strong> (06/2026) da GTA — risco R$ 1.650/bloco, projeto R$ 3/m², imposto/NF 15%.</li>
          <li>Piso de <strong>R$ 2.500</strong>: confirmado por <strong>2 laudos reais</strong> — condomínios <strong>Privilège</strong> e <strong>Terrazo JK</strong>, ambos fechados em R$ 2.500.</li>
          <li>Âncora de projeto maior: o <strong>projeto de SPDA da VOAR Aviação</strong> saiu por <strong>R$ 7.000</strong>.</li>
          <li>A <strong>execução</strong> (mão de obra + materiais: captores, descidas, aterramento) é orçada <strong>à parte</strong> — este serviço é o projeto + gerenciamento de risco.</li>
          <li>Imposto/NF (15%) e custo logístico entram <strong>só como conferência da margem</strong>; não alteram o preço ao cliente.</li>
          <li>Precisa mudar algum padrão? Abra <strong>“Parâmetros”</strong> — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
