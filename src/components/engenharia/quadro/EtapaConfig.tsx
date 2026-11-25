"use client";

import { Calculator, Zap } from "lucide-react";
import { SectionCard, Segmented } from "@/components/ui";
import { ORIGENS_QUEDA, LIMITE_TERMINAL, type CaboTrecho, type ConfigQuadro } from "@/lib/engenharia/quadro/tipos";
import { tensoes, type ResultadoOrigem, type ResultadoQuadros } from "@/lib/engenharia/quadro/motor";
import { secoesDe } from "@/lib/engenharia/quadro/tabelas";
import { fmtNum } from "@/lib/engenharia/formato";
import { NumInput, Rotulo } from "../comum";

export const campoQuadro = {
  config: (k: string) => `q-config-${k}`,
  circ: (id: string, k: string) => `q-circ-${id}-${k}`,
};

export function EtapaConfig({
  cfg,
  set,
  origem,
  quedaOrigem,
}: {
  cfg: ConfigQuadro;
  set: (p: Partial<ConfigQuadro>) => void;
  origem: ResultadoOrigem;
  quedaOrigem: ResultadoQuadros["quedaOrigem"];
}) {
  const { U0, UL } = tensoes(cfg.tensao);
  const limite = ORIGENS_QUEDA.find((o) => o.id === cfg.origemQueda);
  const setCabo = (p: Partial<CaboTrecho>) => set({ caboOrigem: { ...cfg.caboOrigem, ...p } });

  return (
    <div className="space-y-6">
      <SectionCard title="Tensão e aterramento" subtitle="Valem para todos os quadros do projeto.">
        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <span className="field-label">Classe de tensão</span>
            <Segmented
              value={cfg.tensao}
              onChange={(v) => set({ tensao: v })}
              options={[
                { value: "127/220", label: "127/220 V" },
                { value: "220/380", label: "220/380 V" },
              ]}
            />
            <p className="mt-1 hint">Monofásico em {U0} V; bifásico e trifásico em {UL} V.</p>
          </div>
          <div>
            <span className="field-label">Esquema de aterramento</span>
            <Segmented
              value={cfg.esquema}
              onChange={(v) => set({ esquema: v })}
              options={[
                { value: "TN-S", label: "TN-S" },
                { value: "TT", label: "TT" },
              ]}
            />
            <p className="mt-1 hint">{cfg.esquema === "TN-S" ? "Seccionamento pelo disjuntor ou DR: Zs × Ia ≤ U0 (5.1.2.2.4.2)." : "Exige DR: RA × IΔn ≤ UL (5.1.2.2.4.3)."}</p>
          </div>
          <div>
            <span className="field-label">Situação (Anexo C)</span>
            <Segmented
              value={String(cfg.situacao) as "1" | "2"}
              onChange={(v) => set({ situacao: v === "2" ? 2 : 1 })}
              options={[
                { value: "1", label: "Situação 1" },
                { value: "2", label: "Situação 2" },
              ]}
            />
            <p className="mt-1 hint">Situação 2: áreas externas, molhadas, canteiros (UL = 25 V).</p>
          </div>
          {cfg.esquema === "TT" && (
            <div>
              <label htmlFor={campoQuadro.config("RA")} className="field-label">
                <Rotulo simbolo="RA" nome="Resistência de aterramento das massas" />
              </label>
              <NumInput id={campoQuadro.config("RA")} value={cfg.RA} min={0} sufixo="Ω" onChange={(v) => set({ RA: v })} />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Curto-circuito na origem" subtitle="Ik máximo presumido no barramento de onde saem os alimentadores dos quadros.">
        <Segmented
          value={cfg.ikModo}
          onChange={(v) => set({ ikModo: v })}
          options={[
            { value: "manual", label: <span className="inline-flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Informar Ik</span> },
            { value: "calculado", label: <span className="inline-flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" /> Calcular pelo transformador</span> },
          ]}
        />
        {cfg.ikModo === "manual" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={campoQuadro.config("ik")} className="field-label">
                <Rotulo simbolo="Ik" nome="Ik máximo presumido" />
              </label>
              <NumInput id={campoQuadro.config("ik")} value={cfg.ikManual} min={0} sufixo="kA" onChange={(v) => set({ ikManual: v })} />
            </div>
            <div>
              <label htmlFor={campoQuadro.config("cos")} className="field-label">
                <Rotulo simbolo="cos φcc" nome="Fator de potência de curto" />
              </label>
              <NumInput id={campoQuadro.config("cos")} value={cfg.cosCc} min={0.05} max={1} onChange={(v) => set({ cosCc: v ?? 0.3 })} />
              <p className="mt-1 hint">Típico 0,2 a 0,4 junto ao transformador.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div className="subcard space-y-3">
              <div className="font-semibold">Transformador</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor={campoQuadro.config("kva")} className="field-label">Potência</label>
                  <NumInput id={campoQuadro.config("kva")} value={cfg.trafo.kva} min={0} sufixo="kVA" onChange={(v) => set({ trafo: { ...cfg.trafo, kva: v } })} />
                </div>
                <div>
                  <label htmlFor={campoQuadro.config("z")} className="field-label">Impedância Z%</label>
                  <NumInput id={campoQuadro.config("z")} value={cfg.trafo.z} min={0} sufixo="%" onChange={(v) => set({ trafo: { ...cfg.trafo, z: v } })} />
                </div>
                <div>
                  <label htmlFor="q-pk" className="field-label">Perdas no cobre</label>
                  <NumInput id="q-pk" value={cfg.trafo.pk} min={0} sufixo="W" placeholder="opcional" onChange={(v) => set({ trafo: { ...cfg.trafo, pk: v } })} />
                </div>
              </div>
              <p className="hint">Sem as perdas no cobre, a resistência do trafo é estimada por cos φcc = {fmtNum(cfg.cosCc)}.</p>
            </div>
            <div className="subcard space-y-3">
              <div className="font-semibold">Cabo do transformador até a origem</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="q-co-mat" className="field-label">Material</label>
                  <select id="q-co-mat" className="field-input" value={cfg.caboOrigem.material} onChange={(e) => setCabo({ material: e.target.value as CaboTrecho["material"], secao: null })}>
                    <option value="Cu">Cobre</option>
                    <option value="Al">Alumínio</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="q-co-iso" className="field-label">Isolação</label>
                  <select id="q-co-iso" className="field-input" value={cfg.caboOrigem.isolacao} onChange={(e) => setCabo({ isolacao: e.target.value as CaboTrecho["isolacao"] })}>
                    <option value="PVC">PVC (70 °C)</option>
                    <option value="EPR">EPR (90 °C)</option>
                    <option value="XLPE">XLPE (90 °C)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="q-co-comp" className="field-label">Comprimento</label>
                  <NumInput id="q-co-comp" value={cfg.caboOrigem.comprimento} min={0} sufixo="m" onChange={(v) => setCabo({ comprimento: v })} />
                </div>
                <div>
                  <label htmlFor="q-co-sec" className="field-label">Seção por fase</label>
                  <select id="q-co-sec" className="field-input" value={cfg.caboOrigem.secao ?? ""} onChange={(e) => setCabo({ secao: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">—</option>
                    {secoesDe(cfg.caboOrigem.material).map((s) => (
                      <option key={s} value={s}>
                        {fmtNum(s)} mm²
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="q-co-n" className="field-label">Condutores por fase</label>
                  <NumInput id="q-co-n" value={cfg.caboOrigem.condutoresPorFase} min={1} max={12} onChange={(v) => setCabo({ condutoresPorFase: Math.max(1, Math.round(v ?? 1)) })} />
                </div>
              </div>
              <p className="hint">R de catálogo (NBR NM 280) e X típica; sem comprimento, o quadro fica junto ao trafo.</p>
            </div>
            <div className="lg:col-span-2">
              {origem.trafo ? (
                <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-900/50">
                  <div>
                    <div className="hint">In do transformador</div>
                    <div className="font-semibold">{fmtNum(origem.trafo.In, 1)} A</div>
                  </div>
                  <div>
                    <div className="hint">Ik nos terminais</div>
                    <div className="font-semibold">{fmtNum(origem.trafo.ik, 2)} kA</div>
                  </div>
                  <div>
                    <div className="hint">Ik na origem</div>
                    <div className="font-semibold text-gta-indigo dark:text-indigo-300">{fmtNum(origem.ikMax, 2)} kA</div>
                  </div>
                  <div>
                    <div className="hint">cos φ de curto</div>
                    <div className="font-semibold">{fmtNum(origem.cosCc, 3)}</div>
                  </div>
                </div>
              ) : (
                <p className="hint">Informe potência e impedância do transformador.</p>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Limite de queda de tensão" subtitle="6.2.7 — a queda acumulada até qualquer ponto de utilização é verificada contra o limite da origem; o circuito terminal, contra 4%.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label htmlFor="q-origem-queda" className="field-label">Origem da instalação</label>
            <select id="q-origem-queda" className="field-input" value={cfg.origemQueda} onChange={(e) => set({ origemQueda: e.target.value as ConfigQuadro["origemQueda"] })}>
              {ORIGENS_QUEDA.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo} — {o.limite}% ({o.ref})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-4 text-sm">
            <div>
              <div className="hint">Limite global</div>
              <div className="text-lg font-bold">{limite?.limite}%</div>
            </div>
            <div>
              <div className="hint">Circuito terminal</div>
              <div className="text-lg font-bold">{LIMITE_TERMINAL}%</div>
            </div>
          </div>
        </div>
        {quedaOrigem && (
          <p className="mt-3 hint">
            Cabo do transformador até a origem: queda de {fmtNum(quedaOrigem.dv, 2)}% com a demanda de todos os quadros (Ib = {fmtNum(quedaOrigem.Ib, 1)} A), somada à de cada alimentador.
          </p>
        )}
      </SectionCard>

      <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800">
        <strong>Resumo:</strong> {cfg.tensao} V · {cfg.esquema} · situação {cfg.situacao} · Ik na origem {origem.ikMax != null ? `${fmtNum(origem.ikMax, 2)} kA` : "não informado"}
        {origem.cosCc != null ? ` (cos φ ${fmtNum(origem.cosCc, 2)})` : ""} · queda máxima {limite?.limite}% (terminal {LIMITE_TERMINAL}%)
      </p>
    </div>
  );
}
