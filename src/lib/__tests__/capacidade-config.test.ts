import { describe, expect, it } from "vitest";
import { normalizarConfig } from "@/lib/capacidade/config";
import { CONFIG_CAPACIDADE_PADRAO, configCapacidadeSchema } from "@/lib/capacidade/types";

describe("configuração de capacidade", () => {
  it("sem nada salvo, vale o padrão", () => {
    expect(normalizarConfig(null)).toEqual(CONFIG_CAPACIDADE_PADRAO);
    expect(normalizarConfig(undefined)).toEqual(CONFIG_CAPACIDADE_PADRAO);
    expect(normalizarConfig({})).toEqual(CONFIG_CAPACIDADE_PADRAO);
  });

  it("bloco `padrao` salvo pela metade não zera o resto", () => {
    // O spread raso trocaria o objeto inteiro e deixaria `diasUteis` indefinido,
    // o que derrubaria toda conta de dia útil.
    const r = normalizarConfig({ padrao: { minutosPorDia: 300 } } as never);
    expect(r.padrao.minutosPorDia).toBe(300);
    expect(r.padrao.diasUteis).toEqual([1, 2, 3, 4, 5]);
    expect(r.padrao.atrasoInicioMin).toBe(240);
  });

  it("configuração corrompida cai no padrão em vez de lançar", () => {
    // Um erro aqui derrubaria a tela de tarefas inteira.
    for (const lixo of [
      { padrao: { minutosPorDia: "muito" } },
      { pessoas: "não é objeto" },
      { estimativas: { orcamentos: -5 } },
      { feriados: "2026-08-04" },
      { padrao: { diasUteis: [9] } },
      { padrao: { minutosPorDia: 99_999 } },
    ]) {
      expect(() => normalizarConfig(lixo as never)).not.toThrow();
      expect(normalizarConfig(lixo as never)).toEqual(CONFIG_CAPACIDADE_PADRAO);
    }
  });

  it("dia da semana fora de 0–6 é rejeitado", () => {
    expect(configCapacidadeSchema.safeParse({ ...CONFIG_CAPACIDADE_PADRAO, padrao: { minutosPorDia: 480, diasUteis: [1, 7], atrasoInicioMin: 0 } }).success).toBe(false);
    expect(configCapacidadeSchema.safeParse({ ...CONFIG_CAPACIDADE_PADRAO, padrao: { minutosPorDia: 480, diasUteis: [0, 6], atrasoInicioMin: 0 } }).success).toBe(true);
  });

  it("dia repetido é colapsado — senão contaria a capacidade duas vezes", () => {
    const r = normalizarConfig({ padrao: { minutosPorDia: 480, diasUteis: [1, 1, 3, 2, 3], atrasoInicioMin: 0 } } as never);
    expect(r.padrao.diasUteis).toEqual([1, 2, 3]);
  });

  it("número que chega como string do formulário é aceito", () => {
    // Todo <input type="number"> entrega string; sem `coerce` a config salva
    // pela tela seria descartada silenciosamente e voltaria ao padrão.
    const r = normalizarConfig({
      padrao: { minutosPorDia: "300", diasUteis: [1, 2], atrasoInicioMin: "60" },
      estimativaPadraoMin: "90",
      estimativas: { orcamentos: "240" },
    } as never);
    expect(r.padrao.minutosPorDia).toBe(300);
    expect(r.padrao.atrasoInicioMin).toBe(60);
    expect(r.estimativaPadraoMin).toBe(90);
    expect(r.estimativas.orcamentos).toBe(240);
  });

  it("ajuste individual parcial sobrevive à normalização", () => {
    const r = normalizarConfig({ pessoas: { "ana@gta.com": { minutosPorDia: 240 } } } as never);
    expect(r.pessoas["ana@gta.com"]).toEqual({ minutosPorDia: 240 });
  });

  it("jornada zero é válida — é como se marca quem não executa tarefas", () => {
    const r = normalizarConfig({ pessoas: { "chefe@gta.com": { minutosPorDia: 0 } } } as never);
    expect(r.pessoas["chefe@gta.com"].minutosPorDia).toBe(0);
  });
});
