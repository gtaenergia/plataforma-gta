import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Conexão junto à concessionária". Serviço de
 * assessoria com preço tabelado: 2 salários mínimos vigentes. Conteúdo estático
 * — reflete CONEXAO_CONFIG em src/components/servicos-simples-configs.ts.
 */
export function ConexaoAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O <strong>Orçamento de Conexão</strong> é um serviço de assessoria para conectar uma carga junto à
        concessionária de energia: <strong>análise de viabilidade</strong>, <strong>liberação de carga</strong>,{" "}
        <strong>consultoria</strong> e <strong>acompanhamento interno</strong> até a efetiva conexão. Diferente do Solar,
        aqui <strong>não há configurador de engenharia</strong> — o preço é uma <strong>regra fixa de gestão</strong>:
        sempre <Destaque>2 (dois) salários mínimos vigentes</Destaque>. Você só confere o salário mínimo e o app faz a conta.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li>
            <strong>Confira o salário mínimo vigente.</strong> É o único campo do configurador. O padrão é{" "}
            <Destaque>R$ 1.630</Destaque>; atualize sempre que o governo reajustar o salário mínimo.
          </li>
          <li>
            <strong>O app calcula 2×.</strong> O preço ao cliente é automaticamente <Destaque>2 × salário mínimo</Destaque>.
            Não há margem, fator ou custo a ajustar — o valor é tabelado.
          </li>
          <li>
            <strong>Gere o .docx.</strong> A proposta sai no padrão GTA, já com o objeto (viabilidade, liberação de carga,
            consultoria e acompanhamento), a condição de pagamento <Destaque>50% + 50%</Destaque> e a ressalva de que taxas
            e emolumentos da concessionária ficam por conta do cliente.
          </li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>
          O preço é <strong>tabelado</strong> em <Destaque>2 salários mínimos</Destaque> vigentes. Uma única multiplicação
          define o valor da proposta:
        </p>
        <Formula nota="Ex.: 2 × R$ 1.630 = R$ 3.260 ao cliente. Se o salário mínimo mudar para R$ 1.700, o orçamento passa a 2 × 1.700 = R$ 3.400.">
          Preço ao cliente = 2 × salário mínimo vigente
        </Formula>
        <p>
          Essa é uma <strong>regra fixa de gestão</strong> — é o valor de referência da GTA para esse tipo de assessoria e{" "}
          <strong>não é negociável caso a caso</strong>. Por isso não existe campo de margem, fator ou desconto: mudou o
          salário mínimo, muda o preço; mais nada.
        </p>
        <p>
          A <strong>condição de pagamento</strong> é <Destaque>50% na contratação e 50% após a efetiva conexão</Destaque>.
          No exemplo de R$ 3.260, isso são R$ 1.630 na assinatura e R$ 1.630 quando a carga é ligada pela concessionária —
          o que alinha o recebimento ao marco que encerra o serviço.
        </p>
        <TabelaAjuda
          colunas={["Salário mínimo", "Cálculo", "Preço ao cliente"]}
          linhas={[
            [<Destaque key="a">R$ 1.630 (padrão)</Destaque>, "2 × 1.630", "R$ 3.260,00"],
            ["R$ 1.700", "2 × 1.700", "R$ 3.400,00"],
            ["R$ 1.800", "2 × 1.800", "R$ 3.600,00"],
          ]}
        />
      </AjudaSecao>

      {/* Incluso / à parte */}
      <AjudaSecao n={3} titulo="O que está incluso e o que fica à parte">
        <p>Os 2 salários mínimos cobrem toda a assessoria interna da GTA até a conexão:</p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li><strong>Análise de viabilidade</strong> da conexão junto à concessionária;</li>
          <li><strong>Liberação de carga</strong> (pedido e trâmite da carga solicitada);</li>
          <li><strong>Consultoria</strong> técnica durante o processo;</li>
          <li><strong>Acompanhamento interno</strong> até a <strong>efetiva conexão</strong> da unidade.</li>
        </ul>
        <p>
          Fica <strong>à parte, por conta do cliente</strong>:
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Taxas e emolumentos da concessionária</strong> — cobranças da própria distribuidora não entram no valor
            da proposta e são pagas diretamente pelo cliente.
          </li>
        </ul>
        <p className="hint">
          O prazo padrão é “conforme os trâmites da concessionária” — depende da distribuidora, não da GTA.
        </p>
      </AjudaSecao>

      {/* Valores padrão / de onde vem */}
      <AjudaSecao titulo="Valores padrão / de onde vem">
        <p>
          O único parâmetro editável é o salário mínimo. A regra dos 2 salários é <strong>fixa de gestão</strong> — não há
          o que configurar além disso:
        </p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [
              "Regra de preço",
              <Destaque key="r">2 salários mínimos</Destaque>,
              "Regra fixa de gestão da GTA (inegociável). Preço = 2 × salário mínimo.",
            ],
            [
              "Salário mínimo vigente",
              <span key="s">R$ 1.630 <span className="text-slate-500 dark:text-slate-400">(editável)</span></span>,
              "Base do cálculo. Atualize a cada reajuste do salário mínimo.",
            ],
            [
              "Condição de pagamento",
              "50% + 50%",
              "50% na contratação e 50% após a efetiva conexão.",
            ],
            [
              "Taxas da concessionária",
              "Por conta do cliente",
              "Emolumentos da distribuidora não entram no valor.",
            ],
          ]}
        />
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
