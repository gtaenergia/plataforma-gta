import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { SERVICES } from "../registry";
import { TEMPLATE_SERVICOS } from "../_cpq/proposta";
import { renderDocx } from "@/lib/docx/generate";
import { parseNumber } from "@/lib/format";

/**
 * Cada serviço gera um .docx VÁLIDO — o documento, não só os dados.
 *
 * Os golden tests congelam o que o mapper produz; este teste renderiza o molde
 * real com esses dados e lê o texto impresso. É a única camada que pega o
 * defeito silencioso desta arquitetura: o `nullGetter` devolve "" para
 * marcador sem valor, então uma tag no molde sem chave no mapper não quebra
 * nada — ela vira um buraco em branco no meio da frase, e ninguém percebe até
 * o cliente receber a proposta.
 *
 * O que se valida em cada um dos serviços:
 * - o zip resultante é um .docx (tem word/document.xml);
 * - o texto impresso traz cliente, referência e valor total;
 * - nenhum "undefined", "NaN" ou "[object Object]" vazou para o papel;
 * - nenhum delimitador `{`/`}` sobrou (tag malformada no molde);
 * - `data.valorTotal` é numérico e positivo — é dele que o CRM recebe o valor
 *   de volta quando a proposta nasce de uma negociação (/api/gerar).
 */

/** Form no shape que os configuradores CPQ enviam (molde compartilhado). */
const FORM_CPQ = {
  clienteNome: "Cliente Verificação Ltda",
  cidadeUf: "Goiânia/GO",
  referenciaSeq: 3,
  dataEmissao: "2026-08-09",
  validadeDias: 20,
  formaPagamento: "50% na assinatura e 50% na entrega",
  localAtividade: "",
  titulo: "PROPOSTA TÉCNICA E COMERCIAL",
  objeto: "Objeto de verificação do serviço.",
  prazoExecucao: "30 dias corridos",
  itens: [
    { descricao: "Item principal do escopo", valor: "12.345,67", condicao: "na entrega" },
    { descricao: "Item incluso no escopo", valor: "0" },
  ],
  observacoes: ["Observação de verificação."],
};

const FORM_SOLAR = {
  clienteNome: "Cliente Verificação Ltda",
  cidadeUf: "Goiânia/GO",
  objeto: "Sistema fotovoltaico on-grid de 6,84 kWp.",
  subtitulo: "ENERGIA SOLAR FOTOVOLTAICA",
  referenciaSeq: 3,
  dataEmissao: "2026-08-09",
  validadeDias: 20,
  formaPagamento: "À vista na entrega",
  textoObjetivo: "Fornecimento e instalação de sistema fotovoltaico.",
  potenciaPainel: "570",
  qtdPaineis: "12",
  potenciaTotal: "6,84",
  potenciaInversor: "5",
  overload: "15%",
  qtdInversores: "1",
  tipoInversor: "inversor" as const,
  simulacao: [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ].map((mes) => ({ mes, insolacao: "5,37", energia: "838", consumo: "800" })),
  textoObservacao: "Estimativa com base no consumo informado.",
  materiais: [
    { qtde: "12", descricao: "Módulo fotovoltaico 570 Wp" },
    { qtde: "1", descricao: "Inversor 5 kW" },
  ],
  distribuidor: "weg" as const,
  distribuidorNome: "",
  distribuidorCnpj: "",
  kitItens: "12 módulos 570 Wp + inversor 5 kW",
  valorKit: "20.000,00",
  valorGta: "11.500,00",
  prazoExecucao: "45 dias corridos",
  economiaMensal: "R$ 693,00",
  economiaAno1: "R$ 8.316,00",
  paybackTexto: "3 anos e 4 meses",
};

