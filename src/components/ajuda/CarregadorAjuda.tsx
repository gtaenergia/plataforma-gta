import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Carregador Veicular (EV)". Explica o passo a
 * passo, o dimensionamento por norma (NBR 5410 / NBR 17019), a lista de
 * materiais editável e a precificação pelo Fator K. Conteúdo estático —
 * reflete src/services/carregador (engine.ts + params.ts).
 */
export function CarregadorAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O serviço Carregador Veicular tem um <strong>configurador automático</strong>: você informa a potência do
        carregador, a alimentação (mono/tri) e a distância até o quadro; ele <strong>dimensiona</strong> a instalação
        pela NBR 5410 / NBR 17019 (disjuntor, cabo, DR, DPS, aterramento), monta uma <strong>lista de materiais editável</strong>,
        aplica o <strong>Fator K</strong> sobre o custo e mostra o <strong>faturamento e a margem</strong>. O motor foi
        extraído da planilha real de custos da GTA (“Avenida Parque”, versão revisada) — aqui está como cada número nasce.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li><strong>Potência + alimentação.</strong> Informe a potência do carregador (kW) e se é monofásico (220 V) ou trifásico (380 V). Há atalhos de 3,7 / 7,4 kW mono e 11 / 22 kW tri. <em>O carregador em si é do cliente</em> — aqui você orça a infraestrutura.</li>
          <li><strong>Distância e nº de pontos.</strong> A distância do quadro até a vaga define o comprimento e a <Destaque>queda de tensão</Destaque> do cabo; o nº de pontos multiplica materiais e mão de obra.</li>
          <li><strong>Proteção diferencial (NBR 17019).</strong> Diga se o carregador tem detecção de 6 mA CC integrada (a maioria dos WallBox tem → DR Tipo A) ou não (→ DR Tipo B obrigatório).</li>
          <li><strong>O app dimensiona e sugere a lista.</strong> Ele calcula disjuntor, seção do cabo, eletroduto, DR e DPS e já preenche a lista de materiais com preços-base.</li>
          <li><strong>Edite preços e quantidades.</strong> Os preços de mercado mudam — ajuste linha a linha, adicione/remova itens ou clique em <Destaque>Restaurar sugestão</Destaque>. O custo recalcula ao vivo.</li>
          <li><strong>Confira o Fator K e a margem.</strong> O faturamento sugerido = custo × Fator K (1,65). Veja a margem líquida no painel “Composição do faturamento” — mire <Destaque>≥ 30%</Destaque>.</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com dimensionamento, lista de materiais, valor do serviço e do equipamento.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>
          O preço parte do <strong>custo</strong> (materiais da lista + mão de obra) e recebe um <strong>markup</strong>, o
          Fator K. O que sobra acima do custo, tirando impostos, é o lucro:
        </p>
        <Formula nota="Ex.: materiais R$ 2.000 + mão de obra R$ 800 = custo R$ 2.800. × 1,65 = R$ 4.620 (faturamento). Impostos 7,01% = R$ 323,86. Lucro = 4.620 − 323,86 − 2.800 = R$ 1.496,14. Margem líquida = 1.496,14 ÷ 4.620 = 32,4%.">
          custo geral  = materiais + (R$ 800 × nº de pontos){"\n"}
          faturamento  = custo geral × Fator K        (arredonda p/ R$ 10){"\n"}
          impostos     = faturamento × 7,01%{"\n"}
          lucro        = faturamento − impostos − custo geral{"\n"}
          margem líq.  = lucro ÷ faturamento
        </Formula>
        <p>
          O <strong>Fator K padrão é <Destaque>1,65</Destaque></strong> e os <strong>impostos são <Destaque>7,01%</Destaque></strong> ({" "}
          5% + 2,01% sobre a nota). Esses dois vêm da planilha revisada da GTA.
        </p>
        <p>
          <strong>Ponto-chave:</strong> o <strong>Fator K é a ENTRADA</strong> (você escolhe; o padrão é 1,65). A{" "}
          <strong>margem líquida é a SAÍDA</strong> — ela é <em>consequência</em> do K e dos impostos, não uma meta que se
          digita. De fato, ela quase não depende do valor do orçamento:
        </p>
        <Formula nota="Com K = 1,65 e imposto 7,01%: margem ≈ 1 − 0,0701 − 1/1,65 = 32,4%. Quer mirar 35%? Suba o K para ~1,73. Nunca mexa na margem diretamente — mexa no K.">
          margem líquida ≈ 1 − imposto − (1 ÷ Fator K)
        </Formula>
        <p>
          Por isso, no padrão (K 1,65), a margem sempre cai perto de <Destaque>32%</Destaque>. Indicador:{" "}
          <span className="text-green-600 dark:text-green-400">≥ 30% saudável</span> ·{" "}
          <span className="text-amber-600 dark:text-amber-400">20–30% atenção</span> ·{" "}
          <span className="text-red-600 dark:text-red-400">&lt; 20% revise o K ou os preços</span>. Se a margem despencar, foi
          porque você editou os materiais para baixo ou o cliente não paga o sugerido — aí suba o Fator K.
        </p>
        <p>Referências reais de mercado para conferir o valor por ponto:</p>
        <TabelaAjuda
          colunas={["Referência", "R$ por ponto", "Contexto"]}
          linhas={[
            ["Terrazo JK", "R$ 3.904", "infraestrutura 7 kW / vaga"],
            ["Terrazo JK", "R$ 5.634", "infraestrutura 22 kW / vaga"],
            [<span key="e">Engine GTA (padrão)</span>, <Destaque key="ev">≈ R$ 4.100</Destaque>, "7 kW mono, 1 ponto"],
          ]}
        />
        <p className="hint">
          O carregador (equipamento) entra à parte, no campo “Equipamento / carregador” (0 = fornecido pelo cliente).
          Obra civil pesada, deslocamento longo e projeto/ART podem virar linha separada conforme o caso.
        </p>
      </AjudaSecao>

      {/* Dimensionamento */}
      <AjudaSecao n={3} titulo="Como o sistema é dimensionado">
        <p>
          O dimensionamento segue a <strong>ABNT NBR 5410</strong>. A corrente nominal vem da potência; a corrente de projeto
          usa <Destaque>× 1,25</Destaque> (carga contínua — o carregador fica horas ligado); o disjuntor é o primeiro valor
          comercial acima da corrente; e a seção do cabo respeita <strong>ampacidade</strong> e <strong>queda de tensão</strong>:
        </p>
        <Formula nota={'Tensão: 220 V (mono) / 380 V (tri, ÷ √3). Ex. 7,4 kW mono, 20 m: In = 7400/220 = 33,6 A · Ib = 33,6 × 1,25 = 42,0 A · disjuntor 50 A (2P) · cabo 10 mm² (queda ≈ 1,1%) · eletroduto 1".'}>
          In (corrente nominal)   = Potência ÷ tensão        (÷ √3 no trifásico){"\n"}
          Ib (corrente de projeto) = In × 1,25               (carga contínua){"\n"}
          Disjuntor  = 1º comercial ≥ Ib    (16, 20, 25, 32, 40, 50, 63 A…){"\n"}
          Seção do cabo: ampacidade ≥ disjuntor  E  queda de tensão ≤ 4%{"\n"}
          Eletroduto: taxa de ocupação dos cabos ≤ 40%
        </Formula>
        <p className="hint">
          A coordenação é a da NBR 5410: Ib ≤ In do disjuntor ≤ Iz do cabo. O disjuntor cobre a corrente de{" "}
          <em>projeto</em> (já com o 1,25), e o cabo suporta o que o disjuntor deixa passar — não a corrente da carga.
        </p>
        <p>
          A alimentação muda a topologia: <strong>monofásico</strong> → 2 polos, 3 condutores (F+N+T) e 2 DPS;{" "}
          <strong>trifásico</strong> → 4 polos, 5 condutores (3F+N+T) e 4 DPS.
        </p>
        <p>
          A <strong>proteção diferencial</strong> segue a <strong>NBR 17019</strong>, específica para recarga de veículos.
          A regra de ouro: <Destaque>nunca DR Tipo AC</Destaque>. Como o carregador injeta componente de corrente contínua,
          o Tipo AC “cega” e não desarma. Há dois caminhos válidos:
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li><strong>DR Tipo A</strong> — quando o carregador já tem detecção de 6 mA CC integrada (RDC-DD). É o caso da maioria dos WallBox (WEG, Intelbras, Wallbox).</li>
          <li><strong>DR Tipo B</strong> — obrigatório quando o carregador <em>não</em> tem essa detecção. É um dispositivo especial e custa da ordem de <Destaque>3,5×</Destaque> o Tipo A equivalente.</li>
        </ul>
        <p>
          Completam a proteção o <strong>DPS Classe II</strong> (275 V / 40 kA) e um <strong>aterramento dedicado</strong>{" "}
          (haste cobreada 5/8″ × 2,40 m + caixa de inspeção + conector).
        </p>
        <p>
          <strong>Duas premissas técnicas que a engenharia deve conhecer (e validar no projeto executivo):</strong>
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>
            A tabela de <strong>ampacidade é aproximada</strong>: uma coluna única (EPR, método B1) serve mono e
            trifásico, mas na Tabela 39 da NBR 5410 os dois casos têm colunas próprias, e o valor exato depende do
            método de instalação real da obra. Em obras trifásicas de maior potência, confira a seção contra a coluna
            de 3 condutores carregados antes de executar.
          </li>
          <li>
            O configurador cobre recarga em <strong>corrente alternada até ~41,5 kW</strong> — o teto do modo 3 da
            IEC 61851 (63 A por fase) em 380 V. Acima disso o equipamento é carregador CC, com retificador próprio e
            requisitos de conexão distintos; o app avisa e não deve ser usado para esse orçamento.
          </li>
        </ul>
      </AjudaSecao>

      {/* Lista de materiais */}
      <AjudaSecao n={4} titulo="Lista de materiais editável">
        <p>
          A partir do dimensionamento, o app monta uma <strong>lista de materiais</strong> (BOM) com quantidades e preços-base.
          Ela é apenas a <Destaque>sugestão inicial</Destaque>: os preços de mercado (cabo, disjuntor, DR…) mudam com frequência,
          então <strong>tudo é editável</strong>.
        </p>
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Edite <strong>descrição, quantidade e preço unitário</strong> de cada linha; <strong>adicione</strong> ou <strong>remova</strong> itens.</li>
          <li><strong>“Restaurar sugestão”</strong> devolve a lista original do dimensionamento a qualquer momento.</li>
          <li>O <strong>custo total recalcula ao vivo</strong> e realimenta o faturamento (custo × Fator K) e a margem.</li>
          <li>Mudar a configuração (potência, fase, distância) <strong>re-semeia</strong> a lista com uma nova sugestão.</li>
        </ul>
        <p>O que a lista traz, por categoria:</p>
        <TabelaAjuda
          colunas={["Categoria", "Itens", "Depende de"]}
          linhas={[
            ["Infraestrutura", "eletroduto, luva, curva, abraçadeira, bucha/arruela", "distância + eletroduto"],
            ["Cabeamento", "cabo flexível HEPR (F+N+T ou 3F+N+T)", "seção + distância"],
            ["Proteção", "quadro IP65, disjuntor, DR (A/B), DPS", "corrente + fase"],
            ["Aterramento", "haste cobreada, caixa de inspeção, conector", "nº de pontos"],
            ["Acessórios", "terminais tubulares, fita isolante, autofusão", "nº de pontos"],
          ]}
        />
        <p className="hint">
          O carregador (equipamento) não entra na lista — é do cliente. A lista é custo interno; no .docx vai a descrição dos
          materiais, sem os preços de custo.
        </p>
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={5} titulo="Valores padrão">
        <p>Ajustáveis em <strong>“Parâmetros de preço”</strong> (dentro do configurador). Os padrões vêm da planilha revisada da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="k">Fator K</span>, <Destaque key="kv">1,65</Destaque>, "Markup: multiplica o custo geral p/ dar o faturamento (entrada)"],
            ["Mão de obra por ponto", "R$ 800", "Instalação e despesas por ponto de recarga"],
            ["Impostos / NF", "7,01%", "5% + 2,01% sobre o faturamento"],
            [<span key="m">Margem líquida</span>, <Destaque key="mv">≈ 32%</Destaque>, "Resultado (saída) — sai do Fator K e dos impostos, não se digita"],
            ["Preços-base dos materiais", "editáveis", "Cabo, disjuntor, DR, DPS, quadro… sugestão inicial ajustável na lista"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Motor de preço: planilha real <strong>“Levantamento de Custos — Avenida Parque”</strong> (versão revisada) — o <strong>Fator K 1,65</strong> foi validado célula a célula, chegando a margem ≈ 30%.</li>
          <li>Preços-base dos materiais: <strong>calibrados por cotações reais de 2025</strong> (Megaluz / KG / Schneider). São só a sugestão inicial — edite na lista.</li>
          <li>Âncoras de mercado: <strong>Terrazo JK</strong> R$ 3.904/vaga (7 kW) e R$ 5.634/vaga (22 kW); o engine dá ~R$ 4.100 por ponto.</li>
          <li>Dimensionamento: <strong>ABNT NBR 5410</strong> (proteção e condutor) e <strong>NBR 17019</strong> (DR para recarga de veículos).</li>
          <li>Precisa mudar o <strong>Fator K</strong> ou a <strong>mão de obra</strong>? Abra <strong>“Parâmetros de preço”</strong> no configurador — vale para as próximas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
