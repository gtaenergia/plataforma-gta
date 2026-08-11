import { describe, expect, it } from "vitest";
import { redigirOrcamento } from "@/lib/orcamentos/store";
import type { Orcamento } from "@/lib/orcamentos/types";

/**
 * A redação do orçamento antes de sair pela API.
 *
 * São dois segredos diferentes na mesma função: a URL crua do anexo (que
 * daria acesso ao arquivo sem passar pela rota autenticada) e a FICHA (custo,
 * markup e margem — quanto a GTA paga e quanto ganha).
 */

const ORCAMENTO = {
  id: "orc-1",
  referencia: "GTA-2026-CLIENTE-HORA-001",
  cliente: "Cliente Teste",
  fonte: "interno",
  estacao: "rascunho",
  serviceKey: "solar",
  descricao: "Energia Solar Fotovoltaica",
  valor: 1428.57,
  ficha: {
    custoBase: 1203,
    fator: 1.5873,
    faturamento: 1909.52,
    impostosPct: 0.07,
    margemLiquida: 0.3,
    custoTerceirizado: 900,
    // Campo APOSENTADO, de propósito no fixture: fichas gravadas em produção
    // antes de a seção "Custo administrativo" sair ainda o carregam, e a
    // redação precisa continuar escondendo o que não é mais contrato.
    custoAdministrativo: 303,
  },
  comentarios: [],
  historico: [],
  anexos: [
    {
      id: "anexo-1",
      revisao: 0,
      nome: "proposta.docx",
      tipo: "docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      tamanho: 1234,
      url: "https://fe1mdhdiisw5mdzi.public.blob.vercel-storage.com/segredo-abc123.docx",
      blob: true,
    },
  ],
  criadoPor: "matheus@gtaenergia.com",
  criadoEm: "2026-08-05T00:00:00.000Z",
  atualizadoEm: "2026-08-05T00:00:00.000Z",
} as unknown as Orcamento;

describe("redigirOrcamento", () => {
  it("apaga a URL do anexo nos DOIS casos", () => {
    // O download passa pela rota autenticada, que relê a URL do banco. O
    // cliente nunca precisa dela — e com ela em mãos baixaria o arquivo, ou
    // repassaria o link, sem sessão nenhuma.
    for (const ver of [true, false]) {
      const r = redigirOrcamento(ORCAMENTO, ver)!;
      expect(r.anexos[0].url, `verFinanceiro=${ver}`).toBe("");
    }
  });

  it("preserva o resto do anexo, que a tela precisa", () => {
    const r = redigirOrcamento(ORCAMENTO, true)!;
    expect(r.anexos[0].nome).toBe("proposta.docx");
    expect(r.anexos[0].tamanho).toBe(1234);
  });

  it("entrega a ficha a quem tem financeiro.ver", () => {
    const r = redigirOrcamento(ORCAMENTO, true)!;
    expect(r.ficha?.custoBase).toBe(1203);
    expect(r.ficha?.fator).toBeCloseTo(1.5873, 4);
    expect(r.ficha?.custoTerceirizado).toBe(900);
  });

  it("REMOVE a ficha de quem não tem", () => {
    const r = redigirOrcamento(ORCAMENTO, false)!;
    expect(r.ficha).toBeUndefined();
    // A chave não pode nem existir: `{ ficha: undefined }` vira `"ficha": null`
    // em algumas serializações, e o cliente saberia que há algo escondido.
    expect(Object.hasOwn(r, "ficha")).toBe(false);
  });

  it("o custo não sobra em nenhum canto do JSON", () => {
    // A checagem que pega o vazamento por outro caminho: o valor 900 (custo)
    // não pode aparecer em lugar NENHUM da resposta, nem aninhado.
    const texto = JSON.stringify(redigirOrcamento(ORCAMENTO, false));
    for (const proibido of [
      "custoBase",
      "margemLiquida",
      "custoAdministrativo",
      "custoTerceirizado",
      "blob.vercel-storage.com",
    ]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    // E os VALORES, não só os nomes dos campos: 303 é o custo administrativo.
    expect(texto).not.toContain("303");
  });

  it("o preço CONTINUA visível sem a permissão", () => {
    // Quem monta a proposta precisa saber o que está propondo ao cliente. O
    // que se esconde é a composição, não o preço.
    const r = redigirOrcamento(ORCAMENTO, false)!;
    expect(r.valor).toBe(1428.57);
  });

  it("aceita orçamento nulo", () => {
    expect(redigirOrcamento(null, true)).toBeNull();
    expect(redigirOrcamento(null, false)).toBeNull();
  });

  it("não altera o objeto original", () => {
    // O store devolve a instância viva em desenvolvimento (JSON em memória);
    // redigir por mutação apagaria a URL do próprio banco.
    const antes = JSON.stringify(ORCAMENTO);
    redigirOrcamento(ORCAMENTO, false);
    expect(JSON.stringify(ORCAMENTO)).toBe(antes);
  });
});
