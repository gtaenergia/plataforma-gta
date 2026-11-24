"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { SectionCard } from "@/components/ui";
import { CD, PB, PEB, RS_ESTRUTURA } from "@/lib/engenharia/risco/tabelas";
import type { EstruturaRisco } from "@/lib/engenharia/risco/tipos";
import { campoRisco } from "@/lib/engenharia/risco/pendencias";
import { fmtNum } from "@/lib/engenharia/formato";
import { areaExposicao } from "@/lib/engenharia/risco/motor";
import { CampoParametro, NumInput, Rotulo } from "../comum";

interface Municipio {
  nome: string;
  uf: string;
  ng: number;
}

function BuscaCidade({ cidade, onEscolher }: { cidade: EstruturaRisco["cidade"]; onEscolher: (m: Municipio) => void }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Municipio[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setLista([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/engenharia/ng?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((j) => {
          setLista(j.municipios ?? []);
          setAtivo(0);
          setAberto(true);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const escolher = (m: Municipio) => {
    onEscolher(m);
    setQ("");
    setAberto(false);
  };

  return (
    <div ref={caixa} className="relative">
      <label htmlFor="busca-cidade" className="field-label">
        Município (Tabela F.1)
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="busca-cidade"
          className="field-input"
          style={{ paddingLeft: "2.25rem" }}
          placeholder={cidade ? `${cidade.nome}/${cidade.uf}` : "Digite o nome da cidade"}
          value={q}
          role="combobox"
          aria-expanded={aberto}
          aria-controls="lista-cidades"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => lista.length && setAberto(true)}
          onKeyDown={(e) => {
            if (!aberto || !lista.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAtivo((a) => Math.min(lista.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              escolher(lista[ativo]);
            } else if (e.key === "Escape") setAberto(false);
          }}
        />
      </div>
      {aberto && lista.length > 0 && (
        <ul id="lista-cidades" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {lista.map((m, i) => (
            <li key={`${m.nome}-${m.uf}`} role="option" aria-selected={i === ativo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(m)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === ativo ? "bg-gta-indigo/10" : "hover:bg-slate-50 dark:hover:bg-slate-700"}`}
              >
                <span>
                  {m.nome} <span className="text-slate-500">/{m.uf}</span>
                </span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">NG {fmtNum(m.ng)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {cidade && (
        <p className="mt-1 flex items-center gap-1 hint">
          <MapPin className="h-3 w-3" /> {cidade.nome}/{cidade.uf}
        </p>
      )}
    </div>
  );
}

export function EtapaEstrutura({ e, set }: { e: EstruturaRisco; set: (patch: Partial<EstruturaRisco>) => void }) {
  const AD = e.L && e.W && e.H ? areaExposicao(e.L, e.W, e.H) : null;
  return (
    <div className="space-y-6">
      <SectionCard title="Local e dimensões" subtitle="O NG vem da Tabela F.1 da NBR 5419-2:2026 — a norma não aceita outra fonte (A.1.3).">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <BuscaCidade cidade={e.cidade} onEscolher={(m) => set({ cidade: { nome: m.nome, uf: m.uf }, NG: m.ng })} />
          </div>
          <div>
            <label htmlFor={campoRisco.estrutura("NG")} className="field-label">
              <Rotulo simbolo="NG" nome="Densidade de descargas" />
            </label>
            <NumInput id={campoRisco.estrutura("NG")} value={e.NG} min={0} sufixo="/km²·ano" onChange={(v) => set({ NG: v, cidade: v === e.NG ? e.cidade : null })} />
          </div>
          <div>
            <label htmlFor={campoRisco.estrutura("L")} className="field-label">
              <Rotulo simbolo="L" nome="Comprimento" />
            </label>
            <NumInput id={campoRisco.estrutura("L")} value={e.L} min={0} sufixo="m" onChange={(v) => set({ L: v })} />
          </div>
          <div>
            <label htmlFor={campoRisco.estrutura("W")} className="field-label">
              <Rotulo simbolo="W" nome="Largura" />
            </label>
            <NumInput id={campoRisco.estrutura("W")} value={e.W} min={0} sufixo="m" onChange={(v) => set({ W: v })} />
          </div>
          <div>
            <label htmlFor={campoRisco.estrutura("H")} className="field-label">
              <Rotulo simbolo="H" nome="Altura" />
            </label>
            <NumInput id={campoRisco.estrutura("H")} value={e.H} min={0} sufixo="m" onChange={(v) => set({ H: v })} />
          </div>
        </div>
        {AD != null && (
          <p className="mt-3 hint">
            Área de exposição equivalente AD = L·W + 6H(L+W) + 9πH² = <strong>{fmtNum(AD, 2)} m²</strong> (A.1)
          </p>
        )}
      </SectionCard>

      <SectionCard title="Parâmetros da estrutura">
        <div className="space-y-4">
          <CampoParametro param={CD} value={e.CD} onChange={(v) => set({ CD: v })} />
          <CampoParametro param={RS_ESTRUTURA} value={e.rS} onChange={(v) => set({ rS: v })} />
          <CampoParametro param={PB} value={e.PB} onChange={(v) => set({ PB: v })} />
          <CampoParametro param={PEB} value={e.PEB} onChange={(v) => set({ PEB: v })} />
          <div>
            <span className="field-label">
              <Rotulo simbolo="KS1" nome="Eficácia da blindagem espacial da estrutura (ZPR 0/1)" refNorma="B.4.12" />
            </span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={e.semBlindagemKs1} onChange={(ev) => set({ semBlindagemKs1: ev.target.checked })} />
                Sem blindagem espacial em forma de malha (KS1 = 1)
              </label>
              {!e.semBlindagemKs1 && (
                <div className="w-48">
                  <NumInput id={campoRisco.estrutura("KS1")} value={e.KS1} min={0.0001} max={1} ariaLabel="KS1" onChange={(v) => set({ KS1: v })} />
                </div>
              )}
            </div>
            {!e.semBlindagemKs1 && <p className="mt-1 hint">KS1 = 0,12 × wm (largura da malha ou espaçamento entre descidas, em m); entre 10⁻⁴ e 1.</p>}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