const FORM_CARREGADOR = {
  clienteNome: "Cliente Verificação Ltda",
  cidadeUf: "Goiânia/GO",
  referenciaSeq: 3,
  dataEmissao: "2026-08-09",
  validadeDias: 20,
  formaPagamento: "À vista na entrega",
  subtitulo: "INFRAESTRUTURA PARA CARREGADOR VEICULAR",
  objeto: "Infraestrutura elétrica para carregador de 7,4 kW.",
  textoObjetivo: "Dimensionamento e instalação conforme NBR 5410.",
  potenciaKw: "7,4",
  sizing: {
    tensao: 220,
    correnteNominal: 33.64,
    correnteProjeto: 42.05,
    disjuntorA: 50,
    polos: 2,
    secaoMm2: 10,
    // FRAÇÃO, como o engine devolve e o configurador repassa (o mapper × 100).
    quedaPct: 0.0137,
    nCondutores: 3,
    nDps: 2,
    eletroduto: '1"',
    drTipo: "B" as const,
  },
  materiais: [
    { qtde: "1", descricao: "Disjuntor bipolar 50 A curva C" },
    { qtde: "25 m", descricao: "Cabo 10 mm² 750 V" },
  ],
  valorServico: "4.500,00",
  valorEquipamento: "2.140,00",
  prazoExecucao: "10 dias úteis",
};

function formPara(s: (typeof SERVICES)[number]): Record<string, unknown> {
  if (s.templateFile === TEMPLATE_SERVICOS) return FORM_CPQ;
  if (s.key === "solar") return FORM_SOLAR;
  if (s.key === "carregador") return FORM_CARREGADOR;
  // Serviço novo com molde próprio: acrescente a fixture aqui, senão ele
  // entraria em produção sem nunca ter renderizado um documento no CI.
  throw new Error(`Sem fixture de formulário para o serviço "${s.key}".`);
}

/** O texto que sai impresso: conteúdo dos <w:t> de documento, cabeçalhos e rodapés. */
function textoImpresso(docx: Buffer): string {
  const zip = new PizZip(docx);
  const partes = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  expect(partes, "o .docx precisa ter word/document.xml").toContain("word/document.xml");
  const texto = partes
    .map((f) => zip.files[f].asText())
    .join("\n")
    // <w:p> fecha parágrafo; sem isso o texto de linhas vizinhas se emenda.
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  return texto;
}

