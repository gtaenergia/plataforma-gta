import { describe, expect, it } from "vitest";
import { excedentePorDia, segmentarSemana, type Intervalo } from "@/lib/calendario/faixas";
import { somarDias, type Ymd } from "@/lib/capacidade/datas";

/** Semana de domingo (2026-07-05) a sábado (2026-07-11). */
const SEMANA: Ymd[] = Array.from({ length: 7 }, (_, i) => somarDias("2026-07-05", i));

interface Tarefa extends Intervalo {
  nome: string;
}
const t = (nome: string, inicio: Ymd, fim: Ymd): Tarefa => ({ nome, inicio, fim });
const porNome = (a: Tarefa, b: Tarefa) => a.nome.localeCompare(b.nome);

describe("segmentarSemana", () => {
  it("ignora o que não toca a semana", () => {
    const fora = [t("antes", "2026-06-01", "2026-07-04"), t("depois", "2026-07-12", "2026-07-20")];
    expect(segmentarSemana(fora, SEMANA)).toEqual([]);
  });

  it("encosta na borda sem entrar", () => {
    // Terminar no sábado anterior ou começar no domingo seguinte é "fora";
    // terminar no próprio domingo da semana é "dentro" — o erro de um dia aqui
    // some ou duplica a barra na virada do mês.
    expect(segmentarSemana([t("x", "2026-06-20", "2026-07-05")], SEMANA)).toHaveLength(1);
    expect(segmentarSemana([t("x", "2026-06-20", "2026-07-04")], SEMANA)).toHaveLength(0);
    expect(segmentarSemana([t("x", "2026-07-11", "2026-07-30")], SEMANA)).toHaveLength(1);
    expect(segmentarSemana([t("x", "2026-07-12", "2026-07-30")], SEMANA)).toHaveLength(0);
  });

  it("um dia só vira um segmento de largura 1, fechado dos dois lados", () => {
    const [s] = segmentarSemana([t("x", "2026-07-08", "2026-07-08")], SEMANA);
    expect(s).toMatchObject({ col: 3, span: 1, abre: true, fecha: true, faixa: 0 });
  });

  it("recorta o pedaço que vem de antes da semana", () => {
    const [s] = segmentarSemana([t("x", "2026-06-29", "2026-07-08")], SEMANA);
    // começa no domingo da grade, não na data real
    expect(s).toMatchObject({ col: 0, span: 4, abre: false, fecha: true });
  });

  it("recorta o pedaço que segue depois da semana", () => {
    const [s] = segmentarSemana([t("x", "2026-07-09", "2026-07-25")], SEMANA);
    expect(s).toMatchObject({ col: 4, span: 3, abre: true, fecha: false });
  });

  it("atravessa a semana inteira sem abrir nem fechar", () => {
    const [s] = segmentarSemana([t("x", "2026-06-01", "2026-08-30")], SEMANA);
    expect(s).toMatchObject({ col: 0, span: 7, abre: false, fecha: false });
  });

  it("o mesmo intervalo longo aparece em semanas seguidas, e só fecha na última", () => {
    const longa = t("x", "2026-07-08", "2026-07-15");
    const proxima = Array.from({ length: 7 }, (_, i) => somarDias("2026-07-12", i));
    const [a] = segmentarSemana([longa], SEMANA);
    const [b] = segmentarSemana([longa], proxima);
    expect(a).toMatchObject({ abre: true, fecha: false });
    expect(b).toMatchObject({ abre: false, fecha: true, col: 0, span: 4 });
  });

  it("quem divide um dia nunca fica na mesma faixa", () => {
    const segs = segmentarSemana(
      [t("a", "2026-07-05", "2026-07-08"), t("b", "2026-07-07", "2026-07-10"), t("c", "2026-07-06", "2026-07-11")],
      SEMANA,
      porNome,
    );
    const faixaDe = new Map(segs.map((s) => [s.item.nome, s.faixa]));
    expect(new Set(faixaDe.values()).size).toBe(3);
  });

  it("reaproveita a faixa quando o dia não é compartilhado", () => {
    const segs = segmentarSemana(
      [t("a", "2026-07-05", "2026-07-06"), t("b", "2026-07-07", "2026-07-08")],
      SEMANA,
      porNome,
    );
    expect(segs.map((s) => s.faixa)).toEqual([0, 0]);
  });

  it("encostar não é sobrepor: terminar num dia e o outro começar no seguinte cabe na mesma faixa", () => {
    const segs = segmentarSemana(
      [t("a", "2026-07-05", "2026-07-07"), t("b", "2026-07-08", "2026-07-09")],
      SEMANA,
      porNome,
    );
    expect(segs.map((s) => s.faixa)).toEqual([0, 0]);
    // ...mas terminar e começar NO MESMO dia, não.
    const juntos = segmentarSemana(
      [t("a", "2026-07-05", "2026-07-07"), t("b", "2026-07-07", "2026-07-09")],
      SEMANA,
      porNome,
    );
    expect(juntos.map((s) => s.faixa)).toEqual([0, 1]);
  });

  it("a ordem é determinística: mesma entrada embaralhada, mesmo desenho", () => {
    const itens = [
      t("a", "2026-07-06", "2026-07-09"),
      t("b", "2026-07-06", "2026-07-09"),
      t("c", "2026-07-05", "2026-07-11"),
      t("d", "2026-07-08", "2026-07-08"),
    ];
    const chave = (xs: Tarefa[]) =>
      segmentarSemana(xs, SEMANA, porNome).map((s) => `${s.item.nome}:${s.faixa}:${s.col}:${s.span}`).join("|");
    expect(chave([...itens].reverse())).toBe(chave(itens));
    expect(chave([itens[2], itens[0], itens[3], itens[1]])).toBe(chave(itens));
  });

  it("nenhum segmento sai da semana", () => {
    const itens = [
      t("a", "2026-01-01", "2026-12-31"),
      t("b", "2026-07-11", "2026-07-11"),
      t("c", "2026-07-05", "2026-07-05"),
    ];
    for (const s of segmentarSemana(itens, SEMANA, porNome)) {
      expect(s.col).toBeGreaterThanOrEqual(0);
      expect(s.span).toBeGreaterThanOrEqual(1);
      expect(s.col + s.span).toBeLessThanOrEqual(7);
    }
  });
});

describe("excedentePorDia", () => {
  it("conta por dia só o que passou do limite de faixas", () => {
    // 3 intervalos cobrindo os mesmos dias => faixas 0,1,2
    const segs = segmentarSemana(
      [t("a", "2026-07-06", "2026-07-08"), t("b", "2026-07-06", "2026-07-08"), t("c", "2026-07-06", "2026-07-08")],
      SEMANA,
      porNome,
    );
    // com 2 faixas visíveis, sobra 1 em cada um dos 3 dias (colunas 1,2,3)
    expect(excedentePorDia(segs, 2)).toEqual([0, 1, 1, 1, 0, 0, 0]);
    expect(excedentePorDia(segs, 3)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
