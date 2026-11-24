"use client";

import { Plus, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/ui";
import { novaZona, type EstruturaRisco, type ZonaRisco } from "@/lib/engenharia/risco/tipos";
import { campoRisco } from "@/lib/engenharia/risco/pendencias";
import { NumInput, Rotulo } from "../comum";

const PERDAS: { k: keyof ZonaRisco["perdas"]; titulo: string; desc: string }[] = [
  { k: "L1", titulo: "L1 — Vida humana", desc: "Risco R1 (RT = 10⁻⁵)" },
  { k: "L3", titulo: "L3 — Patrimônio cultural", desc: "Risco R3 (RT = 10⁻⁴)" },
  { k: "L4", titulo: "L4 — Valor econômico", desc: "Risco R4 (RT = 10⁻³, Anexo D)" },
  { k: "F", titulo: "F — Danos a equipamentos", desc: "Frequência de danos (FT = 1 ou 0,1/ano)" },
];

export function EtapaZonas({
  e,
  setEstrutura,
  zonas,
  setZonas,
}: {
  e: EstruturaRisco;
  setEstrutura: (p: Partial<EstruturaRisco>) => void;
  zonas: ZonaRisco[];
  setZonas: (fn: (z: ZonaRisco[]) => ZonaRisco[]) => void;
}) {
  const set = (id: string, patch: Partial<ZonaRisco>) => setZonas((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  const somaNz = zonas.filter((z) => z.perdas.L1).reduce((s, z) => s + (z.nz ?? 0), 0);

  return (
    <div className="space-y-6">
      <SectionCard title="Ocupação da estrutura" subtitle="A estrutura pode ser uma zona única ou dividida por ocupação, piso, compartimento à prova de fogo ou blindagem (6.7).">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={campoRisco.estrutura("nt")} className="field-label">
              <Rotulo simbolo="nt" nome="Total de pessoas na estrutura" refNorma="C.3" />
            </label>
            <NumInput id={campoRisco.estrutura("nt")} value={e.nt} min={0} onChange={(v) => setEstrutura({ nt: v == null ? null : Math.round(v) })} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <p className="hint">
              Pessoas nas zonas com L1: <strong>{somaNz}</strong>
              {e.nt ? ` de ${e.nt}` : ""}. A perda de cada zona é ponderada por nz/nt × tz/8 760.
            </p>
          </div>
        </div>
      </SectionCard>

      <div id="r-zonas" className="flex items-center justify-between">
        <h2 className="section-title">Zonas de estudo</h2>
        <button type="button" className="btn-secondary" onClick={() => setZonas((zs) => [...zs, novaZona(zs.length + 1)])}>
          <Plus className="h-4 w-4" /> Adicionar zona
        </button>
      </div>

      {zonas.map((z) => (
        <SectionCard
          key={z.id}
          title={z.nome || "Zona"}
          actions={
            zonas.length > 1 && (
              <button type="button" className="btn-link-danger" onClick={() => setZonas((zs) => zs.filter((x) => x.id !== z.id))}>
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            )
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label htmlFor={campoRisco.zona(z.id, "nome")} className="field-label">
                Nome da zona
              </label>
              <input id={campoRisco.zona(z.id, "nome")} className="field-input" value={z.nome} onChange={(ev) => set(z.id, { nome: ev.target.value })} />
            </div>
            <div>
              <label htmlFor={campoRisco.zona(z.id, "nz")} className="field-label">
                <Rotulo simbolo="nz" nome="Pessoas na zona" />
              </label>
              <NumInput id={campoRisco.zona(z.id, "nz")} value={z.nz} min={0} onChange={(v) => set(z.id, { nz: v == null ? null : Math.round(v) })} />
            </div>
            <div>
              <label htmlFor={campoRisco.zona(z.id, "tz")} className="field-label">
                <Rotulo simbolo="tz" nome="Tempo de permanência" />
              </label>
              <NumInput id={campoRisco.zona(z.id, "tz")} value={z.tz} min={0} max={8760} sufixo="h/ano" onChange={(v) => set(z.id, { tz: v })} />
            </div>
          </div>
          <fieldset id={campoRisco.zona(z.id, "perdas")} className="mt-4">
            <legend className="field-label">Perdas a avaliar nesta zona</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PERDAS.map((p) => (
                <label
                  key={p.k}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                    z.perdas[p.k] ? "border-gta-indigo bg-gta-indigo/5 dark:border-indigo-400 dark:bg-indigo-500/10" : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <input type="checkbox" className="mt-0.5" checked={z.perdas[p.k]} onChange={(ev) => set(z.id, { perdas: { ...z.perdas, [p.k]: ev.target.checked } })} />
                  <span>
                    <span className="block font-semibold">{p.titulo}</span>
                    <span className="hint">{p.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </SectionCard>
      ))}
    </div>
  );
}
