import { describe, expect, it } from "vitest";
import {
  duracaoOcupada,
  posicionarDia,
  type BlocoPosicionado,
  type ItemDia,
  type OpcoesDia,
} from "@/lib/calendario/blocos-dia";

/** As mesmas medidas da grade em `AbaCalendario`. */
const GRADE: OpcoesDia = { pxPorHora: 44, alturaMinPx: 18, horaIni: 8 };

interface Lanc extends ItemDia {
  nome: string;
}
/** `l("Ligação", 10, 0, 10, 10)` = das 10:00 às 10:10. */
const l = (nome: string, h1: number, m1: number, h2: number, m2: number): Lanc => ({
  nome,
  inicioMin: h1 * 60 + m1,
  fimMin: h2 * 60 + m2,
});
const porNome = (a: Lanc, b: Lanc) => a.nome.localeCompare(b.nome);

/**
 * Os retângulos em pixels realmente se cruzam?
 *
 * É esta a asserção que importa: um teste que só olhasse faixa e horário
 * deixaria passar exatamente o defeito que existia — colisão decidida no
 * relógio, desenho feito com o piso de altura.
 */
function sobrepostos<T>(blocos: BlocoPosicionado<T>[]): [number, number][] {
  const pares: [number, number][] = [];
  for (let i = 0; i < blocos.length; i++) {
    for (let j = i + 1; j < blocos.length; j++) {
      const a = blocos[i];
      const b = blocos[j];
      const vertical = a.top < b.top + b.altura && b.top < a.top + a.altura;
      // Largura: cada faixa ocupa 1/faixas da coluna.
      const [ai, af] = [a.faixa / a.faixas, (a.faixa + 1) / a.faixas];
      const [bi, bf] = [b.faixa / b.faixas, (b.faixa + 1) / b.faixas];
      const horizontal = ai < bf - 1e-9 && bi < af - 1e-9;
      if (vertical && horizontal) pares.push([i, j]);
    }
  }
  return pares;
}

describe("duracaoOcupada", () => {
  it("converte o piso de altura para minutos de tela", () => {
    // 18px com a hora valendo 44px = 24,5 min ocupados por um bloco mínimo.
    expect(duracaoOcupada(GRADE)).toBeCloseTo(24.545, 2);
  });
});

describe("posicionarDia", () => {
  it("não sobrepõe lançamentos curtos e consecutivos", () => {
    // A regressão: quatro atendimentos de ~10 min, encostados. No relógio
    // nenhum cruza o outro, mas na tela cada um ocupa 25 min.
    const blocos = posicionarDia(
      [
        l("Ligação", 10, 0, 10, 10),
        l("Retorno", 10, 10, 10, 20),
        l("Memorial", 10, 20, 10, 35),
        l("ART", 10, 35, 10, 45),
      ],
      GRADE,
      porNome,
    );
    expect(sobrepostos(blocos)).toEqual([]);
    expect(blocos.every((b) => b.faixas > 1)).toBe(true);
  });

  it("mantém largura cheia quando os lançamentos são longos e não se cruzam", () => {
    // Sem o piso interferindo, nada de dividir a coluna à toa.
    const blocos = posicionarDia([l("Manhã", 8, 0, 12, 0), l("Tarde", 13, 0, 17, 0)], GRADE);
    expect(blocos.map((b) => b.faixas)).toEqual([1, 1]);
    expect(sobrepostos(blocos)).toEqual([]);
  });

  it("divide a coluna entre lançamentos que se cruzam de verdade", () => {
    const blocos = posicionarDia([l("A", 9, 0, 12, 0), l("B", 10, 0, 11, 0)], GRADE, porNome);
    expect(blocos.map((b) => b.faixas)).toEqual([2, 2]);
    expect(blocos.map((b) => b.faixa).sort()).toEqual([0, 1]);
    expect(sobrepostos(blocos)).toEqual([]);
  });

  it("posiciona o topo a partir da primeira hora exibida", () => {
    const [bloco] = posicionarDia([l("Início", 8, 0, 9, 0)], GRADE);
    expect(bloco.top).toBe(0);
    expect(bloco.altura).toBe(44);
    const [meia] = posicionarDia([l("Meio", 9, 30, 10, 30)], GRADE);
    expect(meia.top).toBe(66); // 1h30 × 44
  });

  it("aplica o piso de altura sem mexer na duração real", () => {
    const [curto] = posicionarDia([l("Curto", 10, 0, 10, 5)], GRADE);
    expect(curto.altura).toBe(18); // 5 min seriam 3,7px
  });

  it("preserva a duração de quem vira a meia-noite", () => {
    // O chamador passa fimMin acima de 1440; a altura tem que refletir isso.
    const virada: Lanc = { nome: "Madrugada", inicioMin: 23 * 60, fimMin: 25 * 60 };
    const [bloco] = posicionarDia([virada], GRADE);
    expect(bloco.altura).toBe(2 * 44);
  });

  it("trata lançamento de duração zero como um minuto, sem altura negativa", () => {
    const [bloco] = posicionarDia([l("Instante", 10, 0, 10, 0)], GRADE);
    expect(bloco.altura).toBe(18);
    expect(bloco.top).toBeGreaterThanOrEqual(0);
  });

  it("é determinístico com o desempate, rodando duas vezes", () => {
    const itens = [l("B", 9, 0, 9, 10), l("A", 9, 0, 9, 10), l("C", 9, 0, 9, 10)];
    const um = posicionarDia(itens, GRADE, porNome).map((b) => [b.item.nome, b.faixa]);
    const dois = posicionarDia([...itens].reverse(), GRADE, porNome).map((b) => [b.item.nome, b.faixa]);
    expect(dois).toEqual(um);
  });

  it("nunca devolve NaN nem Infinity", () => {
    const blocos = posicionarDia([l("A", 8, 0, 8, 3), l("B", 8, 3, 8, 6), l("C", 12, 0, 14, 0)], GRADE);
    for (const b of blocos) {
      for (const v of [b.top, b.altura, b.faixa, b.faixas]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("devolve vazio sem lançamentos", () => {
    expect(posicionarDia([], GRADE)).toEqual([]);
  });

  it("fecha o grupo quando há folga maior que o piso", () => {
    // 10:00-10:10 e 10:40-10:50: 30 min de distância, acima dos 24,5 do piso.
    const blocos = posicionarDia([l("A", 10, 0, 10, 10), l("B", 10, 40, 10, 50)], GRADE, porNome);
    expect(blocos.map((b) => b.faixas)).toEqual([1, 1]);
    expect(sobrepostos(blocos)).toEqual([]);
  });

  it("nunca sobrepõe, em uma semana inteira de horários aleatórios", () => {
    // Varredura: o invariante tem que valer para qualquer combinação, não só
    // para os casos que eu imaginei.
    let semente = 42;
    const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let rodada = 0; rodada < 300; rodada++) {
      const itens = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => {
        const inicioMin = 8 * 60 + Math.floor(rnd() * 600);
        return { nome: `t${i}`, inicioMin, fimMin: inicioMin + Math.floor(rnd() * 120) };
      });
      expect(sobrepostos(posicionarDia(itens, GRADE, porNome)), `rodada ${rodada}`).toEqual([]);
    }
  });
});
