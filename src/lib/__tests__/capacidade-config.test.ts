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
      { tipos: [{ id: "x", categoria: "Projetos", nome: "Y", minutos: -5 }] },
      { tipos: [{ categoria: "Projetos", nome: "Sem id", minutos: 60 }] },
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
      tipos: [{ id: "a", categoria: "Projetos", nome: "SPDA", minutos: "240" }],
    } as never);
    expect(r.padrao.minutosPorDia).toBe(300);
    expect(r.padrao.atrasoInicioMin).toBe(60);
    expect(r.estimativaPadraoMin).toBe(90);
    expect(r.tipos[0].minutos).toBe(240);
  });

  it("o catálogo de fábrica vem com nomes prontos e durações zeradas", () => {
    // Nome inventado é palpite de quem conhece o negócio; duração inventada
    // viraria prazo prometido a cliente sem ninguém ter conferido.
    const r = normalizarConfig(null);
    expect(r.tipos.length).toBeGreaterThan(10);
    expect(r.tipos.every((t) => t.nome.trim() !== "")).toBe(true);
    expect(r.tipos.every((t) => t.minutos === 0)).toBe(true);
    expect(new Set(r.tipos.map((t) => t.id)).size).toBe(r.tipos.length);
    // As três categorias base precisam estar cobertas.
    const cats = new Set(r.tipos.map((t) => t.categoria));
    expect(cats).toEqual(new Set(["Administrativo", "Orçamentos", "Projetos"]));
  });

  it("o catálogo salvo substitui o de fábrica, sem mesclar", () => {
    // Mesclar traria de volta os tipos que o administrador removeu de propósito.
    const r = normalizarConfig({
      tipos: [{ id: "unico", categoria: "Manutenção", nome: "Termografia", minutos: 120 }],
    } as never);
    expect(r.tipos).toHaveLength(1);
    expect(r.tipos[0].nome).toBe("Termografia");
  });

  it("catálogo vazio é estado válido — o administrador pode zerar a lista", () => {
    expect(normalizarConfig({ tipos: [] } as never).tipos).toEqual([]);
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
