import { describe, expect, it } from "vitest";
import { formatarBytes } from "../admin/types";

describe("formatarBytes", () => {
  it("bytes não ganham casa decimal", () => {
    expect(formatarBytes(512)).toBe("512 B");
  });

  it("usa base 1024, como Neon e Vercel contam a cota", () => {
    // 1000 B seria "1 KB" na base 1000 — aqui ainda é bytes.
    expect(formatarBytes(1000)).toBe("1.000 B");
    expect(formatarBytes(1024)).toBe("1,0 KB");
  });

  it("uma casa abaixo de 10, nenhuma acima", () => {
    expect(formatarBytes(1024 * 1.5)).toBe("1,5 KB");
    expect(formatarBytes(1024 * 42)).toBe("42 KB");
  });

  it("escala até GB", () => {
    expect(formatarBytes(512 * 1024 * 1024)).toBe("512 MB");
    expect(formatarBytes(1024 * 1024 * 1024)).toBe("1,0 GB");
  });

  it("zero e valores inválidos não viram NaN nem -Infinity", () => {
    expect(formatarBytes(0)).toBe("0 B");
    expect(formatarBytes(-5)).toBe("0 B");
    expect(formatarBytes(Number.NaN)).toBe("0 B");
  });
});

/**
 * A quebra por pasta é o que responde "o que está ocupando espaço". A regra
 * (primeiro segmento do caminho) espelha como o código grava: orcamentos/<id>/…
 * e avatares/<userId>.<ext>.
 */
function agruparPorPasta(arquivos: { pathname: string; size: number }[]) {
  const mapa = new Map<string, { bytes: number; arquivos: number }>();
  for (const a of arquivos) {
    const pasta = a.pathname.includes("/") ? a.pathname.split("/")[0] : "(raiz)";
    const atual = mapa.get(pasta) ?? { bytes: 0, arquivos: 0 };
    atual.bytes += a.size;
    atual.arquivos += 1;
    mapa.set(pasta, atual);
  }
  return [...mapa.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.bytes - a.bytes);
}

describe("agrupamento do Blob por pasta", () => {
  it("soma por primeiro segmento e ordena pelo maior", () => {
    const r = agruparPorPasta([
      { pathname: "orcamentos/abc/1-nota.pdf", size: 300 },
      { pathname: "orcamentos/def/2-foto.jpg", size: 500 },
      { pathname: "avatares/u1.jpg", size: 100 },
    ]);
    expect(r).toEqual([
      { nome: "orcamentos", bytes: 800, arquivos: 2 },
      { nome: "avatares", bytes: 100, arquivos: 1 },
    ]);
  });

  it("arquivo solto na raiz não some da conta", () => {
    const r = agruparPorPasta([{ pathname: "solto.txt", size: 10 }]);
    expect(r).toEqual([{ nome: "(raiz)", bytes: 10, arquivos: 1 }]);
  });
});
