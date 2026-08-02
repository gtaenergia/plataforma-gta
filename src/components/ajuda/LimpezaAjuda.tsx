import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Limpeza de placas solares". Explica o passo a
 * passo, a fórmula do preço por placa (escalonado por volume) e os valores
 * padrão. Conteúdo estático — reflete LIMPEZA_CONFIG em servicos-simples-configs.
 */
export function LimpezaAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        A <strong>Limpeza de placas</strong> é um serviço técnico: além de lavar os módulos, inclui{" "}
        <strong>inspeção prévia</strong>, procedimento de segurança <strong>NR-10/NR-35</strong> e{" "}
        <strong>relatório fotográfico</strong> do antes e depois. O preço é <strong>por placa</strong>, mas a taxa
        por placa <strong>cai conforme o volume</strong> (economia de escala): limpar 20 placas custa R$ 50 cada;
        numa usina de milhares, cai para ~R$ 4,50. Você informa quantas placas são e o app aplica a faixa —
        ou você fixa um valor/placa.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li><strong>Nº de placas.</strong> Informe a quantidade de módulos a limpar. É o único campo obrigatório — o app já sugere o preço a partir dele.</li>
          <li><strong>Valor por placa (opcional).</strong> Deixe <Destaque>em branco</Destaque> para o app aplicar a faixa automática por volume. Preencha só se quiser <strong>fixar</strong> a taxa (ex.: bater um preço fechado com o cliente).</li>
          <li><strong>Confira contra o piso.</strong> Se nº de placas × taxa ficar abaixo de <Destaque>R$ 900</Destaque>, o app usa o piso. Vale para instalações pequenas.</li>
          <li><strong>Acesso especial?</strong> Plataformas, andaimes ou telhados de difícil acesso são orçados à parte — some ao valor manualmente se for o caso.</li>
          <li><strong>Gere o .docx.</strong> Sai a proposta padrão GTA: limpeza técnica com inspeção prévia, segurança NR-10/NR-35 e relatório fotográfico.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O preço é o número de placas vezes a <strong>taxa da faixa</strong>, nunca abaixo do piso mínimo:</p>
        <Formula nota="Ex.: 100 placas × R$ 25 = R$ 2.500 · usina 2.900 × R$ 4,50 ≈ R$ 13.050 · 10 placas × R$ 50 = R$ 500 → cai no piso de R$ 900.">
          taxa  = valor por placa (se informado)  ou  faixa automática por volume{"\n"}
          Preço = MÁX(nº de placas × taxa, R$ 900)
        </Formula>
        <p>
          O <strong>piso mínimo é <Destaque>R$ 900</Destaque></strong> — cobre o custo fixo de uma visita (deslocamento,
          equipe e EPI). Na faixa de R$ 50/placa, o piso equivale a <strong>18 placas</strong> (18 × 50 = 900): abaixo
          disso, o preço trava em R$ 900. Assim uma limpeza de 10 placas não sai por R$ 500, e sim por R$ 900.
        </p>
        <p>
          O <strong>valor por placa é um override</strong>: em branco, o app usa a faixa automática; preenchido, ele
          <strong> fixa a taxa</strong> e ignora as faixas. Útil para reproduzir um preço já negociado — por exemplo,
          fixar <Destaque>R$ 4,10</Destaque> para bater os R$ 11.890 da usina da UniEvangélica (2.900 × 4,10 = 11.890).
        </p>
      </AjudaSecao>

      {/* Faixas por volume */}
      <AjudaSecao n={3} titulo="Faixas por volume (economia de escala)">
        <p>Quanto mais placas, menor o R$/placa. O app escolhe a faixa automaticamente pelo total informado:</p>
        <TabelaAjuda
          colunas={["Nº de placas", "R$/placa"]}
          linhas={[
            ["≤ 30 placas", <Destaque key="a">R$ 50,00</Destaque>],
            ["31 – 150", "R$ 25,00"],
            ["151 – 500", "R$ 12,00"],
            ["501 – 1.500", "R$ 7,00"],
            ["usina 1.500+", <Destaque key="e">R$ 4,50</Destaque>],
          ]}
        />
        <p>
          O <strong>valor/placa é editável</strong>: preencha o campo do configurador para sobrepor a faixa quando o
          serviço fugir do padrão. Em <strong>grandes usinas</strong>, a limpeza pode ser feita com <strong>robô autônomo</strong>,
          sem interromper a geração — foi assim na UniEvangélica (2.900 placas a R$ 4,10 cada). Já em telhados residenciais,
          o acesso especial (plataformas/andaimes) é orçado à parte.
        </p>
      </AjudaSecao>

      {/* Valores padrão / de onde vêm */}
      <AjudaSecao titulo="Valores padrão e de onde vêm os números">
        <p>Todos ajustáveis no configurador. Os padrões vêm de orçamentos reais da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            ["Faixas por volume", "R$ 50 → R$ 4,50", "Taxa por placa que cai com o volume (ver seção 3)"],
            [<span key="p">Piso mínimo</span>, <Destaque key="pv">R$ 900</Destaque>, "Valor mínimo da visita (deslocamento + equipe + EPI)"],
            ["Valor por placa", "em branco", "Override: vazio = faixa automática; preenchido = fixa a taxa"],
          ]}
        />
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            <strong>Âncora real:</strong> usina da UniEvangélica — <strong>2.900 placas = R$ 11.890</strong> (R$ 4,10/placa,
            limpeza robótica). Na faixa automática, 2.900 placas dão 2.900 × R$ 4,50 = R$ 13.050; para bater o real,
            basta fixar R$ 4,10 no override.
          </li>
          <li>
            <strong>Por que escalonar?</strong> Antes o preço era flat de R$ 25/placa — irreal em escala: para 2.900
            placas daria <strong>R$ 72.500</strong>, mais de 6× o valor real (R$ 11.890). As faixas por volume corrigem isso.
          </li>
          <li>
            <strong>Âncoras das faixas:</strong> ~R$ 50 (poucas placas) · ~R$ 25 (≈100) · R$ 4,10 (usina de grande porte);
            as faixas intermediárias (R$ 12 e R$ 7) são interpoladas entre esses pontos.
          </li>
          <li>Precisa mudar um padrão? Ajuste o valor/placa ou o piso no configurador antes de gerar a proposta.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
