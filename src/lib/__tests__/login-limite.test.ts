import { describe, expect, it } from "vitest";
import {
  FALHAS_LIVRES,
  JANELA_ESQUECIMENTO,
  PENALIDADE_TETO,
  bloqueadoAte,
  chaveEmail,
  chaveIp,
  falhasVigentes,
  ipDaRequisicao,
  penalidadeSegundos,
  segundosRestantes,
} from "@/lib/login/limite";

const AGORA = Date.UTC(2026, 7, 5, 12, 0, 0);

describe("penalidadeSegundos", () => {
  it("não pune quem errou dentro da tolerância", () => {
    // Errar a senha três vezes antes de lembrar é uso normal, não ataque.
    for (let f = 0; f <= FALHAS_LIVRES; f++) expect(penalidadeSegundos(f), `falhas=${f}`).toBe(0);
  });

  it("dobra a cada falha depois da tolerância", () => {
    expect(penalidadeSegundos(5)).toBe(30);
    expect(penalidadeSegundos(6)).toBe(60);
    expect(penalidadeSegundos(7)).toBe(120);
    expect(penalidadeSegundos(8)).toBe(240);
  });

  it("para de crescer no teto", () => {
    // O teto não é generosidade com o atacante: é o que garante que o bloqueio
    // se desfaz sozinho, para ninguém da equipe ficar trancado fora.
    expect(penalidadeSegundos(50)).toBe(PENALIDADE_TETO);
    expect(penalidadeSegundos(500)).toBe(PENALIDADE_TETO);
  });

  it("não devolve NaN nem Infinity para entrada absurda", () => {
    // `2 ** falhas` estoura rápido; sem o corte, viraria Infinity e o bloqueio
    // seria eterno.
    for (const f of [1e9, Number.MAX_SAFE_INTEGER, Infinity, NaN, -5]) {
      const v = penalidadeSegundos(f);
      expect(Number.isFinite(v), `falhas=${f}`).toBe(true);
      expect(v).toBeLessThanOrEqual(PENALIDADE_TETO);
    }
  });
});

describe("bloqueadoAte e segundosRestantes", () => {
  it("libera exatamente quando a penalidade acaba", () => {
    const ate = bloqueadoAte(5, AGORA);
    expect(segundosRestantes(ate, AGORA)).toBe(30);
    expect(segundosRestantes(ate, AGORA + 29_000)).toBe(1);
    expect(segundosRestantes(ate, AGORA + 30_000)).toBe(0);
  });

  it("nunca devolve negativo", () => {
    expect(segundosRestantes(AGORA, AGORA + 999_999)).toBe(0);
  });

  it("sem penalidade, não bloqueia", () => {
    expect(segundosRestantes(bloqueadoAte(1, AGORA), AGORA)).toBe(0);
  });
});

describe("falhasVigentes", () => {
  it("esquece o histórico depois da janela", () => {
    // Quem errou três vezes há dois meses não pode começar hoje com três
    // strikes na conta.
    const velho = AGORA - (JANELA_ESQUECIMENTO + 1) * 1000;
    expect(falhasVigentes(3, velho, AGORA)).toBe(0);
  });

  it("mantém o histórico dentro da janela", () => {
    const recente = AGORA - 60 * 1000;
    expect(falhasVigentes(3, recente, AGORA)).toBe(3);
  });

  it("trata registro inexistente como zero", () => {
    expect(falhasVigentes(0, 0, AGORA)).toBe(0);
  });
});

describe("chaves", () => {
  it("normaliza o e-mail para o mesmo alvo", () => {
    // Sem isto, alternar maiúsculas daria uma cota nova a cada variação.
    expect(chaveEmail("  Marcela@GTAEnergia.com ")).toBe("email:marcela@gtaenergia.com");
  });

  it("separa o espaço de e-mail e de IP", () => {
    expect(chaveEmail("1.2.3.4")).not.toBe(chaveIp("1.2.3.4"));
  });
});

describe("ipDaRequisicao", () => {
  const h = (obj: Record<string, string>) => new Headers(obj);

  it("pega o primeiro item do x-forwarded-for", () => {
    // O primeiro é o cliente; os demais são os saltos até nós.
    expect(ipDaRequisicao(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7");
  });

  it("cai no x-real-ip quando não há lista", () => {
    expect(ipDaRequisicao(h({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("devolve um valor mesmo sem cabeçalho nenhum", () => {
    // Precisa ser uma chave estável: sem ela, quem não manda cabeçalho ficaria
    // sem limite algum.
    expect(ipDaRequisicao(h({}))).toBe("desconhecido");
  });
});
