"use client";

import { useEffect, useState } from "react";

import { Alert, Loading } from "@/components/ui";
type ParamKey =
  | "taxaForca" | "pisoForca"
  | "taxaIluminacao" | "pisoIluminacao"
  | "taxaTelecom" | "pisoTelecom"
  | "taxaRetrofit" | "pisoRetrofit"
  | "multIndustrial";
type Params = Record<ParamKey, number>;
interface CampoDef { key: ParamKey; label: string; help?: string }

/** Grupos (disciplina → taxa R$/m² + piso R$) + multiplicador. */
const GRUPOS: { titulo: string; campos: CampoDef[] }[] = [
  { titulo: "Força (tomadas)", campos: [{ key: "taxaForca", label: "R$/m²" }, { key: "pisoForca", label: "Piso (R$)" }] },
  { titulo: "Iluminação", campos: [{ key: "taxaIluminacao", label: "R$/m²" }, { key: "pisoIluminacao", label: "Piso (R$)" }] },
  { titulo: "Telecom / cabeamento", campos: [{ key: "taxaTelecom", label: "R$/m²" }, { key: "pisoTelecom", label: "Piso (R$)" }] },
  { titulo: "Retrofit / adequação", campos: [{ key: "taxaRetrofit", label: "R$/m²" }, { key: "pisoRetrofit", label: "Piso (R$)" }] },
];
const CAMPO_MULT: CampoDef = { key: "multIndustrial", label: "Multiplicador industrial", help: "Aplicado às disciplinas em edificação industrial (padrão 1,4)." };
const CAMPOS: CampoDef[] = [...GRUPOS.flatMap((g) => g.campos), CAMPO_MULT];

function parseDec(s: string): number {
  const t = String(s).trim();
  if (!t) return NaN;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}
// useGrouping:false para os pisos (2500) não virarem "2.500" e serem lidos como 2,5.
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });
function paraTexto(p: Params): Record<ParamKey, string> {
  const out = {} as Record<ParamKey, string>;
  for (const c of CAMPOS) out[c.key] = fmt(p[c.key]);
  return out;
}

export function ProjetoBtParamsForm({ onSaved }: { onSaved?: (p: Params) => void }) {
  const [texto, setTexto] = useState<Record<ParamKey, string> | null>(null);
  const [defaults, setDefaults] = useState<Params | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/projeto-bt/config").then((r) => r.json()).then((d) => {
      if (d.params) setTexto(paraTexto(d.params));
      if (d.defaults) setDefaults(d.defaults);
    }).catch(() => setErro("Falha ao carregar os parâmetros."));
  }, []);

  async function salvar() {
    if (!texto) return;
    setErro(null); setStatus(null);
    const valores = {} as Params;
    for (const c of CAMPOS) {
      const n = parseDec(texto[c.key]);
      if (!Number.isFinite(n)) { setErro(`Valor inválido em "${c.label}".`); return; }
      valores[c.key] = n;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/projeto-bt/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valores) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao salvar.");
      setTexto(paraTexto(d.params));
      setStatus("Parâmetros salvos. Novos cálculos já usam estes valores.");
      onSaved?.(d.params as Params);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (!texto) return erro ? <Alert tone="red">{erro}</Alert> : <Loading>Carregando parâmetros…</Loading>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GRUPOS.map((g) => (
          <div key={g.titulo} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-xs font-semibold text-gta-navy dark:text-slate-200">{g.titulo}</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {g.campos.map((c) => (
                <div key={c.key}>
                  <label className="field-label">{c.label}</label>
                  <input className="field-input" inputMode="decimal" value={texto[c.key]} onChange={(e) => setTexto({ ...texto, [c.key]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sm:w-1/2">
        <label className="field-label">{CAMPO_MULT.label}</label>
        <input className="field-input" inputMode="decimal" value={texto.multIndustrial} onChange={(e) => setTexto({ ...texto, multIndustrial: e.target.value })} />
        <p className="mt-1 hint">{CAMPO_MULT.help}</p>
      </div>
      {erro && <Alert tone="red">{erro}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar parâmetros"}</button>
        {defaults && <button type="button" className="btn-secondary" onClick={() => { setTexto(paraTexto(defaults)); setStatus("Padrões restaurados — clique em Salvar."); }}>Restaurar padrões</button>}
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
