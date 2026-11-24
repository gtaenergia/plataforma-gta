"use client";

import { Plug, Plus, RadioTower, Trash2 } from "lucide-react";
import { EmptyState, SectionCard } from "@/components/ui";
import { BLINDAGEM, CD, CE, CI, CLD_CLI, CT, UW_VALORES } from "@/lib/engenharia/risco/tabelas";
import { novaLinha, type LinhaRisco } from "@/lib/engenharia/risco/tipos";
import type { ResultadoRisco } from "@/lib/engenharia/risco/motor";
import { campoRisco } from "@/lib/engenharia/risco/pendencias";
import { fmtCient, fmtNum, fmtParam } from "@/lib/engenharia/formato";
import { CampoParametro, NumInput, Rotulo } from "../comum";

export function EtapaLinhas({
  linhas,
  setLinhas,
  resultado,
}: {
  linhas: LinhaRisco[];
  setLinhas: (fn: (l: LinhaRisco[]) => LinhaRisco[]) => void;
  resultado: ResultadoRisco;
}) {
  const set = (id: string, patch: Partial<LinhaRisco>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const adicionar = (tipo: "energia" | "sinal") => setLinhas((ls) => [...ls, novaLinha(tipo, ls.filter((l) => l.tipo === tipo).length + 1)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="subtitle max-w-2xl">
          Linhas que entram na estrutura: energia e sinal (telefonia, dados, TV). Fibra óptica sem elemento metálico não entra na análise. Linhas com o mesmo
          roteamento podem ser representadas pela de piores características (6.4.5).
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => adicionar("energia")}>
            <Plus className="h-4 w-4" /> Linha de energia
          </button>
          <button type="button" className="btn-secondary" onClick={() => adicionar("sinal")}>
            <Plus className="h-4 w-4" /> Linha de sinal
          </button>
        </div>
      </div>

      {linhas.length === 0 && <EmptyState>Estrutura sem linhas externas conectadas. Os componentes RU, RV, RW e RZ ficam nulos.</EmptyState>}

      {linhas.map((l) => {
        const r = resultado.linhas.find((x) => x.id === l.id);
        const cl = CLD_CLI.find((o) => o.id === l.clc) ?? CLD_CLI[0];
        return (
          <SectionCard
            key={l.id}
            title={
              <span className="flex items-center gap-2">
                {l.tipo === "energia" ? <Plug className="h-5 w-5 text-gta-orange" /> : <RadioTower className="h-5 w-5 text-gta-indigo" />}
                {l.nome || "Linha"}
                <span className="badge badge-slate">{l.tipo === "energia" ? "Energia" : "Sinal"}</span>
              </span>
            }
            actions={
              <button type="button" className="btn-link-danger" onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))}>
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            }
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <label htmlFor={campoRisco.linha(l.id, "nome")} className="field-label">
                  Nome da linha
                </label>
                <input id={campoRisco.linha(l.id, "nome")} className="field-input" value={l.nome} onChange={(e) => set(l.id, { nome: e.target.value })} />
              </div>
              <div>
                <label htmlFor={campoRisco.linha(l.id, "LL")} className="field-label">
                  <Rotulo simbolo="LL" nome="Comprimento" refNorma="A.8" />
                </label>
                <NumInput id={campoRisco.linha(l.id, "LL")} value={l.LL} min={0} sufixo="m" onChange={(v) => set(l.id, { LL: v })} />
                <p className="mt-1 hint">Desconhecido: adote 1 000 m.</p>
              </div>
            </div>

            {/* Menus um embaixo do outro, na ordem da norma. */}
            <div className="mt-4 space-y-4">
              <CampoParametro param={CE} value={l.CE} onChange={(v) => set(l.id, { CE: v })} />
              <CampoParametro param={CT} value={l.CT} onChange={(v) => set(l.id, { CT: v })} />
              <CampoParametro param={CI} value={l.CI} onChange={(v) => set(l.id, { CI: v })} />
              <div>
                <label htmlFor={`${l.id}-clc`} className="field-label">
                  <Rotulo simbolo="CLD/CLI" nome="Tipo de linha externa e ligação equipotencial na entrada" refNorma="Tabela B.4" />
                </label>
                <div className="flex items-stretch gap-2">
                  <select id={`${l.id}-clc`} className="field-input min-w-0 flex-1" value={l.clc} onChange={(e) => set(l.id, { clc: e.target.value })}>
                    {CLD_CLI.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                  <span className="flex min-w-[80px] items-center justify-center rounded-md bg-slate-100 px-2 font-mono text-sm font-semibold dark:bg-slate-700">
                    {fmtParam(cl.CLD)} / {fmtParam(cl.CLI)}
                  </span>
                </div>
              </div>
              <CampoParametro param={BLINDAGEM} value={l.blindagem} onChange={(v) => set(l.id, { blindagem: v })} />
              <div>
                <label htmlFor={`${l.id}-uw`} className="field-label">
                  <Rotulo simbolo="UW" nome="Tensão suportável de impulso" refNorma="Tabela B.8" />
                </label>
                <select id={`${l.id}-uw`} className="field-input" value={l.UW} onChange={(e) => set(l.id, { UW: Number(e.target.value) })}>
                  {UW_VALORES.map((u) => (
                    <option key={u} value={u}>
                      {fmtNum(u)} kV
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor={`${l.id}-cond`} className="field-label">
                  Condutores ativos da linha
                </label>
                <NumInput id={`${l.id}-cond`} value={l.condutores} min={1} max={12} onChange={(v) => set(l.id, { condutores: Math.max(1, Math.round(v ?? 1)) })} />
                <p className="mt-1 hint">Dividem a corrente de impulso no dimensionamento do DPS.</p>
              </div>
              <div className="flex flex-col justify-end gap-1 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
                <span>
                  <Rotulo simbolo="PLD" nome={`= ${fmtParam(r?.PLD ?? 1)}`} refNorma="B.8" />
                </span>
                <span>
                  <Rotulo simbolo="PLI" nome={`= ${fmtParam(r?.PLI ?? 1)}`} refNorma="B.9" />
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
              <label className="inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={l.adjacente != null}
                  onChange={(e) => set(l.id, { adjacente: e.target.checked ? { L: null, W: null, H: null, CDJ: "isolada" } : null })}
                />
                Estrutura adjacente conectada à linha (NDJ)
              </label>
              {l.adjacente && (
                <div id={campoRisco.linha(l.id, "adj")} className="mt-3 space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                  {(["L", "W", "H"] as const).map((k) => (
                    <div key={k}>
                      <label className="field-label" htmlFor={`${l.id}-adj-${k}`}>
                        <Rotulo simbolo={`${k}J`} nome={k === "L" ? "Comprimento" : k === "W" ? "Largura" : "Altura"} />
                      </label>
                      <NumInput id={`${l.id}-adj-${k}`} value={l.adjacente![k]} min={0} sufixo="m" onChange={(v) => set(l.id, { adjacente: { ...l.adjacente!, [k]: v } })} />
                    </div>
                  ))}
                  </div>
                  <CampoParametro param={{ ...CD, simbolo: "CDJ", nome: "Localização da adjacente" }} value={l.adjacente.CDJ} onChange={(v) => set(l.id, { adjacente: { ...l.adjacente!, CDJ: v } })} />
                </div>
              )}
            </div>

            {r && (
              <dl className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-5 dark:bg-slate-900/50">
                <Evento rotulo="ND (estrutura)" valor={resultado.ND} />
                <Evento rotulo="NM (perto da estrutura)" valor={resultado.NM} />
                <Evento rotulo="NL (na linha)" valor={r.NL} />
                <Evento rotulo="NI (perto da linha)" valor={r.NI} />
                <Evento rotulo="NDJ (adjacente)" valor={r.NDJ} />
              </dl>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

function Evento({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="hint">{rotulo}</dt>
      <dd className="font-mono font-semibold text-gta-navy dark:text-slate-100">{fmtCient(valor)}</dd>
    </div>
  );
}
