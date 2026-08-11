import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Fornecimento de QGBT". Explica o passo a passo, a
 * fórmula do configurador (custo × Fator K → faturamento, impostos, margem) e os
 * valores padrão. Conteúdo estático — reflete src/services/qgbt.
 */
export function QgbtAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O <strong>QGBT — Quadro Geral de Baixa Tensão</strong> é o painel elétrico principal de uma instalação:
        reúne o <strong>barramento</strong>, o <strong>disjuntor geral</strong>, os disjuntores de distribuição, as
        proteções (DPS) e a medição dentro de um invólucro. Este serviço é o <strong>fornecimento do quadro</strong>{" "}
        montado, identificado e testado em bancada (ABNT NBR IEC 61439). Diferente dos projetos (que são por m²) e dos
        serviços por Fator K de mão de obra, o QGBT é um <strong>produto manufaturado</strong>: o preço nasce do{" "}
        <strong>custo dos componentes + montagem</strong>, multiplicado por um <strong>Fator K</strong>. Aqui está como
        cada número aparece.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Levante o custo do quadro.</strong> Some os componentes (barramento, disjuntor geral, disjuntores de distribuição, DPS, invólucro, medição) + a mão de obra de montagem. Isso é o <Destaque>custo por quadro</Destaque>.</li>
          <li><strong>Informe no configurador.</strong> Preencha a especificação (ex.: <em>350 A / 380 V IP55</em>), o nº de quadros iguais e o custo por quadro.</li>
          <li><strong>O app aplica o Fator K.</strong> Ele calcula o faturamento sugerido e mostra os KPIs: custo total, Fator K, faturamento, impostos/NF, lucro e margem líquida.</li>
          <li><strong>Confira a margem.</strong> Com o padrão a margem cai em <Destaque>≈ 20%</Destaque>. Quer outra margem? Ajuste o <strong>Fator K</strong> em “Parâmetros de preço” — é a entrada que você controla.</li>
          <li><strong>Ajuste o valor total, se precisar.</strong> O campo “Valor total” já vem com o sugerido; você pode digitar outro número — o botão <em>“Usar sugerido”</em> volta ao calculado.</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no molde padrão de serviços, com o objeto, o item de escopo e as condições (50% na contratação e 50% na entrega).</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O faturamento ao cliente é o <strong>custo do quadro multiplicado pelo Fator K</strong>. O Fator K é um markup: ele cobre os impostos, as despesas e o lucro da GTA de uma vez só.</p>
        <Formula nota="Ex.: custo R$ 20.000 × 1,55 = R$ 31.000; NF 15% = R$ 4.650; lucro = 31.000 − 20.000 − 4.650 = R$ 6.350 → margem = 6.350 ÷ 31.000 ≈ 20,5%.">
          custo        = custo por quadro × nº de quadros{"\n"}
          faturamento  = custo × Fator K   (arredondado ao múltiplo de R$ 10){"\n"}
          impostos/NF  = faturamento × 15%{"\n"}
          lucro        = faturamento − custo − impostos{"\n"}
          margem líq.  = lucro ÷ faturamento
        </Formula>
        <p>
          O <strong>Fator K padrão é <Destaque>1,55</Destaque></strong> e a <strong>alíquota de NF/impostos é <Destaque>15%</Destaque></strong> —
          os dois vêm da planilha real da GTA. Juntos, produzem uma margem líquida de <strong>≈ 20%</strong>.
        </p>
        <TabelaAjuda
          colunas={["Custo do quadro", "× 1,55 → faturamento", "Margem"]}
          linhas={[
            ["R$ 12.000", "R$ 18.600", "20,5%"],
            ["R$ 20.000", "R$ 31.000", "20,5%"],
            ["R$ 21.058", "R$ 32.640", "20,5%"],
          ]}
        />
        <p>
          Repare que a margem é <strong>a mesma</strong> nos três casos. Isso não é coincidência: o <strong>Fator K é a entrada</strong> (você
          escolhe) e a <strong>margem líquida é a saída</strong> (o resultado). Como tudo é proporcional ao custo, a margem só depende do Fator K e
          da alíquota — não do tamanho do quadro. Quer subir a margem? Suba o Fator K.
        </p>
        <Formula nota="Como faturamento ≈ custo × 1,55, a razão custo ÷ faturamento é sempre ≈ 1/1,55. Por isso a margem fica ≈ 20% qualquer que seja o custo — mude o Fator K e a margem muda junto.">
          margem = (faturamento − custo − impostos) ÷ faturamento{"\n"}
          {"       "}= 0,85 − (custo ÷ faturamento){"\n"}
          {"       "}≈ 0,85 − (1 ÷ 1,55)  ≈  20,5%
        </Formula>
      </AjudaSecao>

      {/* Composição */}
      <AjudaSecao n={3} titulo="O que compõe o QGBT (de onde vem o custo)">
        <p>O “custo por quadro” que você digita é a soma dos componentes do painel mais a montagem. São eles que o Fator K multiplica:</p>
        <TabelaAjuda
          colunas={["Componente", "Função no quadro"]}
          linhas={[
            ["Barramento (cobre)", "Distribui a corrente do disjuntor geral para os circuitos; dimensionado pela corrente nominal (ex.: 350 A)"],
            ["Disjuntor geral", "Protege e secciona toda a entrada do quadro"],
            ["Disjuntores de distribuição", "Um por circuito/carga que sai do quadro"],
            ["DPS", "Dispositivo de proteção contra surtos (raios, manobras)"],
            ["Invólucro / quadro", "A caixa metálica (ex.: IP55), barramentos de terra e neutro, identificação"],
            ["Medição", "TCs e multimedidor/analisador, quando o quadro tem medição"],
            ["Montagem e ensaio", "Mão de obra de montagem + teste em bancada (NBR IEC 61439)"],
          ]}
        />
        <p>A soma de tudo isso é o <Destaque>custo por quadro</Destaque>. Para vários quadros iguais, o custo total é <strong>custo por quadro × nº de quadros</strong>.</p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={4} titulo="Valores padrão">
        <p>
          O <strong>Fator K</strong> e a <strong>alíquota de NF</strong> são ajustáveis em <strong>“Parâmetros de preço”</strong> (dentro do
          configurador); a <strong>margem é consequência</strong> deles. Os padrões vêm da planilha real da GTA:
        </p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="k">Fator K</span>, <Destaque key="kv">1,55</Destaque>, "Markup sobre o custo (entrada; define o preço). Faixa aceita: 1 a 4"],
            [<span key="nf">NF / impostos</span>, <Destaque key="nfv">15%</Destaque>, "Alíquota sobre o faturamento. Faixa aceita: 0 a 50%"],
            [<span key="m">Margem líquida</span>, <Destaque key="mv">≈ 20%</Destaque>, "Resultado (saída) do Fator K e da NF — não é digitada"],
            ["Arredondamento", "R$ 10", "O faturamento é arredondado ao múltiplo de R$ 10 mais próximo"],
            ["Nº de quadros", "1", "Custo total = custo por quadro × nº de quadros"],
            ["Pagamento", "50% + 50%", "50% na contratação, 50% na entrega"],
            ["Validade", "20 dias", "Prazo padrão da proposta"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Modelo de cálculo: <strong>planilha real da GTA (GEOLAB)</strong> — o QGBT é tratado como <strong>produto manufaturado</strong> (custo × Fator K), não como serviço por hora ou por m².</li>
          <li>Fator K <strong>1,55</strong> e NF <strong>15%</strong>: padrões da planilha; juntos dão margem líquida <strong>≈ 20%</strong> (20,5%), a margem-alvo da GTA para fornecimento de quadros.</li>
          <li>O QGBT normalmente vem <strong>embutido em obras de subestação/execução</strong>; aqui é o fornecimento <strong>isolado</strong> do quadro, com preço próprio.</li>
          <li>Precisa mudar o Fator K ou o imposto? Abra <strong>“Parâmetros de preço”</strong> no configurador — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
