import { describe, expect, it } from "vitest";
import {
  COR_FORA_DA_EQUIPE,
  PALETA_PESSOAS,
  coresDaEquipe,
  corDePessoa,
} from "@/lib/cor-de-pessoa";

const EQUIPE = [
  "matheus@gtaenergia.com",
  "marcela@gtaenergia.com",
  "gabriel@gtaenergia.com",
  "tito@gtaenergia.com",
  "paulovitor@gtaenergia.com",
  "teste@gtaenergia.com",
];

/** Contraste WCAG entre duas cores hex. */
function contraste(a: string, b: string): number {
  const canal = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("coresDaEquipe", () => {
  it("dá uma cor diferente para cada pessoa", () => {
    const cores = coresDaEquipe(EQUIPE);
    expect(new Set(cores.values()).size).toBe(EQUIPE.length);
  });

  it("não depende da ordem em que a equipe chega", () => {
    // A lista vem de /api/usuarios; a ordem do banco não é garantida, e a cor
    // não pode mudar porque uma linha veio antes da outra.
    const normal = coresDaEquipe(EQUIPE);
    const invertida = coresDaEquipe([...EQUIPE].reverse());
    for (const email of EQUIPE) expect(invertida.get(email)).toBe(normal.get(email));
  });

  it("ignora e-mail repetido em vez de gastar uma cor com ele", () => {
    const cores = coresDaEquipe([...EQUIPE, EQUIPE[0]]);
    expect(cores.size).toBe(EQUIPE.length);
  });

  it("mantém a cor de quem entrou antes quando chega alguém depois na ordem", () => {
    const antes = coresDaEquipe(EQUIPE);
    const depois = coresDaEquipe([...EQUIPE, "victor@gtaenergia.com"]);
    for (const email of EQUIPE) expect(depois.get(email)).toBe(antes.get(email));
  });

  it("repete a paleta quando a equipe passa de sete", () => {
    const oito = Array.from({ length: 8 }, (_, i) => `p${i}@gta.com`);
    const cores = coresDaEquipe(oito);
    expect(cores.get("p0@gta.com")).toBe(cores.get("p7@gta.com"));
  });

  it("devolve mapa vazio sem equipe, sem lançar", () => {
    expect(coresDaEquipe([]).size).toBe(0);
  });
});

describe("corDePessoa", () => {
  it("usa a cor neutra para quem não está mais na equipe", () => {
    const cores = coresDaEquipe(EQUIPE);
    expect(corDePessoa("exfuncionario@gtaenergia.com", cores)).toBe(COR_FORA_DA_EQUIPE);
  });
});

describe("paleta", () => {
  // O bloco do calendário é preenchido com a cor e leva texto BRANCO por cima.
  // Sem esta trava, uma cor clara adicionada no futuro passaria despercebida
  // até alguém não conseguir ler o próprio apontamento.
  it("todas as cores sustentam texto branco (WCAG AA, 4,5:1)", () => {
    for (const cor of [...PALETA_PESSOAS, COR_FORA_DA_EQUIPE]) {
      expect(contraste("#ffffff", cor), `${cor} contra branco`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("não tem cor repetida", () => {
    expect(new Set(PALETA_PESSOAS).size).toBe(PALETA_PESSOAS.length);
  });

  it("não usa a cor neutra como cor de pessoa", () => {
    expect(PALETA_PESSOAS).not.toContain(COR_FORA_DA_EQUIPE);
  });
});
