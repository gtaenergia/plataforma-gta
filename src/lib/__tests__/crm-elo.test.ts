import { describe, expect, it } from "vitest";
import { atualizacaoDeValor, avisoDoRetorno, descricaoDoPedido, tituloDoPedido } from "@/lib/crm/elo";

describe("atualizacaoDeValor", () => {
  it("substitui a estimativa e deixa a diferença no histórico", () => {
    const r = atualizacaoDeValor(50000, 63500, "GTA-2026-RIODOCE-SUB-001", "aprovada");
    expect(r.valor).toBe(63500);
    expect(r.mudou).toBe(true);
    expect(r.texto).toContain("estimado R$ 50.000,00 → proposta R$ 63.500,00");
    expect(r.texto).toContain("aprovada");
  });

  it("sem estimativa anterior, só registra o valor da proposta", () => {
    const r = atualizacaoDeValor(0, 12000, "GTA-X", "gerada");
    expect(r.valor).toBe(12000);
    expect(r.mudou).toBe(true);
    expect(r.texto).toBe("Proposta GTA-X gerada — R$ 12.000,00.");
  });

  it("valor igual não conta como mudança — evita anotação inútil a cada aprovação", () => {
    const r = atualizacaoDeValor(12000, 12000, "GTA-X", "aprovada");
    expect(r.mudou).toBe(false);
    expect(r.valor).toBe(12000);
  });

  it("proposta sem preço NÃO zera o funil do comercial", () => {
    const r = atualizacaoDeValor(50000, 0, "GTA-X", "gerada");
    expect(r.valor).toBe(50000);
    expect(r.mudou).toBe(false);
    expect(r.texto).toContain("sem valor informado");
  });

  it("preço inválido é tratado como ausente, não como zero", () => {
    expect(atualizacaoDeValor(9000, NaN, "GTA-X", "gerada").valor).toBe(9000);
    expect(atualizacaoDeValor(9000, -5, "GTA-X", "gerada").valor).toBe(9000);
  });

  it("centavos contam; diferença abaixo de um centavo, não", () => {
    expect(atualizacaoDeValor(100, 100.01, "GTA-X", "gerada").mudou).toBe(true);
    expect(atualizacaoDeValor(100, 100.001, "GTA-X", "gerada").mudou).toBe(false);
  });
});

describe("avisoDoRetorno", () => {
  it("aprovada diz que já pode enviar ao cliente", () => {
    const a = avisoDoRetorno("Subestação — Rio Doce", "GTA-1", 63500, "aprovada");
    expect(a.titulo).toContain("liberada para envio");
    expect(a.mensagem).toContain("R$ 63.500,00");
    expect(a.mensagem).toContain("revisão interna");
  });

  it("gerada avisa que a revisão ainda vem — não é aval para enviar", () => {
    const a = avisoDoRetorno("Subestação — Rio Doce", "GTA-1", 63500, "gerada");
    expect(a.mensagem).toContain("ainda vai passar pela revisão");
  });

  it("sem valor, a frase não fica com um R$ solto", () => {
    expect(avisoDoRetorno("N", "GTA-1", 0, "aprovada").mensagem).not.toContain("R$");
  });
});

describe("tituloDoPedido", () => {
  it("junta serviço e empresa — a tarefa entra numa fila com outras", () => {
    expect(tituloDoPedido("Projeto de Subestação", "Fazenda Rio Doce")).toBe("Projeto de Subestação — Fazenda Rio Doce");
  });

  it("sem empresa, fica só o serviço; sem serviço, um rótulo genérico", () => {
    expect(tituloDoPedido("SPDA", "")).toBe("SPDA");
    expect(tituloDoPedido("", "Atlas")).toBe("Proposta — Atlas");
  });
});

describe("descricaoDoPedido", () => {
  it("leva junto o que quem recebe não tem — ele não abre o CRM", () => {
    const d = descricaoDoPedido({
      negociacaoNome: "Subestação — Rio Doce",
      empresa: "Fazenda Rio Doce",
      valorEstimado: 50000,
      previsao: "2026-08-21",
      solicitante: "Ana Vendedora",
      observacao: "Cliente quer execução em setembro.",
    });
    expect(d).toContain("Fazenda Rio Doce");
    expect(d).toContain("R$ 50.000,00");
    expect(d).toContain("21/08/2026");
    expect(d).toContain("Ana Vendedora");
    expect(d).toContain("Cliente quer execução em setembro.");
  });

  it("campos vazios viram travessão, não 'undefined' nem data torta", () => {
    const d = descricaoDoPedido({
      negociacaoNome: "N", empresa: "", valorEstimado: 0, previsao: "", solicitante: "Ana",
    });
    expect(d).toContain("Empresa: —");
    expect(d).toContain("Valor estimado pelo comercial: —");
    expect(d).toContain("Previsão de fechamento: —");
    expect(d).not.toContain("undefined");
  });
});
