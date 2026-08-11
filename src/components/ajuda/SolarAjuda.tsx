import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Energia Solar". Explica o passo a passo, as
 * fórmulas do configurador (dimensionamento, geração, preço, economia) e os
 * valores padrão. Conteúdo estático — reflete src/services/solar.
 */
export function SolarAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O serviço Solar tem um <strong>configurador automático</strong>: você informa a cidade, o consumo e a
        cotação do kit; ele <strong>dimensiona</strong> o sistema (nº de painéis e inversor), <strong>estima a geração</strong>{" "}
        dos 12 meses, calcula a <strong>economia e o payback</strong> e <strong>sugere o preço</strong>. Todo o motor foi
        extraído da planilha oficial de Orçamento Solar da GTA — aqui está como cada número nasce.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Cidade + consumo dos 12 meses.</strong> A cidade define a irradiação solar (HSP) da base oficial; o consumo médio dimensiona o sistema.</li>
          <li><strong>Margem de segurança</strong> (opcional). Uma folga em % sobre o consumo para <strong>superdimensionar</strong> o sistema — ex.: <Destaque>10%</Destaque> dimensiona para 110% do consumo médio. Útil quando o cliente vai aumentar o consumo (ar-condicionado, carro elétrico, expansão). 0 = sem folga.</li>
          <li><strong>Tipo de ligação</strong> (mono/bi/tri). Define a energia mínima de disponibilidade que a concessionária sempre cobra.</li>
          <li><strong>Potência do painel.</strong> O app sugere o nº de painéis e o inversor comercial mais próximo — você pode ajustar.</li>
          <li><strong>Valor do kit</strong> (cotação do distribuidor). É a base do preço: o total ao cliente é <Destaque>kit × fator</Destaque>.</li>
          <li><strong>Lista de materiais editável.</strong> O app monta a relação de equipamentos do sistema (módulos, inversor, estruturas, cabos, proteções) e você pode <strong>editar, adicionar ou remover</strong> itens antes de gerar a proposta — é essa lista que vai descrita no .docx.</li>
          <li><strong>Confira a margem.</strong> O app mostra a margem líquida da GTA — mire <Destaque>≥ 30%</Destaque> (verde). Se ficar amarela/vermelha, suba o valor GTA ou renegocie o kit.</li>
          <li><strong>Tarifa de energia</strong> (opcional). Preenchendo, o app calcula a economia mensal e o payback para a proposta.</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com dimensionamento, geração, investimento e economia.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O preço ao cliente é o valor do kit multiplicado por um <strong>fator</strong>. O que sobra acima do kit é o faturamento de serviços da GTA:</p>
        <Formula nota="Ex.: kit R$ 10.000 × 1,575 = R$ 15.750 ao cliente; serviços GTA = R$ 5.750.">
          Total ao cliente = (kit + execução civil) × fator{"\n"}
          Serviços GTA     = Total − kit − execução civil
        </Formula>
        <p>
          O <strong>fator padrão é <Destaque>1,575</Destaque></strong> — a mediana dos orçamentos reais da GTA. Ele varia com o tipo de kit:
          kits premium (margem absoluta alta) usam ~1,5; kits mais baratos, até 1,8.
        </p>
        <TabelaAjuda
          colunas={["Deal real", "kit → total", "fator"]}
          linhas={[
            ["Pedro Igor (kit premium)", "18.400 → 27.600", "1,50"],
            ["Darciley / Ivan", "≈ 9–10 mil → +57,5%", "1,575"],
            ["Guilherme / Pedro Henrique", "14–15 mil → +80%", "1,80"],
          ]}
        />
        <p>
          A <strong>margem líquida</strong> mostrada é uma conferência (não vai no .docx): parte dos serviços, subtrai os custos de
          instalação e vê o que sobra. Indicador: <span className="text-green-600 dark:text-green-400">≥ 30% boa</span> ·{" "}
          <span className="text-amber-600 dark:text-amber-400">15–30% atenção</span> · <span className="text-red-600 dark:text-red-400">&lt; 15% baixa</span>.
        </p>
        <Formula>
          Custos = instalação/painel + material CA/Wp + deslocamento + ART + imposto{"\n"}
          Margem líquida = (serviços − custos − comissão) ÷ serviços
        </Formula>
      </AjudaSecao>

      {/* Dimensionamento */}
      <AjudaSecao n={3} titulo="Como o sistema é dimensionado">
        <p>A potência necessária (kWp) parte do consumo médio, descontada a disponibilidade, dividida pela irradiação e pela eficiência, com 15% de folga:</p>
        <Formula nota="HSP = irradiação diária média da cidade (base de 5.508 municípios). Disponibilidade: monofásico 30, bifásico 50, trifásico 100 kWh.">
          kWp = ((consumo médio − disponibilidade) ÷ 30 ÷ HSP ÷ eficiência) × 1,15{"\n"}
          Nº de painéis = arredonda p/ cima (kWp × 1000 ÷ potência do painel){"\n"}
          Inversor ≈ kWp ÷ (1 + overload)
        </Formula>
        <p>O <strong>overload</strong> (sobrecarga do inversor) padrão é 15% — é normal o kWp dos painéis ser maior que o inversor.</p>
        <p>
          Se você definir uma <strong>margem de segurança</strong>, o consumo de cada mês entra <strong>multiplicado</strong> por ela
          (ex.: +10% → consumo × 1,10). Esse consumo com folga alimenta <strong>todos os cálculos</strong> — dimensionamento, geração e
          economia —, resultando num sistema proporcionalmente maior.
        </p>
      </AjudaSecao>

      {/* Geração e economia */}
      <AjudaSecao n={4} titulo="Geração, economia e payback">
        <p>A geração de cada mês usa a irradiação daquele mês:</p>
        <Formula>Geração do mês (kWh) = HSP do mês × kWp × eficiência × dias do mês</Formula>
        <p>A economia compara o gasto <em>sem</em> e <em>com</em> solar. Com solar, você ainda paga a disponibilidade mínima e o <strong>Fio B</strong> sobre a energia injetada (Lei 14.300):</p>
        <Formula nota="Fio B por ano (Lei 14.300): ano 1 conforme informado, ano 2 = 90%, ano 3 em diante = 100%.">
          Gasto SEM solar = consumo × tarifa + iluminação pública{"\n"}
          Energia injetada = geração × (1 − simultaneidade){"\n"}
          Gasto COM solar  = MÁX(disponibilidade × tarifa, Fio B) + iluminação{"\n"}
          Economia = Gasto SEM − Gasto COM
        </Formula>
        <p>Ao longo dos 25 anos, a <strong>tarifa sobe 10%/ano</strong> (inflação) e a <strong>geração cai 0,5%/ano</strong> (degradação dos módulos). O <strong>payback</strong> é o primeiro ano em que a economia acumulada supera o investimento.</p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={5} titulo="Valores padrão">
        <p>Todos ajustáveis em <strong>Parâmetros da plataforma</strong> (dentro do configurador). Os padrões vêm da planilha oficial da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="f">Fator de preço</span>, <Destaque key="fv">1,575</Destaque>, "Multiplicador do kit → preço ao cliente"],
            ["Eficiência do sistema", "75%", "Perdas totais (cabos, inversor, sujeira, temperatura)"],
            ["Overload do inversor", "15%", "Sobrecarga permitida do inversor"],
            ["Instalação por painel", "R$ 120", "Mão de obra por módulo instalado"],
            ["Material CA por Wp", "R$ 0,20", "Cabos, disjuntores, string box (lado CA)"],
            ["Deslocamento", "R$ 188 × 2", "Custo por viagem × nº de viagens"],
            ["ART", "R$ 103", "Anotação de Responsabilidade Técnica"],
            ["Imposto / NF", "7,01%", "Sobre o faturamento de serviços"],
            ["Comissão", "5%", "Sobre o faturamento de serviços"],
            ["Simultaneidade", "70%", "% do que é consumido na hora (o resto é injetado)"],
            ["Fio B (ano 1)", "70%", "% do Fio B cobrado no 1º ano"],
            ["Iluminação pública", "R$ 4/mês", "Custo fixo que continua na conta"],
            ["Inflação da tarifa", "10%/ano", "Reajuste anual da energia"],
            ["Degradação dos módulos", "0,5%/ano", "Perda anual de geração"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Motor de cálculo: planilha <strong>Orçamento Solar</strong> da GTA (dimensionamento, geração, orçamento e payback).</li>
          <li>Irradiação (HSP) e tarifas: bases oficiais por município (5.508 cidades).</li>
          <li>Fator de preço 1,575: <strong>mediana de 5 orçamentos reais</strong> (Pedro Igor, Darciley, Ivan, Guilherme, Pedro Henrique).</li>
          <li>Precisa mudar algum padrão? Abra <strong>“Parâmetros da plataforma”</strong> no configurador — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
