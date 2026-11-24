"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardCheck, FlaskConical } from "lucide-react";
import { Alert } from "@/components/ui";
import type { DadosProjeto } from "@/lib/engenharia/tipos";
import { novaZona, riscoVazio, soEntrada, type DadosRisco, type EstruturaRisco, type LinhaRisco, type ZonaRisco } from "@/lib/engenharia/risco/tipos";
import { calcularRisco } from "@/lib/engenharia/risco/motor";
import { pendenciasRisco, statusEtapasRisco, type EtapaRisco } from "@/lib/engenharia/risco/pendencias";
import { fmtDataHora } from "@/lib/engenharia/formato";
import { AvisoResponsabilidade, CabecalhoProjeto, Dialogo, irParaCampo, SeloSalvo, Stepper, toast, Toasts, type EtapaDef } from "../comum";
import { useFerramenta } from "../useFerramenta";
import { EtapaEstrutura } from "./EtapaEstrutura";
import { EtapaLinhas } from "./EtapaLinhas";
import { EtapaZonas } from "./EtapaZonas";
import { EtapaParametros } from "./EtapaParametros";
import { EtapaResultados } from "./EtapaResultados";
import { ReguaRisco } from "./ReguaRisco";

const ROTULOS: Record<EtapaRisco, string> = {
  estrutura: "Estrutura",
  linhas: "Linhas",
  zonas: "Zonas",
  parametros: "Parâmetros",
  resultados: "Resultados",
};
const ORDEM: EtapaRisco[] = ["estrutura", "linhas", "zonas", "parametros", "resultados"];

/** Completa campos que um projeto salvo numa versão anterior não tinha. */
function normalizar(d: DadosRisco | null): DadosRisco {
  const base = riscoVazio();
  if (!d) return base;
  return {
    ...base,
    ...d,
    estrutura: { ...base.estrutura, ...d.estrutura },
    linhas: (d.linhas ?? []).map((l) => ({ ...l, condutores: l.condutores ?? (l.tipo === "energia" ? 4 : 2) })),
    zonas: (d.zonas ?? []).map((z, i) => {
      const nz = novaZona(i + 1);
      return { ...nz, ...z, perdas: { ...nz.perdas, ...z.perdas }, L1: { ...nz.L1, ...z.L1 }, L3: { ...nz.L3, ...z.L3 }, L4: { ...nz.L4, ...z.L4 } };
    }),
  };
}

function temMedidas(d: DadosRisco): string[] {
  const m: string[] = [];
  if (d.estrutura.PB !== "sem-spda") m.push("SPDA");
  if (d.estrutura.PEB !== "sem") m.push("DPS classe I");
  if (d.zonas.some((z) => z.energia.PSPD !== "sem" || z.sinal.PSPD !== "sem")) m.push("DPS coordenado");
  if (d.zonas.some((z) => z.PTA !== "nenhuma" || z.PTU !== "nenhuma")) m.push("proteção contra toque/passo");
  return m;
}

