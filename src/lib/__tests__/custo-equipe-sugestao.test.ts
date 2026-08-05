import { describe, expect, it } from "vitest";
import { lerHoras, sugerirCustoInterno } from "@/lib/custo-equipe/sugestao";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade } from "@/lib/capacidade/types";

const CONFIG: ConfigCapacidade = {
  ...CONFIG_CAPACIDADE_PADRAO,
  tipos: [
    { id: "t1", categoria: "Orçamentos", nome: "Usina solar residencial", minutos: 600 },
    { id: "t2", categoria: "Projetos", nome: "Projeto de subestação", minutos: 0 },
    { id: "t3", categoria: "Projetos", nome: "Memorial descritivo", minutos: 120 },
  ],
};

const EU = "gabriel@gtaenergia.com";

describe("sugerirCustoInterno", () => {
  it("converte os minutos do catálogo em horas", () => {
    // "um orçamento a gente gasta aí 10 horas pra executar um orçamento"
    const s = sugerirCustoInterno({ config: CONFIG, tipoId: "t1", responsavel: EU });
    expect(s.origem).toBe("catalogo");
    expect(s.horas).toBe(10);
    expect(s.linhas).toEqual([{ email: EU, horas: 10 }]);
  });

  it("acha o tipo por categoria e nome, como a tarefa guarda", () => {
    const s = sugerirCustoInterno({
      config: CONFIG,
      categoria: "Projetos",
      tipoNome: "Memorial descritivo",
      responsavel: EU,
    });
    expect(s.horas).toBe(2);
  });

  it("não se perde com acento e caixa", () => {
    // Reusa `acharTipo`, que já normaliza — não foi reimplementado aqui.
    const s = sugerirCustoInterno({
      config: CONFIG,
      categoria: "projetos",
      tipoNome: "PROJETO DE SUBESTACAO",
      responsavel: EU,
    });
    expect(s.tipo?.id).toBe("t2");
  });

  it("tipo SEM duração devolve linha marcada, não zero silencioso", () => {
    // É o estado dos 20 tipos hoje em produção. Custo zero é plausível demais
    // para passar despercebido e sair num preço.
    const s = sugerirCustoInterno({ config: CONFIG, tipoId: "t2", responsavel: EU });
    expect(s.origem).toBe("sem_duracao");
    expect(s.horas).toBe(0);
    expect(s.linhas).toEqual([{ email: EU, horas: 0 }]); // a pessoa vem; as horas, não
  });

  it("sem tipo escolhido não inventa estimativa", () => {
    const s = sugerirCustoInterno({ config: CONFIG, responsavel: EU });
    expect(s.origem).toBe("sem_tipo");
    expect(s.linhas).toEqual([]);
  });

  it("tipo inexistente cai no mesmo caminho", () => {
    const s = sugerirCustoInterno({ config: CONFIG, tipoId: "apagado", responsavel: EU });
    expect(s.origem).toBe("sem_tipo");
  });
});

describe("lerHoras", () => {
  it("lê a multiplicação da folha do dono", () => {
    // "44 dias úteis × 4,8 h/dia" — quem raciocina em dias digita em dias.
    expect(lerHoras("44 x 4,8")).toBe(211.2);
    expect(lerHoras("44*4.8")).toBe(211.2);
    expect(lerHoras("44 × 4,8")).toBe(211.2);
  });

  it("lê o número direto", () => {
    expect(lerHoras("211,2")).toBe(211.2);
    expect(lerHoras("10")).toBe(10);
  });

  it("evita o resíduo do ponto flutuante", () => {
    // 44 × 4,8 dá 211.20000000000002 em JS puro.
    expect(String(lerHoras("44 x 4,8"))).toBe("211.2");
  });

  it("devolve zero para entrada inválida em vez de NaN", () => {
    for (const t of ["", "abc", "44 x", "-5", "44 x -2", "x"]) {
      const v = lerHoras(t);
      expect(Number.isFinite(v), `entrada ${JSON.stringify(t)}`).toBe(true);
      expect(v, `entrada ${JSON.stringify(t)}`).toBe(0);
    }
  });

  it("aguenta mais de um fator", () => {
    // 2 pessoas × 5 dias × 8 h — alguém vai escrever assim.
    expect(lerHoras("2 x 5 x 8")).toBe(80);
  });
});