/** As tags `{...}` escritas num molde, lidas do texto plano (runs emendados). */
function tagsDoMolde(molde: Buffer): string[] {
  const zip = new PizZip(molde);
  const partes = Object.keys(zip.files).filter((f) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(f));
  const texto = partes
    .map((f) => zip.files[f].asText())
    .join("\n")
    .replace(/<[^>]+>/g, ""); // runs da mesma tag se emendam, remontando `{tag}` partida
  const achadas = [...texto.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim());
  return achadas
    .filter((t) => !t.startsWith("/")) // fechamento de loop
    .map((t) => t.replace(/^[#^]/, "")); // abertura de loop/inversão → nome da lista
}

describe("nenhuma tag do molde fica sem valor no mapper", () => {
  /*
   * O par deste teste com o de render fecha o cerco: o render prova que o que
   * o mapper MANDA sai impresso; este prova que o molde não PEDE nada que o
   * mapper não mande. Sem ele, renomear uma chave no mapper (ou errar o nome
   * da tag ao editar o molde no Word) imprime um vazio silencioso — o
   * nullGetter devolve "" de propósito, para campos opcionais.
   */
  const porMolde = new Map<string, (typeof SERVICES)[number][]>();
  for (const s of SERVICES) {
    porMolde.set(s.templateFile, [...(porMolde.get(s.templateFile) ?? []), s]);
  }

  it.each([...porMolde.entries()].map(([molde, servicos]) => [molde, servicos] as const))(
    "%s",
    (arquivo, servicos) => {
      const tags = tagsDoMolde(fs.readFileSync(path.join(process.cwd(), arquivo)));
      expect(tags.length).toBeGreaterThan(0);

      for (const s of servicos) {
        const parsed = s.zodSchema.parse(formPara(s));
        const { data } = s.map(parsed as Record<string, unknown>);
        const d = data as Record<string, unknown>;

        // Chaves visíveis para o docxtemplater: as do topo e as dos objetos
        // dentro de listas (contexto interno de {#lista}...{/lista}).
        const conhecidas = new Set<string>(Object.keys(d));
        for (const v of Object.values(d)) {
          if (Array.isArray(v)) {
            for (const item of v) {
              if (item && typeof item === "object") Object.keys(item).forEach((k) => conhecidas.add(k));
            }
          }
        }

        const orfas = [...new Set(tags)].filter((t) => !conhecidas.has(t));
        expect(orfas, `${s.key}: tags do molde sem chave no mapper`).toEqual([]);
      }
    },
  );
});

describe("cada serviço gera um .docx válido", () => {
  it.each(SERVICES.map((s) => [s.key, s] as const))("%s", (_key, s) => {
    const parsed = s.zodSchema.parse(formPara(s));
    const { data, patch } = s.map(parsed as Record<string, unknown>);

    const molde = fs.readFileSync(path.join(process.cwd(), s.templateFile));
    const docx = renderDocx(molde, data as Record<string, unknown>, patch);
    const texto = textoImpresso(docx);

    // O que o cliente precisa achar no papel.
    expect(texto.toLowerCase()).toContain("cliente verificação ltda");
    const referencia = String((data as Record<string, unknown>).referencia ?? "");
    expect(referencia, `${s.key} não montou a referência`).not.toBe("");
    expect(texto).toContain(referencia);
    const valorTotal = String((data as Record<string, unknown>).valorTotal ?? "");
    expect(texto).toContain(valorTotal);

    // O que NÃO pode sair impresso.
    expect(texto).not.toContain("undefined");
    expect(texto).not.toContain("NaN");
    expect(texto).not.toContain("[object Object]");
    // Delimitador que sobrou = tag malformada que o docxtemplater não consumiu.
    expect(texto).not.toMatch(/[{}]/);

    // O valor que volta ao CRM quando a proposta nasce de uma negociação.
    expect(parseNumber(valorTotal), `${s.key}: valorTotal "${valorTotal}" não é um número positivo`).toBeGreaterThan(0);
  });

  it("solar: o gráfico nativo recebe os valores da simulação, série por série", () => {
    /*
     * O patch do gráfico é um no-op silencioso quando `word/charts/chart1.xml`
     * não existe — de propósito, para os moldes sem gráfico. O efeito colateral
     * é que renomear o arquivo do gráfico no molde (ou trocar o molde) deixaria
     * a proposta sair com os NÚMEROS DE EXEMPLO do Word no gráfico, sem nenhum
     * erro. Aqui se garante que o gráfico existe e que cada série recebeu a sua
     * coluna da simulação — pelo NOME da série, o que também pega uma inversão
     * de ordem entre Geração e Consumo.
     */
    const solar = SERVICES.find((s) => s.key === "solar")!;
    const parsed = solar.zodSchema.parse(FORM_SOLAR);
    const { data, patch } = solar.map(parsed as Record<string, unknown>);
    const docx = renderDocx(
      fs.readFileSync(path.join(process.cwd(), solar.templateFile)),
      data as Record<string, unknown>,
      patch,
    );

    const chart = new PizZip(docx).file("word/charts/chart1.xml");
    expect(chart, "o molde Solar precisa ter o gráfico nativo em word/charts/chart1.xml").toBeTruthy();
    const xml = chart!.asText();

    // Bloco de cada série: nome (strCache) + pontos (numCache), na mesma <c:ser>.
    const series = [...xml.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)].map(([bloco]) => {
      const nome = /<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/.exec(bloco)?.[1] ?? "";
      const pontos = [...(/<c:numCache>[\s\S]*?<\/c:numCache>/.exec(bloco)?.[0] ?? "").matchAll(/<c:v>([^<]*)<\/c:v>/g)]
        .map((m) => m[1]);
      return { nome, pontos };
    });

    const geracao = series.find((s) => /gera/i.test(s.nome));
    const consumo = series.find((s) => /consumo/i.test(s.nome));
    expect(geracao, `séries encontradas: ${series.map((s) => s.nome).join(", ")}`).toBeTruthy();
    expect(consumo).toBeTruthy();
    // A fixture manda 838 de geração e 800 de consumo nos 12 meses.
    expect(geracao!.pontos).toEqual(Array(12).fill("838.00"));
    expect(consumo!.pontos).toEqual(Array(12).fill("800.00"));
  });
});
