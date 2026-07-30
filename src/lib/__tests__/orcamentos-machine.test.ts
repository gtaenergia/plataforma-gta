import { describe, expect, it } from "vitest";
import { podeTransicionar, permissaoDaAcao } from "../orcamentos/machine";
import { transicaoSchema } from "../orcamentos/types";
import type { AcaoTransicao, Estacao } from "../orcamentos/types";

/**
 * Máquina de estados do fluxo de aprovação. Trava quem pode ir para onde:
 * um caminho a mais aqui é um jeito a mais de mexer num orçamento já decidido.
 */

const ESTACOES: Estacao[] = ["rascunho", "em_revisao", "aprovado", "cancelado"];
const ACOES: AcaoTransicao[] = ["enviar", "aprovar", "rejeitar", "cancelar", "reabrir"];

/** Todas as transições permitidas, como "estacao:acao -> destino". */
function mapaCompleto(): string[] {
  const out: string[] = [];
  for (const e of ESTACOES) {
    for (const a of ACOES) {
      const t = podeTransicionar(e, a);
      if (t.ok) out.push(`${e}:${a} -> ${t.destino}`);
    }
  }
  return out;
}

describe("fluxo de aprovação", () => {
  it("o mapa de transições é exatamente este", () => {
    expect(mapaCompleto()).toMatchInlineSnapshot(`
      [
        "rascunho:enviar -> em_revisao",
        "rascunho:cancelar -> cancelado",
        "em_revisao:aprovar -> aprovado",
        "em_revisao:rejeitar -> rascunho",
        "em_revisao:cancelar -> cancelado",
        "aprovado:reabrir -> em_revisao",
        "cancelado:reabrir -> em_revisao",
      ]
    `);
  });

  it("aprovado deixa de ser beco sem saída: reabre para revisão", () => {
    const t = podeTransicionar("aprovado", "reabrir");
    expect(t).toEqual({ ok: true, destino: "em_revisao" });
  });

  it("cancelado também reabre", () => {
    expect(podeTransicionar("cancelado", "reabrir")).toEqual({ ok: true, destino: "em_revisao" });
  });

  it("mas reabrir NÃO pula etapa: aprovado não vira rascunho nem é aprovado de novo", () => {
    expect(podeTransicionar("aprovado", "aprovar").ok).toBe(false);
    expect(podeTransicionar("aprovado", "rejeitar").ok).toBe(false);
    expect(podeTransicionar("aprovado", "cancelar").ok).toBe(false);
    expect(podeTransicionar("aprovado", "enviar").ok).toBe(false);
  });

  it("reabrir não faz sentido em quem ainda não foi decidido", () => {
    expect(podeTransicionar("rascunho", "reabrir").ok).toBe(false);
    expect(podeTransicionar("em_revisao", "reabrir").ok).toBe(false);
  });

  it("depois de reabrir, as decisões normais voltam a valer", () => {
    const reaberto = podeTransicionar("aprovado", "reabrir");
    expect(reaberto.ok && podeTransicionar(reaberto.destino, "rejeitar")).toEqual({
      ok: true,
      destino: "rascunho",
    });
  });
});

describe("permissão de cada ação", () => {
  it("desfazer exige o mesmo poder de decidir", () => {
    expect(permissaoDaAcao("reabrir")).toBe("orcamentos.aprovar");
    expect(permissaoDaAcao("reabrir")).toBe(permissaoDaAcao("aprovar"));
  });

  it("as demais seguem inalteradas", () => {
    expect(permissaoDaAcao("enviar")).toBe("orcamentos.criar");
    expect(permissaoDaAcao("rejeitar")).toBe("orcamentos.aprovar");
    expect(permissaoDaAcao("cancelar")).toBe("orcamentos.cancelar");
  });
});

describe("parecer obrigatório", () => {
  it("reabrir sem justificativa é recusado — o histórico precisa do motivo", () => {
    expect(transicaoSchema.safeParse({ acao: "reabrir" }).success).toBe(false);
    expect(transicaoSchema.safeParse({ acao: "reabrir", parecer: "   " }).success).toBe(false);
  });

  it("reabrir com justificativa passa", () => {
    expect(transicaoSchema.safeParse({ acao: "reabrir", parecer: "Aprovei no lugar errado." }).success).toBe(true);
  });

  it("aprovar/rejeitar seguem exigindo parecer; enviar e cancelar não", () => {
    expect(transicaoSchema.safeParse({ acao: "aprovar" }).success).toBe(false);
    expect(transicaoSchema.safeParse({ acao: "rejeitar" }).success).toBe(false);
    expect(transicaoSchema.safeParse({ acao: "enviar" }).success).toBe(true);
    expect(transicaoSchema.safeParse({ acao: "cancelar" }).success).toBe(true);
  });
});
