import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Projeto de Subestação". Explica o passo a passo,
 * o dimensionamento automático pela NT.002 da Equatorial (transformador, poste,
 * banco de capacitores e proteção) e o preço por horas de engenharia.
 * Conteúdo estático — reflete src/services/subestacao (sizing.ts + params.ts).
 */
export function SubestacaoAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        Este serviço é o <strong>PROJETO</strong> da subestação — memorial, dimensionamento, diagramas e a{" "}
        <strong>ART</strong> —, <strong>não a obra</strong>. Você informa a carga (ou a demanda) e o tipo; o app{" "}
        <strong>dimensiona automaticamente</strong> o transformador e todos os componentes segundo a{" "}
        <Destaque>NT.002 da Equatorial</Destaque> e <strong>sugere o preço</strong> por horas de engenharia. A
        construção física (postes, trafo, aterramento, cubículo) é o serviço separado <em>Execução de Subestação</em>.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2">
          <li><strong>Demanda ou carga.</strong> Informe a <strong>demanda (kVA)</strong> direto, ou a <strong>carga instalada (kW)</strong> com o fator de demanda e o fator de potência — o app converte em kVA.</li>
          <li><strong>Tensões da concessionária.</strong> Média tensão (kV, ex. 13,8) e baixa tensão (V, ex. 380). Definem as correntes e a proteção.</li>
          <li><strong>Tipo da subestação.</strong> <Destaque>Aérea</Destaque> (até 300 kVA), <Destaque>Abrigada</Destaque> (cubículo, demanda acima de 330 kVA) ou <Destaque>Pedestal</Destaque>.</li>
          <li><strong>O app dimensiona tudo.</strong> Transformador pela faixa de demanda (NT.002), mais poste, banco de capacitores, elo fusível, disjuntor de BT e condutor de MT.</li>
          <li><strong>O app calcula as horas e o preço.</strong> Preço por horas de engenharia, arredondado a R$ 50.</li>
          <li><strong>Confira.</strong> Se necessário, ajuste os padrões em <strong>Parâmetros</strong> (valor/hora, horas-base, ART, margem).</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com dimensionamento e valor do projeto.</li>
        </ol>
      </AjudaSecao>

      {/* Dimensionamento */}
      <AjudaSecao n={2} titulo="Como o sistema é dimensionado (NT.002 Equatorial)">
        <p>
          O transformador é escolhido pela <strong>faixa de demanda</strong> (Tabela C da NT), <em>não</em> pelo
          "menor padrão maior ou igual à demanda" — a norma admite uma <strong>leve sobrecarga</strong>. Antes, se
          você entra pela carga, o app calcula a demanda:
        </p>
        <Formula nota="Fator de potência padrão 0,92. Ex.: 220 kW × 1,0 ÷ 0,92 = 239 kVA → transformador 225 kVA.">
          Modo demanda:  demanda = kVA informado{"\n"}
          Modo carga:    demanda = carga (kW) × fator de demanda ÷ fator de potência
        </Formula>
        <p>Com a demanda em mãos, a seleção do transformador segue a tabela oficial:</p>
        <TabelaAjuda
          colunas={["Demanda (kVA)", "Transformador"]}
          linhas={[
            ["abaixo de 60", "Baixa tensão — sem subestação"],
            ["60 a 82,9", "75 kVA"],
            ["83 a 124,9", "112,5 kVA"],
            ["125 a 165,9", "150 kVA"],
            ["166 a 248,9", "225 kVA"],
            ["249 a 330", "300 kVA (máximo em aérea)"],
            ["acima de 330", "Abrigada — 500, 750, 1000… kVA"],
          ]}
        />
        <p>
          Abaixo de <strong>60 kVA</strong> não há subestação (atendimento em BT). Acima de <strong>330 kVA</strong> a
          NT exige subestação <strong>abrigada</strong> e o app avisa para trocar o tipo. Veja um dimensionamento
          completo (o mesmo validado na planilha oficial):
        </p>
        <Formula nota="Corrente = kVA ÷ (√3 × tensão). O elo protege 1,5× a corrente de MT; o disjuntor é o padrão ≥ corrente de BT. Aproveitamento 238÷225 = 106% (a sobrecarga admitida pela NT).">
          Demanda 238 kVA · MT 13,8 kV · BT 380 V · aérea{"\n"}
          {" "}→ Transformador   225 kVA   (aproveitamento 106%){"\n"}
          {" "}→ Poste           800 daN / 11 m{"\n"}
          {" "}→ Banco de cap.   7,5 kVAr{"\n"}
          {" "}→ Corrente MT     9,4 A   → elo 15K{"\n"}
          {" "}→ Corrente BT     342 A   → disjuntor 400 A{"\n"}
          {" "}→ Condutor MT     25 mm² XLPE 15/25 kV
        </Formula>
        <p>
          O <strong>poste</strong> (Tabela D) e o <strong>banco de capacitores</strong> mínimo (Tabela F) também saem
          por tabela, em função do transformador:
        </p>
        <TabelaAjuda
          colunas={["Transformador", "Poste (Tabela D)", "Banco cap. (Tabela F)"]}
          linhas={[
            ["75 kVA", "300 daN / 11 m", "4 kVAr"],
            ["112,5 kVA", "600 daN / 11 m", "5 kVAr"],
            ["150 kVA", "600 daN / 11 m", "6 kVAr"],
            ["225 kVA", "800 daN / 11 m", "7,5 kVAr"],
            ["300 kVA", "1000 daN / 11 m", "8 kVAr"],
          ]}
        />
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={3} titulo="Como o preço é calculado">
        <p>
          O preço é por <strong>horas de engenharia</strong> (modelo por custo): parte-se de uma quantidade de horas
          (base do tipo + um incremento por porte), multiplica-se pelo valor da hora, soma-se a ART e aplica-se a
          margem. O resultado é arredondado a R$ 50:
        </p>
        <Formula nota="Ex.: SE aérea, trafo 150 kVA. Horas = 20 + 2 × 1,5 = 23. Custo = 23 × 150 + 500 = R$ 3.950. Preço = 3.950 × 1,5 = R$ 5.925 → R$ 5.950 (arredondado a R$ 50).">
          horas = base(tipo) + 2 × (kVA do trafo ÷ 100){"\n"}
          custo = horas × valor/hora + ART{"\n"}
          preço = custo × (1 + margem)     → arredonda a R$ 50
        </Formula>
        <p>
          Três parâmetros mandam no preço: valor da hora <Destaque>R$ 150</Destaque>, ART <Destaque>R$ 500</Destaque> e
          margem <Destaque>50%</Destaque>. Repare que as horas usam o <strong>kVA do transformador dimensionado</strong>
          {" "}(não a demanda bruta).
        </p>
        <p>
          A sensibilidade ao kVA é <strong>fraca de propósito</strong> (só 2 h por 100 kVA): quem manda no preço é o{" "}
          <strong>tipo/porte</strong>. Uma aérea varia pouco entre 75 e 300 kVA; trocar para pedestal ou abrigada é o
          que muda o patamar:
        </p>
        <TabelaAjuda
          colunas={["Tipo · trafo", "Horas", "Preço GTA"]}
          linhas={[
            ["Aérea · 75 kVA", "21,5 h", "R$ 5.600"],
            ["Aérea · 150 kVA", "23 h", "R$ 5.950"],
            ["Aérea · 300 kVA", "26 h", "R$ 6.600"],
            ["Pedestal · 300 kVA", "40 h", "R$ 9.750"],
            ["Abrigada · 500 kVA", "60 h", "R$ 14.250"],
            ["Abrigada · 750 kVA", "65 h", "R$ 15.400"],
          ]}
        />
      </AjudaSecao>

      {/* Valores padrão */}
      <AjudaSecao n={4} titulo="Valores padrão">
        <p>Todos ajustáveis em <strong>Parâmetros</strong> — os padrões foram calibrados pelos orçamentos reais da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="vh">Valor da hora</span>, <Destaque key="vhv">R$ 150</Destaque>, "Hora de engenharia (projeto)"],
            ["ART / TRT", "R$ 500", "Taxas fixas (ART + emissão)"],
            [<span key="m">Margem do projeto</span>, <Destaque key="mv">50%</Destaque>, "Margem aplicada sobre o custo"],
            ["Horas-base aérea", "20 h", "Projeto de subestação aérea"],
            ["Horas-base abrigada", "50 h", "Projeto de subestação abrigada/cubículo"],
            ["Horas-base pedestal", "34 h", "Projeto de subestação pedestal"],
            ["Horas por 100 kVA", "2 h", "Incremento de complexidade por porte"],
          ]}
        />
      </AjudaSecao>

      {/* Fontes */}
      <AjudaSecao titulo="De onde vêm os números">
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li>Dimensionamento: <strong>NT.00002.EQTL</strong> da Equatorial — Anexo II, tabelas C (transformador), D (poste) e F (banco de capacitores), extraídas da planilha oficial usada nos projetos reais da GTA.</li>
          <li>Validação: demanda <strong>238 → transformador 225 kVA</strong> (aproveitamento 106%, sobrecarga admitida pela NT) — bate com a planilha.</li>
          <li>Âncora de preço: proposta real de SE aérea pequena <strong>≈ R$ 6.000</strong> (Paulo César). Os defaults foram calibrados nessa referência.</li>
          <li>Modelo de preço <strong>por horas de engenharia</strong> (por custo) — não por m² nem por Fator K.</li>
          <li>Precisa mudar um padrão? Abra <strong>“Parâmetros”</strong> no configurador — vale para todas as novas propostas.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
