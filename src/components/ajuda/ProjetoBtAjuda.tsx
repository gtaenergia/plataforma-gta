import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Projeto Elétrico de Baixa Tensão (BT)". Explica o
 * passo a passo, a fórmula modular por disciplina (R$/m² com piso e multiplicador
 * industrial), o objeto dinâmico e a conferência por %. Conteúdo estático —
 * reflete src/services/projeto-bt e o ProjetoBtConfigurator.
 */
export function ProjetoBtAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O <strong>Projeto Elétrico de Baixa Tensão</strong> (ABNT NBR 5410) é precificado de forma{" "}
        <strong>modular por disciplina</strong>: você informa a <strong>área construída</strong> e marca as disciplinas
        contratadas — <strong>força</strong> (tomadas), <strong>iluminação</strong> (luminotécnico),{" "}
        <strong>telecom</strong> (cabeamento estruturado) e <strong>retrofit</strong> (adequação do existente). Cada
        disciplina é orçada por <Destaque>R$/m²</Destaque> da área, vira um <strong>item</strong> na proposta e ainda
        compõe sozinha o <strong>objeto</strong> do documento. Os padrões foram ancorados no único dado real área↔preço da
        GTA (o projeto do CPMG de Itapuranga) — aqui está como cada número nasce.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Área construída (m²) + tipo.</strong> A área dirige a sugestão de preço de cada disciplina; o tipo (<Destaque>Residencial / Comercial</Destaque> ou <Destaque>Industrial</Destaque>) aplica o multiplicador de complexidade.</li>
          <li><strong>Marque as disciplinas.</strong> Força e iluminação são separáveis — marcar as duas equivale ao <strong>projeto predial completo</strong>. Cada marcada vira um item na proposta.</li>
          <li><strong>Confira / ajuste os valores.</strong> Cada disciplina traz a sugestão (área × taxa) já preenchida e <strong>editável</strong>. Mexeu à mão? O botão <Destaque>usar</Destaque> volta à sugestão automática.</li>
          <li><strong>Custo de execução</strong> (opcional). Informando o custo da obra, o app mostra o honorário como <strong>% da execução</strong> — a conferência de sanidade do preço.</li>
          <li><strong>Gere o .docx.</strong> O <strong>objeto se monta sozinho</strong> a partir das disciplinas marcadas; a proposta sai no padrão GTA com itens, memoriais e ART.</li>
        </ol>
        <p className="hint">Em branco a área, cada disciplina parte do seu <strong>piso</strong> mínimo e você ajusta manualmente. A referência da proposta é gerada automaticamente ao salvar.</p>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>Cada disciplina é orçada pela área multiplicada pela sua <strong>taxa R$/m²</strong> e pelo <strong>multiplicador do tipo</strong>, nunca abaixo do <strong>piso</strong>. O total do projeto é a <strong>soma</strong> das disciplinas marcadas:</p>
        <Formula nota="Ex.: galpão 800 m² industrial, força + iluminação → (11 + 7) × 800 × 1,4 = R$ 20.160. Loja 500 m² comercial → (11 + 7) × 500 = R$ 9.000. A sugestão é arredondada à dezena (R$ 10).">
          Preço da disciplina = MÁX(área × taxa × mult, piso){"\n"}
          Total do projeto    = soma das disciplinas marcadas
        </Formula>
        <p>
          O <strong>multiplicador</strong> é <Destaque>1,0</Destaque> em residencial/comercial e{" "}
          <Destaque>1,4</Destaque> em industrial (a edificação industrial é mais complexa — mais TUE, cargas e
          circuitos). Cada disciplina tem <strong>piso próprio</strong>: em áreas pequenas, o preço trava no piso e não
          desce mais. As quatro taxas padrão são <Destaque>força R$ 11/m²</Destaque>, <Destaque>iluminação R$ 7/m²</Destaque>,{" "}
          <Destaque>telecom R$ 5/m²</Destaque> e <Destaque>retrofit R$ 10/m²</Destaque>.
        </p>
        <p>Três cenários mostrando como o piso e o multiplicador entram (sempre força + iluminação):</p>
        <TabelaAjuda
          colunas={["Cenário", "Contas por disciplina", "Total"]}
          linhas={[
            [<span key="a">Casa 150 m² (residencial)</span>, "11×150 = 1.650 → piso 2.500 · 7×150 = 1.050 → piso 2.000", <strong key="av">R$ 4.500</strong>],
            [<span key="b">Loja 500 m² (comercial)</span>, "11×500 = 5.500 · 7×500 = 3.500", <strong key="bv">R$ 9.000</strong>],
            [<span key="c">Galpão 800 m² (industrial ×1,4)</span>, "11×800×1,4 = 12.320 · 7×800×1,4 = 7.840", <strong key="cv">R$ 20.160</strong>],
          ]}
        />
        <p className="hint">Na casa de 150 m², as duas disciplinas caem no piso — por isso o total (R$ 4.500) é maior que a conta bruta (18 × 150 = R$ 2.700). O atalho (11+7) só vale acima do piso.</p>
      </AjudaSecao>

      {/* Disciplinas */}
      <AjudaSecao n={3} titulo="As disciplinas (cada uma vira um item)">
        <p>Você monta o escopo marcando o que foi contratado. Cada disciplina tem taxa e piso próprios:</p>
        <TabelaAjuda
          colunas={["Disciplina", "Taxa", "Piso"]}
          linhas={[
            [<span key="f">Força — tomadas (TUG/TUE)</span>, <Destaque key="fv">R$ 11/m²</Destaque>, "R$ 2.500"],
            [<span key="i">Iluminação (luminotécnico)</span>, <Destaque key="iv">R$ 7/m²</Destaque>, "R$ 2.000"],
            [<span key="t">Telecom / cabeamento estruturado</span>, <Destaque key="tv">R$ 5/m²</Destaque>, "R$ 2.000"],
            [<span key="r">Retrofit / adequação de existente</span>, <Destaque key="rv">R$ 10/m²</Destaque>, "R$ 2.500"],
          ]}
        />
        <p>
          <strong>Força</strong> são os circuitos de tomadas de uso geral (TUG) e específico (TUE);{" "}
          <strong>iluminação</strong> é o projeto luminotécnico (pontos e circuitos de luz). Marcar as{" "}
          <strong>duas juntas</strong> é o <Destaque>projeto elétrico predial completo</Destaque> — o caso mais comum, e o
          padrão já vem com essas duas ligadas. <strong>Telecom</strong> (rede lógica e telefonia) e{" "}
          <strong>retrofit</strong> (modernização e correção de não conformidades de uma instalação existente) entram só
          quando contratados. As disciplinas são independentes: dá para cotar só força, só retrofit, ou qualquer
          combinação.
        </p>
      </AjudaSecao>

      {/* Objeto dinâmico + conferência */}
      <AjudaSecao n={4} titulo="Objeto dinâmico + conferência por %">
        <p>O <strong>objeto</strong> da proposta se escreve sozinho a partir das disciplinas marcadas — força + iluminação viram um bloco só (&quot;predial de baixa tensão&quot;), telecom e retrofit se somam ao texto. Alguns exemplos do que sai:</p>
        <Formula>
          Só retrofit → &quot;Elaboração do retrofit e adequação da instalação elétrica predial existente, ...&quot;{"\n"}
          Força + iluminação → &quot;... do projeto elétrico predial de baixa tensão (força e iluminação), ...&quot;{"\n"}
          Força + ilum. + telecom → &quot;... predial (força e iluminação) e do projeto de telecomunicações ...&quot;
        </Formula>
        <p>O texto sempre fecha com &quot;em conformidade com a ABNT NBR 5410, com pranchas técnicas (DWG/PDF), memoriais descritivo e de cálculo, lista de quantitativos e ART junto ao CREA/GO&quot;. Se você editar o objeto à mão, ele para de se recompor — o botão <Destaque>Recompor automático</Destaque> devolve o texto gerado.</p>
        <p>
          A <strong>conferência por %</strong> é uma checagem de sanidade (não vai no .docx): informando o{" "}
          <strong>custo de execução</strong> da obra, o app calcula <Destaque>honorário ÷ execução</Destaque>. A
          referência real da GTA (CPMG) é <strong>≈ 2,4%</strong>; a faixa usual de projeto elétrico fica entre{" "}
          <Destaque>2% e 6%</Destaque>. Ficou fora dessa faixa (abaixo de ~1,5% ou acima de 6%)? O app pinta o aviso em
          âmbar — reveja a área, as disciplinas ou o custo informado.
        </p>
        <Formula nota="Ex.: honorário R$ 20.160 sobre uma obra de R$ 850.000 → 2,37% (dentro da faixa). CPMG: R$ 15.000 sobre R$ 635.000 → 2,36%.">
          % do honorário = total do projeto ÷ custo de execução
        </Formula>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={5} titulo="Valores padrão">
        <p>Todos ajustáveis em <strong>Parâmetros de preço</strong> (dentro do configurador). Ao salvar, valem para todas as novas propostas de Projeto BT:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="tf">Taxa de força</span>, <Destaque key="tfv">R$ 11/m²</Destaque>, "Circuitos de tomadas (TUG/TUE)"],
            [<span key="pf">Piso de força</span>, "R$ 2.500", "Mínimo cobrado pela disciplina de força"],
            [<span key="ti">Taxa de iluminação</span>, <Destaque key="tiv">R$ 7/m²</Destaque>, "Projeto luminotécnico (pontos e circuitos)"],
            [<span key="pi">Piso de iluminação</span>, "R$ 2.000", "Mínimo cobrado pela disciplina de iluminação"],
            [<span key="tt">Taxa de telecom</span>, <Destaque key="ttv">R$ 5/m²</Destaque>, "Cabeamento estruturado (rede lógica e telefonia)"],
            [<span key="pt">Piso de telecom</span>, "R$ 2.000", "Mínimo cobrado pela disciplina de telecom"],
            [<span key="tr">Taxa de retrofit</span>, <Destaque key="trv">R$ 10/m²</Destaque>, "Adequação / modernização de instalação existente"],
            [<span key="pr">Piso de retrofit</span>, "R$ 2.500", "Mínimo cobrado pela disciplina de retrofit"],
            [<span key="mi">Multiplicador industrial</span>, <Destaque key="miv">1,4</Destaque>, "Fator de complexidade em edificação industrial (comercial = 1,0)"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>As propostas reais da GTA (CCB, Geolab) são <strong>lump sum por porte</strong> — o valor fechado aparece, mas nenhuma traz a métrica R$/m² escrita.</li>
          <li>O <strong>único dado área↔preço</strong> é o <strong>CPMG de Itapuranga</strong> (planilha de custo oficial): 677,72 m² e honorário de R$ 15.000 = <Destaque>R$ 22/m²</Destaque> do pacote, ou <Destaque>2,36%</Destaque> sobre uma obra de ~R$ 635 mil.</li>
          <li>Desse pacote, o <strong>projeto elétrico predial ≈ R$ 18/m²</strong> — foi esse valor que se <strong>repartiu por disciplina</strong> nas taxas de força (11), iluminação (7), telecom (5) e retrofit (10).</li>
          <li>Precisa mudar algum padrão (taxas, pisos ou o multiplicador industrial)? Abra <strong>&quot;Parâmetros de preço&quot;</strong> no configurador — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
