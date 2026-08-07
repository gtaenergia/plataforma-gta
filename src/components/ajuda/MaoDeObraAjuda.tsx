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
        O <strong>Fornecimento de Mão de Obra</strong> vende equipe <strong>terceirizada</strong> por função e hora —
        eletricista, ajudante, encarregado — mais os <strong>materiais, ferramentas e equipamentos</strong> que a
        equipe leva para a obra. A conta é a mesma da calculadora de mão de obra: soma-se o custo das duas pernas e
        aplica-se o markup, com <strong>imposto e margem como percentuais do preço final</strong>. A diferença é a
        saída: aqui o resultado é a <strong>proposta .docx</strong> no padrão GTA, não uma planilha.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar a proposta)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li>
            <strong>Monte a equipe.</strong> Uma linha por função: quantas pessoas, quantas horas cada. O campo de
            horas aceita <Destaque>5 x 8</Destaque> para 5 dias de 8 horas. O R$/h de cada função vem do catálogo
            cadastrado na <strong>calculadora de mão de obra</strong> — cadastrou lá, vale aqui.
          </li>
          <li>
            <strong>Relacione materiais e ferramentas.</strong> Uma linha por item: tipo (material, ferramenta,
            equipamento), descrição, quantidade, unidade e valor unitário. O custo entra na conta <strong>antes</strong> do
            markup — margem também sobre o material, não só sobre a hora.
          </li>
          <li>
            <strong>Confira imposto e margem.</strong> Vêm preenchidos com o padrão da empresa; mudar aqui vale só
            para esta proposta.
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
        <p>O custo soma as duas pernas; imposto e margem são percentuais do <strong>preço</strong>, não do custo:</p>
        <Formula nota="Ex. com os padrões (7,02% + 30% → divisor 0,6298): custo de R$ 6.298,00 vira preço de R$ 10.000,00.">
          custo   = equipe (Σ pessoas × horas × R$/h)  +  materiais (Σ quantidade × valor unitário){"\n"}
          divisor = 1 − imposto − margem{"\n"}
          preço   = custo ÷ divisor
        </Formula>
        <p>
          <strong>Por que dividir, e não multiplicar?</strong> Se a margem fosse aplicada sobre o custo, o imposto —
          que incide sobre o preço cheio — comeria parte dela. Dividindo, os percentuais saem exatamente do preço
          final: num preço de R$ 10.000 com 7,02% e 30%, o imposto leva R$ 702, o lucro R$ 3.000 e o custo é coberto
          pelos R$ 6.298 restantes.
        </p>
        <p>
          <strong>Atenção:</strong> imposto + margem chegando a <Destaque>100%</Destaque> não é preço alto — é conta
          sem solução (divisor zero ou negativo). O configurador trava e avisa em vez de inventar um número.
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
            ["R$/h por função", "catálogo", "Cadastrado na calculadora de mão de obra (admin); função sem custo é sinalizada"],
            [<span key="i">Imposto</span>, <Destaque key="iv">7,02%</Destaque>, "O percentual que a GTA tem utilizado (padrão da empresa)"],
            [<span key="m">Margem</span>, <Destaque key="mv">30%</Destaque>, "Margem padrão sobre o preço; ajuste por proposta quando o caso pedir"],
            ["Materiais", "por proposta", "Sem catálogo: cada obra leva itens e preços próprios, digitados na hora"],
          ]}
        />
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Quem não tem a permissão financeira</strong> monta equipe e materiais normalmente, mas não vê
            custo por hora, taxas nem sugestão — informa o valor final combinado. O corte é no servidor.
          </li>
          <li>
            <strong>Função sem custo cadastrado</strong> faz o preço sugerido sair por baixo — o configurador avisa.
            Cadastre o R$/h na calculadora antes de confiar na sugestão.
          </li>
          <li>Mudou imposto ou margem aqui? Vale só nesta proposta — o padrão da empresa continua o mesmo.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
