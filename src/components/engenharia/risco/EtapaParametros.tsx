"use client";

import { SectionCard } from "@/components/ui";
import {
  FT,
  HZ,
  KS3,
  LF_L1,
  LF_L3,
  LF_L4,
  LO_L1,
  LO_L4,
  LT_L1,
  LT_L4,
  PSPD,
  PTA,
  PTU,
  RF,
  RP,
  RT_PISO,
  valor,
} from "@/lib/engenharia/risco/tabelas";
import type { LinhaRisco, TipoLinha, ZonaRisco } from "@/lib/engenharia/risco/tipos";
import { META_RISCO, type ResultadoRisco } from "@/lib/engenharia/risco/motor";
import { campoRisco } from "@/lib/engenharia/risco/pendencias";
import { fmtCient, fmtFreq, fmtNum, fmtRisco } from "@/lib/engenharia/formato";
import { CampoParametro, NumInput, Rotulo } from "../comum";

export function EtapaParametros({
  zonas,
  linhas,
  setZonas,
  resultado,
}: {
  zonas: ZonaRisco[];
  linhas: LinhaRisco[];
  setZonas: (fn: (z: ZonaRisco[]) => ZonaRisco[]) => void;
  resultado: ResultadoRisco;
}) {
  const set = (id: string, patch: Partial<ZonaRisco>) => setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const tipos = (["energia", "sinal"] as TipoLinha[]).filter((t) => linhas.some((l) => l.tipo === t));

  return (
    <div className="space-y-6">
      {zonas.map((z) => {
        const r = resultado.zonas.find((x) => x.id === z.id);
        const ct4 = (z.L4.ca ?? 0) + (z.L4.cb ?? 0) + (z.L4.cc ?? 0) + (z.L4.cs ?? 0);
        return (
          <SectionCard key={z.id} title={z.nome} subtitle={`Perdas avaliadas: ${(["L1", "L3", "L4", "F"] as const).filter((k) => z.perdas[k]).join(", ") || "nenhuma"}`}>
            <h3 className="text-sm font-semibold text-gta-navy dark:text-slate-200">Fatores da zona</h3>
            <div className="mt-2 space-y-4">
              <CampoParametro param={RT_PISO} value={z.rt} onChange={(v) => set(z.id, { rt: v })} />
              <CampoParametro param={PTA} value={z.PTA} onChange={(v) => set(z.id, { PTA: v })} />
              <CampoParametro param={PTU} value={z.PTU} onChange={(v) => set(z.id, { PTU: v })} />
              <CampoParametro param={RF} value={z.rf} onChange={(v) => set(z.id, { rf: v })} />
              <div>
                <CampoParametro param={RP} value={z.rp} onChange={(v) => set(z.id, { rp: v })} />
                {r && r.rp !== valor(RP, z.rp) && (
                  <p className="mt-1 hint text-amber-700 dark:text-amber-400">Estrutura com risco de explosão: o cálculo adota rp = 1 (C.3.4 e Tabela C.4).</p>
                )}
              </div>
              <CampoParametro param={HZ} value={z.hz} onChange={(v) => set(z.id, { hz: v })} />
              <div>
                <span className="field-label">
                  <Rotulo simbolo="KS2" nome="Blindagem espacial interna (ZPR X/Y)" refNorma="B.4.12" />
                </span>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={z.semBlindagemKs2} onChange={(ev) => set(z.id, { semBlindagemKs2: ev.target.checked })} />
                    Sem blindagem interna em malha (KS2 = 1)
                  </label>
                  {!z.semBlindagemKs2 && (
                    <div className="w-48">
                      <NumInput id={campoRisco.zona(z.id, "KS2")} value={z.KS2} min={0.0001} max={1} ariaLabel="KS2" onChange={(v) => set(z.id, { KS2: v })} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {tipos.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gta-navy dark:text-slate-200">Fiação interna e DPS por tipo de linha</h3>
                <div className="mt-2 space-y-4">
                  {tipos.map((t) => (
                    <div key={t} className="subcard space-y-3">
                      <div className="font-semibold">{t === "energia" ? "Linhas de energia" : "Linhas de sinal / telecom"}</div>
                      <CampoParametro param={KS3} value={z[t].KS3} onChange={(v) => set(z.id, { [t]: { ...z[t], KS3: v } })} />
                      <div>
                        <label htmlFor={`${z.id}-${t}-comp`} className="field-label">
                          Comprimento do circuito interno (KS3 é dado para 100 m)
                        </label>
                        <NumInput id={`${z.id}-${t}-comp`} value={z[t].comprimento} min={0} sufixo="m" placeholder="100 m ou mais" onChange={(v) => set(z.id, { [t]: { ...z[t], comprimento: v } })} />
                      </div>
                      <CampoParametro param={PSPD} value={z[t].PSPD} onChange={(v) => set(z.id, { [t]: { ...z[t], PSPD: v } })} />
                      {r?.prob.porTipo[t] && (
                        <p className="hint">
                          KS3 efetivo {fmtNum(r.prob.porTipo[t]!.KS3, 4)} · KS4 = 1/UW = {fmtNum(r.prob.porTipo[t]!.KS4, 3)} · PMS = {fmtCient(r.prob.porTipo[t]!.PMS)} · PM ={" "}
                          {fmtCient(r.prob.porTipo[t]!.PM)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {z.perdas.L1 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gta-navy dark:text-slate-200">Perdas — vida humana (L1)</h3>
                <div className="mt-2 space-y-4">
                  <CampoParametro param={LT_L1} value={z.L1.LT} onChange={(v) => set(z.id, { L1: { ...z.L1, LT: v } })} />
                  <CampoParametro param={LF_L1} value={z.L1.LF} onChange={(v) => set(z.id, { L1: { ...z.L1, LF: v } })} />
                  <CampoParametro param={LO_L1} value={z.L1.LO} onChange={(v) => set(z.id, { L1: { ...z.L1, LO: v } })} />
                </div>
                <p className="mt-1 hint">RC, RM, RW e RZ só entram em R1 em estruturas com risco de explosão ou onde a falha de sistemas põe vidas em risco (nota de 4.3.1).</p>
              </>
            )}

            {z.perdas.L3 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gta-navy dark:text-slate-200">Perdas — patrimônio cultural (L3)</h3>
                <div className="mt-2 space-y-4">
                  <CampoParametro param={LF_L3} value={z.L3.LF} onChange={(v) => set(z.id, { L3: { ...z.L3, LF: v } })} />
                  <div>
                    <label htmlFor={campoRisco.zona(z.id, "cz")} className="field-label">
                      <Rotulo simbolo="cz" nome="Valor do patrimônio cultural na zona" refNorma="C.4" />
                    </label>
                    <NumInput id={campoRisco.zona(z.id, "cz")} value={z.L3.cz} min={0} sufixo="mi R$" onChange={(v) => set(z.id, { L3: { ...z.L3, cz: v } })} />
                  </div>
                </div>
              </>
            )}

            {z.perdas.L4 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gta-navy dark:text-slate-200">Perdas — valor econômico (L4)</h3>
                <div className="mt-2 space-y-4">
                  <CampoParametro param={LT_L4} value={z.L4.LT} onChange={(v) => set(z.id, { L4: { ...z.L4, LT: v } })} />
                  <CampoParametro param={LF_L4} value={z.L4.LF} onChange={(v) => set(z.id, { L4: { ...z.L4, LF: v } })} />
                  <CampoParametro param={LO_L4} value={z.L4.LO} onChange={(v) => set(z.id, { L4: { ...z.L4, LO: v } })} />
                </div>
                <div id={campoRisco.zona(z.id, "L4")} className="mt-3 grid gap-4 sm:grid-cols-5">
                  {(
                    [
                      ["ca", "Animais"],
                      ["cb", "Edificação"],
                      ["cc", "Conteúdo"],
                      ["cs", "Sistemas internos"],
                    ] as const
                  ).map(([k, nome]) => (
                    <div key={k}>
                      <label className="field-label" htmlFor={`${z.id}-${k}`}>
                        <Rotulo simbolo={k} nome={nome} />
                      </label>
                      <NumInput id={`${z.id}-${k}`} value={z.L4[k]} min={0} sufixo="mi R$" onChange={(v) => set(z.id, { L4: { ...z.L4, [k]: v } })} />
                    </div>
                  ))}
                  <div>
                    <span className="field-label">
                      <Rotulo simbolo="ct" nome="Total da zona" />
                    </span>
                    <div className="field-input bg-slate-50 font-semibold dark:bg-slate-900/40">{fmtNum(ct4, 3)} mi R$</div>
                  </div>
                </div>
              </>
            )}

            {z.perdas.F && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gta-navy dark:text-slate-200">Frequência de danos (F)</h3>
                <div className="mt-2 space-y-4">
                  <CampoParametro param={FT} value={z.FT} onChange={(v) => set(z.id, { FT: v })} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1" checked={z.equipamentosExpostos} onChange={(ev) => set(z.id, { equipamentosExpostos: ev.target.checked })} />
                    <span>
                      Há equipamentos na ZPR 0A (expostos à descarga direta, no topo da estrutura)
                      <span className="block hint">Só então FB = ND × PB entra na soma (7.1.5).</span>
                    </span>
                  </label>
                </div>
              </>
            )}

            {r && (
              <div className="mt-6 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-900/50">
                {(["R1", "R3", "R4"] as const).map((k) =>
                  r[k] ? (
                    <div key={k}>
                      <div className="hint">
                        {k} da zona — {META_RISCO[k].nome.toLowerCase()}
                      </div>
                      <div className="font-mono font-semibold">{fmtRisco(Object.values(r[k]!).reduce((s, v) => s + v, 0), META_RISCO[k].expoente)}</div>
                    </div>
                  ) : null,
                )}
                {r.F && (
                  <div>
                    <div className="hint">F da zona (FT = {fmtNum(r.F.FT)})</div>
                    <div className={`font-mono font-semibold ${r.F.excede ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{fmtFreq(r.F.total)}</div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
