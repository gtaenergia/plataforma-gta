import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Rede de Distribuição MT/BT". Explica o modelo
 * dual (projeto + execução), as duas fórmulas de preço (custo × Fator K), por
 * que a margem sai 40% / ~35% e os valores padrão. Conteúdo estático — reflete
 * src/services/rede-mt (pricing.ts + params.ts).
 */
export function RedeMtAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        A <strong>Rede de Distribuição MT/BT</strong> cobre projeto e obra de redes de média e baixa tensão —{" "}
        <strong>loteamentos, extensões de rede e ramais</strong>. O modelo é <strong>dual</strong>: dois componentes{" "}
        <strong>independentes</strong> — <strong>projeto</strong> (o desenho aprovado na concessionária) e{" "}
        <strong>execução</strong> (a obra em campo) — e cada um tem o seu próprio <strong>Fator K</strong>. Um job pode
        ter só projeto, só execução ou os dois. O preço <strong>não</strong> vem do metro nem da tensão: vem do{" "}
        <strong>custo</strong> que você levanta, multiplicado pelo <strong>Fator K</strong>. Aqui está como cada número nasce.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo">
          <li><strong>Escolha os componentes.</strong> Marque <Destaque>projeto</Destaque>, <Destaque>execução</Destaque> ou os dois — conforme o que a GTA vai entregar neste contrato.</li>
          <li><strong>Monte a lista de custos (a automação).</strong> Em vez de digitar um valor fechado, você lança as linhas de custo numa <strong>tabela editável</strong>: cada linha tem <Destaque>etapa</Destaque> (projeto ou execução), descrição, <strong>quantidade</strong> e <strong>valor unitário</strong>. Adicione, edite ou remova linhas à vontade — o total de cada linha (qtd × valor) é calculado ao vivo.</li>
          <li><strong>O app soma por etapa e alimenta o Fator K.</strong> Ele agrupa as linhas de <Destaque>projeto</Destaque> e as de <Destaque>execução</Destaque>, soma cada grupo e usa essas somas como o <strong>custo</strong> de cada componente — sem você digitar o custo total à mão. Mexeu numa linha, o faturamento e a margem recalculam.</li>
          <li><strong>O app aplica o Fator K</strong> de cada componente, arredonda para R$ 10 e mostra o <strong>faturamento</strong> e a <strong>margem</strong> resultantes.</li>
          <li><strong>Confira a margem.</strong> Projeto mira <Destaque>40%</Destaque> e execução <Destaque>~35%</Destaque>. Se destoar, revise o custo informado ou ajuste o Fator K em Parâmetros.</li>
          <li><strong>Extensão e tensão</strong> (opcionais). Preencha para a descrição da proposta — não mudam o preço (veja a seção 4).</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com escopo, memorial e valores de projeto e/ou execução.</li>
        </ol>
      </AjudaSecao>

      {/* Preço dual */}
      <AjudaSecao n={2} titulo="Como o preço é calculado (modelo dual)">
        <p>
          São <strong>duas contas independentes</strong>. Em ambas o <strong>Fator K é a entrada</strong> e a{" "}
          <strong>margem é o resultado</strong> — você não digita a margem, ela cai naturalmente do Fator K e da NF.
        </p>

        <p className="pt-1"><strong>1) Projeto</strong> — a NF é <em>“por dentro”</em> (embutida no faturamento, por isso o custo é dividido por <code>1 − NF</code>):</p>
        <Formula nota="Ex.: custo R$ 10.000 → (10.000 × 1,889) ÷ 0,85 = R$ 22.223 → arredonda p/ R$ 22.220. NF = 22.220 × 15% = R$ 3.333; lucro = 22.220 − 10.000 − 3.333 = R$ 8.887; margem = 8.887 ÷ 22.220 = 40,0%.">
          Faturamento = arredonda p/ R$ 10 de:  (custo × Fator K) ÷ (1 − NF){"\n"}
          NF (imposto) = faturamento × NF{"\n"}
          Lucro        = faturamento − custo − NF{"\n"}
          Margem       = lucro ÷ faturamento   →   40%
        </Formula>
        <p>Projeto: <Destaque>Fator K 1,889</Destaque> · <Destaque>NF 15% (por dentro)</Destaque> → margem <strong>40%</strong>.</p>

        <p className="pt-1"><strong>2) Execução</strong> — o Fator K multiplica direto o custo; a NF de 6% incide <em>sobre o faturamento</em>:</p>
        <Formula nota="Ex.: custo R$ 50.000 → 50.000 × 1,7 = R$ 85.000. NF = 85.000 × 6% = R$ 5.100; lucro = 85.000 − 50.000 − 5.100 = R$ 29.900; margem = 29.900 ÷ 85.000 = 35,2%. Materiais e equipamentos principais são faturados à parte.">
          Faturamento = arredonda p/ R$ 10 de:  custo × Fator K{"\n"}
          NF (imposto) = faturamento × NF{"\n"}
          Lucro        = faturamento − custo − NF{"\n"}
          Margem       = lucro ÷ faturamento   →   ~35%
        </Formula>
        <p>Execução: <Destaque>Fator K 1,7</Destaque> · <Destaque>NF 6% (sobre o faturamento)</Destaque> → margem <strong>~35%</strong>.</p>

        <p className="pt-1">Por que a margem cai justo em 40% e ~35%? É pura álgebra do Fator K com a NF — não é um número digitado:</p>
        <Formula nota="Como o Fator K é fixo, a margem também é: mudar um muda o outro. Projeto e execução usam contas diferentes porque a NF entra em lugares diferentes (por dentro vs. sobre o faturamento).">
          Projeto:  margem = (1 − NF) × (1 − 1/K) = 0,85 × (1 − 1/1,889) = 40%{"\n"}
          Execução: margem = 1 − 1/K − NF         = 1 − 1/1,7 − 0,06     = 35,2%
        </Formula>

        <p className="pt-1">Alguns exemplos prontos (faturamento já arredondado para R$ 10):</p>
        <TabelaAjuda
          colunas={["Componente", "Custo", "Fator K", "Faturamento", "Margem"]}
          linhas={[
            ["Projeto", "R$ 5.000", "1,889", "R$ 11.110", "40%"],
            ["Projeto", "R$ 10.000", "1,889", "R$ 22.220", "40%"],
            ["Execução", "R$ 20.000", "1,7", "R$ 34.000", "35,2%"],
            ["Execução", "R$ 50.000", "1,7", "R$ 85.000", "35,2%"],
          ]}
        />
        <p className="hint">
          Materiais e equipamentos principais da execução (postes, cabos, transformadores) entram <strong>à parte</strong>, fora do custo × Fator K.
        </p>
      </AjudaSecao>

      {/* Projeto x execução */}
      <AjudaSecao n={3} titulo="Por que projeto e execução são separados">
        <p>
          Porque quase nunca são contratados juntos na mesma proporção. Um loteador pode querer <strong>só o projeto</strong> —
          o desenho da rede aprovado na concessionária (EQTL) para viabilizar o empreendimento — e tocar a obra com outra
          empreiteira. Ou pode querer <strong>também a execução</strong>, com a GTA construindo a rede em campo. E há quem já
          tenha o projeto e contrate <strong>só a execução</strong>.
        </p>
        <p>
          Como são serviços de <strong>natureza diferente</strong> (engenharia de gabinete × obra com equipe, máquinas e
          insumos), cada um tem o seu <strong>Fator K</strong> e a sua <strong>NF</strong>. Por isso o app calcula os dois de
          forma independente: informe o custo só do que a GTA vai entregar, e o faturamento total é a soma do que estiver
          marcado.
        </p>
        <Formula>
          Faturamento total = faturamento projeto + faturamento execução{"\n"}
          (qualquer um pode ser zero — depende do que foi contratado)
        </Formula>
      </AjudaSecao>

      {/* Extensão e tensão */}
      <AjudaSecao n={4} titulo="Extensão e tensão são só descrição (não entram no preço)">
        <p>
          Os campos de <strong>extensão</strong> (metros/km) e <strong>tensão</strong> (13,8 kV, 380/220 V…) servem apenas
          para <strong>compor o texto da proposta</strong> no .docx — memorial, escopo, título. Eles{" "}
          <strong>não</strong> entram em nenhuma conta de preço.
        </p>
        <p>
          O motivo é prático: as propostas reais da GTA são <strong>lump sum por porte</strong>, não R$/metro. O que
          determina o valor é o <strong>custo</strong> que o orçamentista levanta para aquele porte específico de rede — e é
          esse custo, multiplicado pelo Fator K, que vira o preço. Dobrar a extensão no campo de descrição{" "}
          <strong>não muda</strong> o faturamento; quem muda o faturamento é o custo informado.
        </p>
        <Destaque>Regra de ouro: descreveu em extensão/tensão, mas precificou no custo.</Destaque>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={5} titulo="Valores padrão">
        <p>Todos ajustáveis em <strong>Parâmetros</strong> (chave <code>rede-mt:parametros</code>). Os padrões vêm das planilhas reais e da calibração de gestão:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="kp">Fator K projeto</span>, <Destaque key="kpv">1,889</Destaque>, "Markup do projeto sobre o custo (com NF por dentro). Resulta em margem 40%."],
            [<span key="np">NF projeto</span>, <Destaque key="npv">15%</Destaque>, "Imposto/nota “por dentro” — embutido no faturamento (custo ÷ (1 − NF))."],
            [<span key="ke">Fator K execução</span>, <Destaque key="kev">1,7</Destaque>, "Markup da execução sobre o custo. Resulta em margem ~35%."],
            [<span key="ne">NF execução</span>, <Destaque key="nev">6%</Destaque>, "Imposto/nota sobre o faturamento da execução."],
          ]}
        />
        <p className="hint">
          Limites de segurança: Fator K projeto 1–5, Fator K execução 1–4, NF 0–50%. Faturamento sempre arredondado para o R$ 10 mais próximo.
        </p>
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Modelo de custo × Fator K: <strong>planilhas reais Rio Doce / Francefarma</strong> (execução), que calibraram o Fator K 1,7 e a NF 6%.</li>
          <li>Âncoras de projeto (lump sum): <strong>Serra Azul</strong> — projeto de rede do loteamento <strong>R$ 8.000</strong>; <strong>Reserva da Mata</strong> — estudo + perfil + projeto <strong>R$ 19.000</strong>. Na prática, para sair nesses valores o custo informado gira em torno de ≈ R$ 3.600 e ≈ R$ 8.550, respectivamente.</li>
          <li>Fator K do projeto <strong>1,889</strong>: calibrado para mirar <strong>40% de margem líquida</strong> com a NF de 15% por dentro — <strong>decisão de gestão (07/2026)</strong>.</li>
          <li>Precisa mudar algum padrão? Abra <strong>“Parâmetros”</strong> no configurador — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
