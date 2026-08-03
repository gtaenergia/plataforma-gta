"use client";

import { useEffect, useState } from "react";

import { Alert, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
type ParamKey = "fatorK" | "aliqImpostos";
type Params = Record<ParamKey, number>;
interface CampoDef { key: ParamKey; label: string; help: string; kind: "dec" | "pct" }

const CAMPOS: CampoDef[] = [
  { key: "fatorK", label: "Fator K (markup)", help: "Multiplica o custo p/ chegar ao faturamento. 1,7 = padrão de execução da GTA", kind: "dec" },
  { key: "aliqImpostos", label: "Impostos/NF (%)", help: "Alíquota sobre o faturamento (padrão 6%)", kind: "pct" },
];

function parseDec(s: string): number {
  const t = String(s).trim();
  if (!t) return NaN;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
function paraTexto(p: Params): Record<ParamKey, string> {
  const out = {} as Record<ParamKey, string>;
  for (const c of CAMPOS) out[c.key] = fmt(c.kind === "pct" ? p[c.key] * 100 : p[c.key]);
  return out;
}

export function ExecSeParamsForm({ onSaved }: { onSaved?: (p: Params) => void }) {
  const [texto, setTexto] = useState<Record<ParamKey, string> | null>(null);
  const [defaults, setDefaults] = useState<Params | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/execucao-subestacao/config").then((r) => r.json()).then((d) => {
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
      valores[c.key] = c.kind === "pct" ? n / 100 : n;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/execucao-subestacao/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valores) });
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
        {CAMPOS.map((c) => (
          <Campo key={c.key} label={<>{c.label}</>} hint={<><p className="mt-1 hint">{c.help}</p></>}>
            <input className="field-input" inputMode="decimal" value={texto[c.key]} onChange={(e) => setTexto({ ...texto, [c.key]: e.target.value })} />
          </Campo>
        ))}
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
