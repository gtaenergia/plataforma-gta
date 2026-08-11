import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Fornecimento de Mão de Obra". Reflete o motor de
 * src/lib/mao-de-obra (a mesma conta da calculadora) e a repartição do preço
 * em src/lib/mao-de-obra/proposta.ts.
 */
export function MaoDeObraAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O Fornecimento de Mão de Obra vende equipe terceirizada por função e hora — eletricista, ajudante,
        encarregado — mais os materiais, ferramentas e equipamentos que a equipe leva para a obra. A conta é a mesma
        da calculadora de mão de obra: soma-se o custo e aplica-se o markup, com imposto e margem como percentuais do
        preço final. A diferença é a saída: aqui o resultado é a proposta .docx no padrão GTA, não uma planilha.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar a proposta)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li>
            <strong>Monte a equipe.</strong> Uma linha por função: quantas pessoas, quantas horas cada. O campo de
            horas aceita <Destaque>5 x 8</Destaque> para 5 dias de 8 horas. O R$/h de cada função vem do catálogo da
            calculadora de mão de obra — cadastrou lá, vale aqui.
          </li>
          <li>
            <strong>Relacione materiais e ferramentas.</strong> No campo de descrição, escolha da lista de{" "}
            <a href="/precos" className="btn-link">Preços de materiais</a> e o valor unitário vem de lá, travado — você
            informa só a quantidade. O que não estiver na lista, escreva: entra como item avulso, com preço válido só
            nesta proposta. O custo dos itens entra na conta antes do markup, então a margem incide também sobre o
            material.
          </li>
          <li>
            <strong>Aponte quem elaborou.</strong> As horas de montar esta proposta somam ao custo antes do markup,
            como as duas pernas acima. A seção no fim desta página explica.
          </li>
          <li>
            <strong>Confira imposto, margem e markup.</strong> Vêm com o padrão da empresa. Margem e markup são o
            mesmo número dito de dois jeitos: mexer num reescreve o outro, então use o que a negociação usar. Mudar
            aqui vale só para esta proposta.
          </li>
          <li>
            <strong>Confira o preço sugerido.</strong> O valor final é editável — para bater um preço já negociado,
            digite-o; o botão “Usar sugerido” volta ao calculado.
          </li>
          <li>
            <strong>Condições de pagamento e textos.</strong> Objeto, condições gerais e prazo já vêm com o padrão do
            serviço; a <strong>relação de materiais entra sozinha</strong> como última condição da proposta.
          </li>
          <li>
            <strong>Gere o .docx.</strong> Sai no molde padrão GTA, com o escopo resumindo a equipe
            (ex.: “2 Eletricistas × 40 h · 1 Ajudante × 40 h”).
          </li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O custo soma as três pernas; imposto e margem são percentuais do preço, não do custo:</p>
        <Formula nota="Com os padrões (7,02% + 30% → divisor 0,6298), um custo de R$ 6.298,00 vira preço de R$ 10.000,00.">
          custo   = equipe (Σ pessoas × horas × R$/h){"\n"}
          {"        "}+ materiais (Σ quantidade × valor unitário){"\n"}
          {"        "}+ elaboração (Σ horas × R$/h de quem montou){"\n"}
          divisor = 1 − imposto − margem{"\n"}
          preço   = custo ÷ divisor{"\n"}
          markup  = 1 ÷ divisor
        </Formula>
        <p>
          Dividir, e não multiplicar, é o que faz os percentuais saírem do preço final. Aplicada sobre o custo, a
          margem seria comida em parte pelo imposto, que incide sobre o preço cheio. Num preço de R$ 10.000 com 7,02%
          e 30%, o imposto leva R$ 702, o lucro R$ 3.000, e os R$ 6.298 restantes cobrem o custo.
        </p>
        <p>
          O <strong>markup</strong> é esse mesmo divisor visto ao contrário — quantas vezes o preço supera o custo. Os
          dois campos são editáveis e andam juntos: com imposto de 7,02%, margem de 30% equivale a markup de 1,588.
          Markup abaixo de 1 seria preço menor que o custo, e o campo não aceita.
        </p>
        <p>
          Imposto e margem somando 100% não é preço alto: é conta sem solução, com divisor zero ou negativo. O
          configurador trava e avisa em vez de inventar um número.
        </p>
      </AjudaSecao>

      {/* Como o documento apresenta */}
      <AjudaSecao n={3} titulo="Como a proposta apresenta o valor">
        <p>Quando há materiais, o documento sai com <strong>duas linhas de escopo</strong>:</p>
        <TabelaAjuda
          colunas={["Linha do escopo", "Valor"]}
          linhas={[
            ["Fornecimento de mão de obra especializada — resumo da equipe", "parte proporcional ao custo da equipe"],
            ["Materiais, ferramentas e equipamentos (relação)", "parte proporcional ao custo dos itens"],
          ]}
        />
        <p>
          A repartição segue a <strong>proporção do custo</strong>, então a margem fica igual nas duas linhas e a soma
          fecha exata com o valor total. A relação completa dos itens (descrição e quantidade) entra nas condições
          gerais — o cliente vê <strong>o que</strong> está incluso, não o custo interno de cada item.
        </p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao titulo="Valores padrão e de onde vêm os números">
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "De onde vem"]}
          linhas={[
            ["R$/h por função", "catálogo", "Cadastrado na calculadora de mão de obra; função sem custo é sinalizada"],
            [<span key="i">Imposto</span>, "7,02%", "O percentual que a GTA tem utilizado"],
            [<span key="m">Margem</span>, "30%", "Sobre o preço. Equivale a markup 1,588 com esse imposto"],
            ["Preço dos materiais", "lista", "De Preços de materiais, com validade de 90 dias por item"],
          ]}
        />
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            Quem não tem a permissão financeira monta equipe e materiais normalmente, mas não vê custo por hora, taxas
            nem sugestão — informa o valor final combinado. O corte é no servidor.
          </li>
          <li>
            Função sem custo cadastrado faz o preço sugerido sair por baixo, e o configurador avisa. Cadastre o R$/h
            antes de confiar na sugestão.
          </li>
          <li>
            Material da lista com preço vencido também rende aviso, com o caminho para revisar. Preço velho não
            impede gerar a proposta — só a faz nascer com a margem errada.
          </li>
          <li>Imposto, margem e markup mudados aqui valem só nesta proposta; o padrão da empresa segue o mesmo.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
