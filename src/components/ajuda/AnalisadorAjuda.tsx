import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Analisador de Energia". Explica o passo a passo,
 * a fórmula do preço (semanas × R$ 1.500), quando o escopo manda em vez da
 * semana e os valores padrão. Conteúdo estático — reflete ANALISADOR_CONFIG em
 * src/components/servicos-simples-configs.ts.
 */
export function AnalisadorAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O <strong>Analisador de Energia</strong> é um serviço de <strong>locação com medição</strong>: a GTA instala um
        analisador de qualidade de energia no ponto do cliente, <strong>parametriza</strong> o equipamento,{" "}
        <strong>registra as grandezas elétricas</strong> durante um período e entrega um <strong>relatório técnico</strong>.
        É como se diagnostica a rede — tensão fora de faixa, harmônicos, desequilíbrio, fator de potência baixo — seguindo o{" "}
        <strong>PRODIST Módulo 8 da ANEEL</strong>. O preço é tabelado: <Destaque>R$ 1.500,00 por semana</Destaque> de locação.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Defina as semanas de medição.</strong> Uma semana (7 dias) é a locação básica — o suficiente para um diagnóstico de rotina.</li>
          <li><strong>O app calcula.</strong> Ele multiplica <Destaque>semanas × R$ 1.500</Destaque> e mostra a conta pronta (ex.: “2 semana(s) × R$ 1.500 = R$ 3.000”).</li>
          <li><strong>Análise completa? Ajuste o valor.</strong> Para comparação com a concessionária (ciclo de 30 dias) ou laudo <strong>PRODIST Módulo 8</strong>, o preço é <Destaque>por escopo</Destaque> (~R$ 5.000), não estritamente por semana — edite o “Valor por semana” à mão.</li>
          <li><strong>Confira condição e prazo.</strong> Pagamento em <Destaque>50% + 50%</Destaque>; prazo = período de medição + emissão do relatório. Instalação e retirada já entram.</li>
          <li><strong>Gere o .docx.</strong> Sai a proposta no padrão GTA, com objeto, período de medição, relatório e condições.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O preço é o valor da semana multiplicado pelo número de semanas de locação — simples e tabelado:</p>
        <Formula nota="Ex.: 2 semanas × R$ 1.500 = R$ 3.000 — pago R$ 1.500 na contratação e R$ 1.500 na entrega do relatório.">
          Preço = nº de semanas × R$ 1.500
        </Formula>
        <p>
          O valor tabelado é <Destaque>R$ 1.500/semana</Destaque> (7 dias de medição). O pagamento é sempre{" "}
          <Destaque>50% na contratação + 50% na entrega do relatório</Destaque>, com <strong>instalação e retirada inclusas</strong>.
        </p>
        <TabelaAjuda
          colunas={["Semanas", "Conta", "Preço"]}
          linhas={[
            ["1 (básica, 7 dias)", "1 × R$ 1.500", "R$ 1.500"],
            ["2", "2 × R$ 1.500", "R$ 3.000"],
            ["4 (~1 mês)", "4 × R$ 1.500", "R$ 6.000"],
          ]}
        />
      </AjudaSecao>

      {/* Escopo x semana */}
      <AjudaSecao n={3} titulo="Quando NÃO é só por semana">
        <p>
          Atenção: <Destaque>R$ 1.500/semana é o PISO</Destaque>. Ele vale para uma <strong>medição básica de 7 dias</strong> —
          um diagnóstico pontual (ex.: <em>Faculdade Católica</em>, 7 dias = R$ 1.500). Quando o cliente quer uma análise
          completa, o que manda é o <strong>escopo</strong>, não o calendário:
        </p>
        <TabelaAjuda
          colunas={["Tipo de análise", "Período", "Valor real"]}
          linhas={[
            ["Diagnóstico básico (Faculdade Católica)", "7 dias", "R$ 1.500"],
            ["Comparação com a concessionária (Rafael)", "30 dias", "R$ 5.000"],
            [<span key="p">Laudo PRODIST Mód. 8 (Nossa Senhora D&apos;Abadia)</span>, "por escopo", "R$ 5.000"],
          ]}
        />
        <p>
          Uma <strong>comparação com a concessionária</strong> (fechar um ciclo de faturamento de 30 dias) ou um{" "}
          <strong>laudo PRODIST Módulo 8 completo</strong> ficam em torno de <Destaque>R$ 5.000, precificados por escopo</Destaque>.
          Nesses casos, <strong>ajuste o “Valor por semana” à mão</strong>: informe o nº de semanas real e suba o valor até o total
          bater, ou registre <strong>1 “semana” com o valor cheio do escopo</strong> — o campo é livre.
        </p>
      </AjudaSecao>

      {/* O que mede */}
      <AjudaSecao titulo="O que o analisador mede">
        <p>Durante a locação, o equipamento registra as grandezas de qualidade de energia do <strong>PRODIST Módulo 8</strong>:</p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li><strong>Tensão em regime permanente</strong> — se está adequada, precária ou crítica.</li>
          <li><strong>Harmônicos</strong> — distorção da forma de onda (cargas não lineares).</li>
          <li><strong>Desequilíbrio de tensão</strong> — diferença entre as fases.</li>
          <li><strong>VTCDs</strong> — variações de tensão de curta duração (afundamentos e elevações).</li>
          <li><strong>Flicker</strong> — flutuação/cintilação da tensão.</li>
          <li><strong>Fator de potência</strong> — eficiência do uso da energia (evita multa da concessionária).</li>
        </ul>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao titulo="Valores padrão / de onde vêm">
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="v">Valor por semana</span>, <Destaque key="vv">R$ 1.500</Destaque>, "Tabela para diagnóstico básico (7 dias de medição)"],
            ["Condição de pagamento", "50% + 50%", "50% na contratação e 50% na entrega do relatório"],
            ["Análise completa", <span key="a">~R$ 5.000 <span className="text-slate-500 dark:text-slate-400">por escopo</span></span>, "Comparação com a concessionária (30 d) ou laudo PRODIST Mód. 8"],
            ["Instalação / retirada", "Inclusas", "Não são cobradas à parte"],
            ["Prazo", "Medição + relatório", "Período de medição mais a emissão do relatório técnico"],
          ]}
        />
        <ul className="ml-1 mt-1 list-inside list-disc space-y-1.5">
          <li>Âncoras reais do piso: <strong>Faculdade Católica</strong> — R$ 1.500 (7 dias).</li>
          <li>Âncoras reais de análise completa: <strong>Rafael</strong> (30 dias) e <strong>Nossa Senhora D&apos;Abadia</strong> (PRODIST) — ambos R$ 5.000.</li>
          <li>O <strong>“Valor por semana” é editável</strong>: use o piso de R$ 1.500 para diagnósticos e suba conforme o escopo.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