export function AnaliseRisco({ projetoId, dados, inicial, salvoEm }: { projetoId: string; dados: DadosProjeto; inicial: DadosRisco | null; salvoEm: string }) {
  const f = useFerramenta<DadosRisco>({ projetoId, chave: "risco", inicial: normalizar(inicial), salvoEm });
  const d = f.valor;
  const [etapa, setEtapa] = useState<EtapaRisco>("estrutura");
  const [verPendencias, setVerPendencias] = useState(false);
  const [gerando, setGerando] = useState<"pdf" | "docx" | null>(null);

  const entrada = useMemo(() => soEntrada(d), [d]);
  const resultado = useMemo(() => calcularRisco(entrada), [entrada]);
  const pendencias = useMemo(() => pendenciasRisco(entrada), [entrada]);
  const status = useMemo(() => statusEtapasRisco(entrada), [entrada]);
  const preliminar = useMemo(() => (d.preliminar ? calcularRisco(d.preliminar.entrada) : null), [d.preliminar]);
  const desatualizada = d.analise != null && JSON.stringify(d.analise.entrada) !== JSON.stringify(entrada);

  const { setValor } = f;
  const setEstrutura = useCallback((p: Partial<EstruturaRisco>) => setValor((v) => ({ ...v, estrutura: { ...v.estrutura, ...p } })), [setValor]);
  const setLinhas = useCallback((fn: (l: LinhaRisco[]) => LinhaRisco[]) => setValor((v) => ({ ...v, linhas: fn(v.linhas) })), [setValor]);
  const setZonas = useCallback((fn: (z: ZonaRisco[]) => ZonaRisco[]) => setValor((v) => ({ ...v, zonas: fn(v.zonas) })), [setValor]);

  const etapas: EtapaDef<EtapaRisco>[] = ORDEM.map((id) => ({
    id,
    rotulo: ROTULOS[id],
    status: id === "resultados" ? "resultado" : status[id],
    bloqueada: id === "resultados" && pendencias.length > 0,
  }));

  const ir = (e: EtapaRisco) => {
    if (e === "resultados" && pendencias.length) {
      setVerPendencias(true);
      return;
    }
    setEtapa(e);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = ORDEM.indexOf(etapa);

  function analisePreliminar() {
    if (pendencias.length) return setVerPendencias(true);
    const medidas = temMedidas(d);
    f.setValor((v) => ({ ...v, preliminar: { em: new Date().toISOString(), entrada: soEntrada(v) } }));
    toast(
      medidas.length
        ? `Análise preliminar registrada — atenção: a entrada já tem ${medidas.join(", ")}.`
        : "Análise preliminar registrada. Agora ajuste as medidas de proteção e use Analisar.",
      medidas.length ? "info" : "ok",
    );
  }

  function analisar() {
    if (pendencias.length) return setVerPendencias(true);
    f.setValor((v) => ({ ...v, analise: { em: new Date().toISOString(), entrada: soEntrada(v) } }));
    setEtapa("resultados");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function baixar(formato: "pdf" | "docx") {
    setGerando(formato);
    try {
      const m = await import("@/lib/engenharia/laudos/baixar");
      await m.baixarLaudoRisco(dados, d, formato);
    } catch (e) {
      console.error(e);
      toast("Não foi possível gerar o laudo.", "erro");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div>
      <CabecalhoProjeto projetoId={projetoId} dados={dados} ferramenta="Análise de Risco — NBR 5419-2:2026" estado={<SeloSalvo estado={f.estado} salvoEm={f.salvoEm} onSalvar={f.salvar} />} />

      {f.rascunho && (
        <Alert tone="amber" className="mt-4" titulo="Há um rascunho não salvo.">
          Alterações de {fmtDataHora(f.rascunho.em)} ficaram só neste navegador.{" "}
          <button type="button" className="btn-link" onClick={f.recuperar}>
            Recuperar
          </button>{" "}
          ·{" "}
          <button type="button" className="btn-link" onClick={f.descartar}>
            Descartar
          </button>
        </Alert>
      )}

      <div className="mt-6">
        <Stepper etapas={etapas} atual={etapa} onIr={ir} />
      </div>

      <div className="mt-6">
        {etapa === "estrutura" && <EtapaEstrutura e={d.estrutura} set={setEstrutura} />}
        {etapa === "linhas" && <EtapaLinhas linhas={d.linhas} setLinhas={setLinhas} resultado={resultado} />}
        {etapa === "zonas" && <EtapaZonas e={d.estrutura} setEstrutura={setEstrutura} zonas={d.zonas} setZonas={setZonas} />}
        {etapa === "parametros" && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gta-indigo/30 bg-indigo-50/60 p-4 dark:border-indigo-500/40 dark:bg-indigo-900/20">
              <div className="min-w-0 flex-1 text-sm">
                <strong>Fluxo:</strong> com a estrutura ainda sem proteção, registre a <em>análise preliminar</em>; depois adote as medidas (SPDA, DPS, blindagens) e use{" "}
                <em>Analisar</em> para comparar.
                <div className="hint mt-1">
                  {d.preliminar ? `Preliminar registrada em ${fmtDataHora(d.preliminar.em)}.` : "Nenhuma preliminar registrada."}{" "}
                  {d.analise ? `Última análise em ${fmtDataHora(d.analise.em)}.` : ""}
                </div>
              </div>
              <button type="button" className="btn-secondary" onClick={analisePreliminar}>
                <FlaskConical className="h-4 w-4" /> Análise preliminar
              </button>
              <button type="button" className="btn-primary" onClick={analisar}>
                <ClipboardCheck className="h-4 w-4" /> Analisar
              </button>
            </div>
            <EtapaParametros zonas={d.zonas} linhas={d.linhas} setZonas={setZonas} resultado={resultado} />
          </>
        )}
        {etapa === "resultados" && <EtapaResultados dados={d} resultado={resultado} preliminar={preliminar} gerando={gerando} onBaixar={baixar} desatualizada={desatualizada} />}
      </div>

      <div className="mt-8 flex justify-between">
        <button type="button" className="btn-secondary" disabled={idx === 0} onClick={() => ir(ORDEM[idx - 1])}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {idx < ORDEM.length - 1 && (
          <button type="button" className="btn-primary" onClick={() => ir(ORDEM[idx + 1])}>
            Avançar <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <AvisoResponsabilidade />

      <Dialogo aberto={verPendencias} titulo={`Faltam ${pendencias.length} ${pendencias.length === 1 ? "dado" : "dados"} para calcular`} onFechar={() => setVerPendencias(false)}>
        <ul className="space-y-1.5">
          {pendencias.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                className="btn-link text-left"
                onClick={() => {
                  setVerPendencias(false);
                  setEtapa(p.etapa);
                  irParaCampo(p.campo);
                }}
              >
                <span className="badge badge-slate mr-2">{ROTULOS[p.etapa]}</span>
                {p.texto}
              </button>
            </li>
          ))}
        </ul>
      </Dialogo>

      <ReguaRisco resultado={resultado} pendencias={pendencias.length} />
      <Toasts />
    </div>
  );
}
