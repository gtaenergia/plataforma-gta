import { novaLinha, novaZona, riscoVazio, type EntradaRisco } from "@/lib/engenharia/risco/tipos";

/**
 * Caso de referência: o laudo "Projeto Pousada" gerado pela plataforma que a
 * GTA usava (NBR 5419-2:2026, emitido em 23/11/2026). Os números abaixo são
 * os do PDF — se o motor sair deles, o laudo da GTA diverge do de referência.
 */
export function pousada(comMedidas: boolean): EntradaRisco {
  const base = riscoVazio(14);
  const linha = { ...novaLinha("energia", 1), nome: "Linha de energia", LL: 1000, CE: "rural", CT: "at-trafo", CI: "aereo", UW: 2.5 };
  const z1 = {
    ...novaZona(1),
    nome: "Zona 1",
    nz: 200,
    tz: 8760,
    perdas: { L1: true, L3: false, L4: false, F: true },
    rt: "marmore-ceramica",
    PTA: comMedidas ? "descida-natural" : "nenhuma",
    rf: "incendio-normal",
    hz: "panico-baixo",
    energia: { KS3: "sem-preocupacao", comprimento: null, PSPD: comMedidas ? "III-IV" : "sem" },
    L1: { LT: "todos", LF: "hospital-hotel-escola", LO: "nao-aplicavel" },
  };
  const z2 = {
    ...novaZona(2),
    nome: "Zona 2",
    nz: 100,
    tz: 4380,
    perdas: { L1: true, L3: false, L4: false, F: false },
    rt: "terra-concreto",
    rf: "incendio-baixo",
    energia: { KS3: "lacos-medios", comprimento: null, PSPD: comMedidas ? "III-IV" : "sem" },
    L1: { LT: "todos", LF: "outros", LO: "nao-aplicavel" },
  };
  return {
    estrutura: {
      ...base.estrutura,
      L: 72,
      W: 43,
      H: 11,
      CD: "cercada-mesma-altura",
      PB: comMedidas ? "I" : "sem-spda",
      PEB: comMedidas ? "II" : "sem",
      rS: "robusta",
      nt: 300,
    },
    linhas: [linha],
    zonas: [z1, z2],
  };
}


import { novoCircuito, quadroVazio, type DadosQuadro } from "@/lib/engenharia/quadro/tipos";

/** Quadro típico de uma edificação pequena em 127/220 V, TN-S, Ik = 5 kA. */
export function quadroExemplo(): DadosQuadro {
  const d = quadroVazio();
  d.config.ikManual = 5;
  const q = d.quadros[0];
  q.nome = "QDFL-01";
  q.geral.comprimento = 25;
  const c = (n: number, p: Partial<ReturnType<typeof novoCircuito>>) => ({ ...novoCircuito(n, q.tiposCarga), ...p });
  q.circuitos = [
    c(1, { descricao: "Iluminação salão", uso: "iluminacao", quantidades: { tug: 0, ilum: 12 }, comprimento: 18, fase: "A" }),
    c(2, { descricao: "Tomadas salão", quantidades: { tug: 8, ilum: 0 }, comprimento: 22, fase: "B" }),
    c(3, { descricao: "Chuveiro", grupo: "b1", esquema: "2F+PE", fase: "AB", cargaEspecial: 5500, fp: 1, comprimento: 15 }),
    c(4, { descricao: "Ar-condicionado", grupo: "c", esquema: "2F+PE", fase: "BC", cargaEspecial: 1800, fp: 0.9, comprimento: 20 }),
    c(5, { descricao: "Bomba d'água", grupo: "d", esquema: "3F+PE", fase: "ABC", cargaEspecial: 3000, fp: 0.85, comprimento: 30 }),
    c(6, { descricao: "Reserva", reserva: true, fase: "C" }),
  ];
  return d;
}
