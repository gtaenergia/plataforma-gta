import type { DadosQuadro } from "./tipos";
import { potenciaCircuito } from "./motor";

export type EtapaQuadro = "config" | "circuitos" | "choques" | "resultados";

export interface PendenciaQuadro {
  etapa: EtapaQuadro;
  campo: string;
  texto: string;
  quadroId?: string;
  circuitoId?: string | "geral";
}

const falta = (v: number | null | undefined) => !(typeof v === "number" && Number.isFinite(v) && v > 0);

export function pendenciasQuadro(d: DadosQuadro): PendenciaQuadro[] {
  const out: PendenciaQuadro[] = [];
  const c = d.config;
  if (c.ikModo === "manual" && falta(c.ikManual)) out.push({ etapa: "config", campo: "q-config-ik", texto: "Ik máximo presumido na origem" });
  if (c.ikModo === "calculado") {
    if (falta(c.trafo.kva)) out.push({ etapa: "config", campo: "q-config-kva", texto: "Potência do transformador" });
    if (falta(c.trafo.z)) out.push({ etapa: "config", campo: "q-config-z", texto: "Impedância percentual do transformador" });
  }
  if (c.esquema === "TT" && falta(c.RA)) out.push({ etapa: "config", campo: "q-config-RA", texto: "Resistência de aterramento RA (esquema TT)" });

  for (const q of d.quadros) {
    if (falta(q.geral.comprimento)) out.push({ etapa: "circuitos", campo: "q-circ-geral-comp", texto: `${q.nome}: comprimento do alimentador (GERAL)`, quadroId: q.id, circuitoId: "geral" });
    const comCarga = q.circuitos.filter((x) => !x.reserva && potenciaCircuito(x, q).P > 0);
    if (!comCarga.length) out.push({ etapa: "circuitos", campo: "q-ativo", texto: `${q.nome}: nenhum circuito com carga`, quadroId: q.id });
    for (const x of q.circuitos) {
      if (x.reserva) continue;
      if (!(potenciaCircuito(x, q).P > 0)) out.push({ etapa: "circuitos", campo: `q-circ-${x.id}-comp-tab`, texto: `${q.nome} · ${x.tag}: carga do circuito`, quadroId: q.id });
      if (falta(x.comprimento)) out.push({ etapa: "circuitos", campo: `q-circ-${x.id}-comp-tab`, texto: `${q.nome} · ${x.tag}: comprimento do circuito`, quadroId: q.id });
    }
  }
  return out;
}
