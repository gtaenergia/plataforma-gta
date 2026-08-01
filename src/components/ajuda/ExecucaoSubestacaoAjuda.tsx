import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Execução de Subestação". Explica o passo a passo,
 * a fórmula de custo × Fator K, os valores padrão e a origem dos números.
 * Conteúdo estático — reflete src/services/execucao-subestacao.
 */
export function ExecucaoSubestacaoAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Este serviço é a <strong>execução física</strong> da subestação — a construção civil e a montagem
        eletromecânica (aterramento, malha, eletrodutos, barramentos, cabeamento, comissionamento). O preço nasce do{" "}
        <strong>custo do orçamento (BOM)</strong> multiplicado por um <strong>Fator K</strong>: você levanta quanto
        vai gastar, o app aplica o markup e mostra a margem. <strong>O projeto/design é serviço à parte</strong>{" "}
        (“Projeto de Subestação”) — aqui a GTA <em>constrói</em>, não desenha.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo">
          <li><strong>Levante o custo (BOM).</strong> Some tudo que a obra consome, em três blocos: <Destaque>materiais</Destaque> (cabos, eletrodutos, malha de aterramento, barramento, ferragens, brita, concreto…), <Destaque>mão de obra</Destaque> (equipe de montagem e civil) e <Destaque>projeto/ART/outros</Destaque> (ART, deslocamento, EPI, andaime, aluguel de equipamento).</li>
          <li><strong>Informe os três custos no configurador.</strong> São os únicos campos de entrada — o custo total é a soma deles.</li>
          <li><strong>O app aplica o Fator K.</strong> Multiplica o custo por <Destaque>1,7</Destaque> (padrão) e arredonda para o múltiplo de R$ 10 mais próximo. Esse é o faturamento sugerido ao cliente.</li>
          <li><strong>Confira a margem líquida.</strong> Com K 1,7 e NF 6% ela cai perto de <Destaque>35%</Destaque>. Mire <span className="text-green-600 dark:text-green-400">≥ 30% (verde)</span>. Se o job for mais arriscado ou disputado, ajuste o Fator K — a margem se move junto.</li>
          <li><strong>Fature trafo e cubículo à parte.</strong> Os equipamentos principais não entram no custo × K (veja a seção 3).</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com o escopo da execução e o valor.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>
          O modelo é <strong>custo × Fator K</strong> (o mesmo do carregador veicular). O <strong>Fator K é a ENTRADA</strong>{" "}
          que você controla; a <strong>margem líquida é a SAÍDA</strong> — ela é apenas o resultado da conta. Quem se ajusta é sempre o K.
        </p>
        <Formula nota="Ex.: custo R$ 100.000 × 1,7 = R$ 170.000; NF (6%) = R$ 10.200; lucro = 170.000 − 100.000 − 10.200 = R$ 59.800 → margem = 59.800 ÷ 170.000 ≈ 35,2%. O faturamento é arredondado para o múltiplo de R$ 10 mais próximo.">
          Custo         = materiais + mão de obra + projeto/ART/outros{"\n"}
          Faturamento   = custo × Fator K        (arredondado a R$ 10){"\n"}
          Impostos/NF   = faturamento × 6%{"\n"}
          Lucro         = faturamento − custo − impostos{"\n"}
          Margem líq.   = lucro ÷ faturamento
        </Formula>
        <p>
          Padrões: <strong>Fator K <Destaque>1,7</Destaque></strong> e <strong>NF/imposto <Destaque>6%</Destaque></strong> sobre o
          faturamento. O imposto incide sobre o <em>faturamento</em>, não sobre o custo.
        </p>
        <p>
          Com a NF fixa em 6%, a margem depende <strong>só do Fator K</strong> — dá para prever de cabeça pela relação{" "}
          <Destaque>margem ≈ 0,94 − 1 ÷ K</Destaque>. Por isso, para mudar a margem, você mexe no K:
        </p>
        <TabelaAjuda
          colunas={["Fator K", "Faturamento (custo R$ 100 mil)", "Margem líquida"]}
          linhas={[
            ["1,5", "R$ 150.000", <span key="a" className="text-amber-600 dark:text-amber-400">≈ 27%</span>],
            [<span key="b"><Destaque>1,7</Destaque> (padrão)</span>, "R$ 170.000", <span key="c" className="text-green-600 dark:text-green-400">≈ 35%</span>],
            ["2,0 (Ecosol 2 MVA)", "R$ 200.000", <span key="d" className="text-green-600 dark:text-green-400">≈ 44%</span>],
          ]}
        />
        <p className="hint">
          Indicador de margem: <span className="text-green-600 dark:text-green-400">≥ 30% boa</span> ·{" "}
          <span className="text-amber-600 dark:text-amber-400">15–30% atenção</span> ·{" "}
          <span className="text-red-600 dark:text-red-400">&lt; 15% baixa</span>. O Fator K aceita valores de 1 a 4.
        </p>
      </AjudaSecao>

      {/* O que fica de fora */}
      <AjudaSecao n={3} titulo="O que NÃO entra no custo × K">
        <p>
          Os <strong>equipamentos principais</strong> da subestação são <strong>faturados à parte</strong>, fora da conta de custo × Fator K:
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li><strong>Transformador</strong> (a máquina, seja 300 kVA, 500 kVA, 1 ou 2 MVA).</li>
          <li><strong>Cubículo / disjuntor de média tensão</strong> (proteção e manobra MT).</li>
        </ul>
        <p>
          Por que fora? São itens de <strong>alto valor unitário</strong> que a GTA repassa praticamente ao custo — aplicar o
          Fator K de execução sobre eles inflaria o preço sem representar trabalho de montagem. No configurador, o custo × K
          cobre a <strong>obra e a instalação</strong>; trafo e cubículo entram como <strong>linhas separadas</strong> na proposta,
          com o markup próprio de fornecimento de equipamento.
        </p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={4} titulo="Valores padrão">
        <p>Ajustáveis em <strong>Parâmetros da plataforma</strong> (dentro do configurador). Valem para todas as novas propostas de execução:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="k">Fator K</span>, <Destaque key="kv">1,7</Destaque>, "Markup sobre o custo (entrada). Aceita de 1 a 4"],
            [<span key="n">NF / imposto</span>, <Destaque key="nv">6%</Destaque>, "Alíquota sobre o faturamento (não sobre o custo)"],
            [<span key="m">Margem líquida</span>, <span key="mv" className="text-green-600 dark:text-green-400">≈ 35%</span>, "RESULTADO de K 1,7 + NF 6% — não se digita, sai da conta"],
          ]}
        />
        <p className="hint">
          Mexer no Fator K é o que muda a margem: 1,5 → ~27%, 1,7 → ~35%, 2,0 → ~44% (relação margem ≈ 0,94 − 1 ÷ K).
        </p>
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Modelo custo × Fator K e o padrão <strong>K 1,7</strong>: planilhas reais de execução da GTA — <strong>Rio Doce</strong> e <strong>Francefarma</strong>.</li>
          <li>NF <strong>6%</strong> sobre o faturamento → com K 1,7 a margem líquida fecha em <strong>≈ 35%</strong>, alinhada às obras reais.</li>
          <li>O Fator K é <strong>ajustável</strong> porque cada obra tem seu risco: um job recente (<strong>Ecosol, 2 MVA</strong>) usou <strong>K 2,0</strong> (margem ~44%).</li>
          <li>Precisa mudar o K ou a NF? Abra <strong>“Parâmetros da plataforma”</strong> no configurador — o ajuste vale para todas as novas propostas.</li>
          <li>A execução (esta página) é o <strong>“como construir”</strong>; o <strong>“Projeto de Subestação”</strong> (o desenho/dimensionamento) é serviço separado, com precificação própria.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
