import { AjudaSecao, Formula, Destaque, TabelaAjuda, RodapeAjuda } from "./ui";

/**
 * Tutorial "Como precificar — Laudo e Inspeção Técnica". Explica o modelo por
 * unidade (torre/edificação), como calibrar o valor conforme o porte e traz um
 * exemplo numérico completo. Conteúdo estático — reflete LAUDO_CONFIG em
 * src/components/servicos-simples-configs.ts.
 */
export function LaudoAjuda() {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        O serviço de <strong>Laudo e Inspeção Técnica</strong> é uma <strong>vistoria das instalações</strong> — elétricas,
        SPDA, iluminação de emergência etc. — com <strong>emissão de laudo e ART</strong> atestando a conformidade com as
        normas técnicas vigentes. A precificação é <strong>por unidade vistoriada</strong> (torre ou edificação): você informa
        quantas unidades e quanto vale cada uma, e o app <strong>soma</strong>. Aqui está como cada número nasce e como calibrá-lo.
      </p>

      {/* Passo a passo */}
      <AjudaSecao n={1} titulo="Passo a passo (como montar o orçamento)">
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li><strong>Nº de unidades.</strong> Quantas torres ou edificações serão vistoriadas e receberão laudo. Cada uma é uma "unidade" de preço.</li>
          <li><strong>Escopo do laudo.</strong> Quais disciplinas o laudo cobre — o padrão é <Destaque>instalações elétricas, SPDA e iluminação de emergência</Destaque>. Quanto mais disciplinas, mais horas de vistoria e mais complexo o laudo.</li>
          <li><strong>Valor por unidade.</strong> Ajuste conforme o porte: uma subestação com termografia vale muito mais que uma torre residencial padrão. O padrão é <Destaque>R$ 2.500</Destaque> (ver seção 3).</li>
          <li><strong>Confira o total.</strong> O app multiplica valor por unidade × nº de unidades e mostra a soma.</li>
          <li><strong>Gere o .docx.</strong> A proposta sai no padrão GTA com objeto, escopo, condição de pagamento (50/50) e prazo.</li>
        </ol>
      </AjudaSecao>

      {/* Preço */}
      <AjudaSecao n={2} titulo="Como o preço é calculado">
        <p>O preço é simplesmente o <strong>valor de cada unidade multiplicado pela quantidade</strong> de unidades vistoriadas:</p>
        <Formula nota="Ex.: 3 torres × R$ 2.000 = R$ 6.000 (laudo multi-torre) · ou 1 subestação × R$ 2.500 = R$ 2.500 (laudo + ART).">
          Preço = nº de unidades × valor por unidade
        </Formula>
        <p>
          O <strong>valor por unidade padrão é <Destaque>R$ 2.500</Destaque></strong> — a referência de uma subestação/edificação com
          laudo e ART. Ele é <strong>editável</strong> conforme a complexidade (porte, disciplinas, termografia, altura/acesso).
        </p>
        <p>
          A <strong>condição de pagamento</strong> é <Destaque>50% na contratação e 50% na entrega do laudo</Destaque>. A{" "}
          <strong>ART está inclusa</strong> no preço; eventuais <strong>correções apontadas no laudo são orçadas à parte</strong> —
          o laudo atesta a situação encontrada, a adequação é um serviço novo. Prazo de emissão: <strong>10 a 15 dias após a vistoria</strong>.
        </p>
      </AjudaSecao>

      {/* Calibrar o valor por unidade */}
      <AjudaSecao n={3} titulo="Como calibrar o valor por unidade">
        <p>
          O valor por unidade é <strong>editável</strong> e sobe com a complexidade da inspeção. Use estas âncoras de deals reais como
          ponto de partida:
        </p>
        <TabelaAjuda
          colunas={["Caso", "Valor por unidade"]}
          linhas={[
            [<span key="a">Subestação — laudo + ART <span className="text-slate-500 dark:text-slate-400">(KIPAO)</span></span>, <Destaque key="av">R$ 2.500</Destaque>],
            [<span key="b">Torre em laudo multi-torre <span className="text-slate-500 dark:text-slate-400">(Av. Parque)</span></span>, "R$ 2.000"],
            [<span key="c">Inspeção de SE com termografia</span>, "≈ R$ 15.000"],
          ]}
        />
        <p>
          A lógica: em <strong>laudos multi-torre</strong> o escopo se repete e ganha escala, então o valor por torre cai um pouco
          (~R$ 2.000). Uma <strong>subestação isolada</strong> com laudo + ART fica na referência de R$ 2.500. Já uma{" "}
          <strong>inspeção com termografia</strong> (equipamento de imagem térmica + análise das anomalias) é muito mais trabalhosa e
          pode chegar a <Destaque>~R$ 15.000</Destaque> por subestação. Ajuste o campo conforme o porte real do cliente.
        </p>
      </AjudaSecao>

      {/* Exemplo completo */}
      <AjudaSecao n={4} titulo="Exemplo completo (passo a passo com números)">
        <p>
          Condomínio com <strong>3 torres residenciais</strong>, laudo de conformidade de{" "}
          <em>instalações elétricas, SPDA e iluminação de emergência</em> por torre (caso Avenida Parque):
        </p>
        <ol className="ml-1 list-inside list-decimal space-y-2 marker:font-semibold marker:text-gta-indigo dark:marker:text-indigo-300">
          <li>Nº de unidades = <Destaque>3 torres</Destaque>.</li>
          <li>O escopo (3 disciplinas) se repete em cada torre — porte residencial padrão, sem termografia → valor por unidade <Destaque>R$ 2.000</Destaque>.</li>
          <li>O app multiplica e soma.</li>
        </ol>
        <Formula nota="Se fosse 1 subestação isolada com laudo + ART (caso KIPAO), seria 1 × R$ 2.500 = R$ 2.500.">
          Preço = 3 torres × R$ 2.000 = R$ 6.000
        </Formula>
        <p>Como fica a proposta na prática:</p>
        <TabelaAjuda
          colunas={["Etapa", "Valor"]}
          linhas={[
            [<span key="1">50% na contratação</span>, "R$ 3.000"],
            [<span key="2">50% na entrega do laudo</span>, "R$ 3.000"],
            [<span key="3">Total</span>, <Destaque key="t">R$ 6.000</Destaque>],
            [<span key="4">Prazo de emissão</span>, "10 a 15 dias após a vistoria"],
          ]}
        />
        <p>
          <strong>ART inclusa.</strong> Se a vistoria apontar não conformidades, as correções são orçadas à parte — vira um novo
          escopo de adequação.
        </p>
      </AjudaSecao>

      {/* Valores padrão / de onde vem */}
      <AjudaSecao titulo="Valores padrão e de onde vêm">
        <p>Todos ajustáveis no configurador. Os padrões e as âncoras vêm de propostas reais da GTA:</p>
        <TabelaAjuda
          colunas={["Parâmetro", "Padrão", "O que é"]}
          linhas={[
            [<span key="v">Valor por unidade</span>, <Destaque key="vv">R$ 2.500</Destaque>, "Referência por subestação/edificação; multiplica pelo nº de unidades"],
            [<span key="e">Escopo do laudo</span>, "Elétrica + SPDA + ilum. emergência", "Disciplinas cobertas pela vistoria (editável)"],
            [<span key="c">Condição de pagamento</span>, "50% + 50%", "50% na contratação, 50% na entrega do laudo"],
            [<span key="a">ART</span>, "Inclusa", "Anotação de Responsabilidade Técnica já no preço"],
            [<span key="p">Prazo</span>, "10 a 15 dias", "Após a vistoria, para emissão do laudo"],
            [<span key="k">Correções</span>, "À parte", "Não conformidades apontadas são orçadas separadamente"],
          ]}
        />
        <ul className="ml-1 list-inside list-disc space-y-1.5">
          <li><strong>KIPAO</strong> — vistoria + relatório + ART de 1 subestação = <strong>R$ 2.500</strong> (âncora do valor por unidade).</li>
          <li><strong>Avenida Parque</strong> — 3 torres × R$ 2.000 = <strong>R$ 6.000</strong> (âncora do valor por torre em laudo multi-torre).</li>
          <li>Inspeção de subestação <strong>com termografia</strong> é um patamar à parte — pode chegar a <strong>~R$ 15.000</strong> por SE.</li>
        </ul>
      </AjudaSecao>

      <RodapeAjuda />
    </div>
  );
}
