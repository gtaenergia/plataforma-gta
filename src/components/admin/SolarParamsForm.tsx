"use client";

import { useEffect, useState } from "react";

import { Alert, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
/**
 * Formulário dos parâmetros do Solar (custos/imposto/comissão/eficiência).
 * Valores em % são exibidos como porcentagem (7,01) e salvos como fração (0,0701).
 * Disponível para qualquer usuário — os valores valem para toda a plataforma.
 */

type ParamKey =
  | "fator" | "instalacaoPorPainel" | "materialCaPorWp" | "deslocamentoUnit"
  | "viagens" | "art" | "cartorio" | "impostoPct" | "comissaoPct"
  | "eficiencia" | "overloadDesejado"
  | "simultaneidade" | "iluminacaoPublica" | "inflacaoTarifa" | "degradacao";

type Params = Record<ParamKey, number>;

interface CampoDef {
  key: ParamKey;
  label: string;
  help: string;
  kind: "dec" | "int" | "pct";
}

const CAMPOS: { titulo: string; campos: CampoDef[] }[] = [
  {
    titulo: "Preço",
    campos: [
      { key: "fator", label: "Fator multiplicador", help: "Valor total = (kit + execução civil) × fator", kind: "dec" },
    ],
  },
  {
    titulo: "Custos da obra",
    campos: [
      { key: "instalacaoPorPainel", label: "Instalação por painel (R$)", help: "Mão de obra de instalação, por módulo", kind: "dec" },
      { key: "materialCaPorWp", label: "Material CA por Wp (R$)", help: "Cabos/proteções CA, por Wp instalado", kind: "dec" },
      { key: "deslocamentoUnit", label: "Custo por viagem (R$)", help: "Deslocamento até a obra, por viagem", kind: "dec" },
      { key: "viagens", label: "Viagens padrão", help: "Nº de viagens típico (ajustável por proposta)", kind: "int" },
      { key: "art", label: "ART (R$)", help: "Anotação de Responsabilidade Técnica", kind: "dec" },
      { key: "cartorio", label: "Cartório/taxas (R$)", help: "Outras taxas fixas, se houver", kind: "dec" },
    ],
  },
  {
    titulo: "Percentuais",
    campos: [
      { key: "impostoPct", label: "Imposto / NF (%)", help: "Sobre o valor dos serviços", kind: "pct" },
      { key: "comissaoPct", label: "Comissão (%)", help: "Sobre o valor dos serviços", kind: "pct" },
    ],
  },
  {
    titulo: "Dimensionamento",
    campos: [
      { key: "eficiencia", label: "Eficiência do sistema (%)", help: "Perdas globais consideradas na geração (padrão 75%)", kind: "pct" },
      { key: "overloadDesejado", label: "Overload desejado (%)", help: "Alvo de sobrecarga do inversor na sugestão (padrão 15%)", kind: "pct" },
    ],
  },
  {
    titulo: "Economia e payback",
    campos: [
      { key: "simultaneidade", label: "Consumo simultâneo (%)", help: "Parte gerada e consumida na hora; o resto é injetado e paga Fio B (padrão 70%)", kind: "pct" },
      { key: "iluminacaoPublica", label: "Iluminação pública (R$)", help: "Custo fixo mensal na conta", kind: "dec" },
      { key: "inflacaoTarifa", label: "Inflação da tarifa (% a.a.)", help: "Reajuste anual estimado da energia (padrão 10%)", kind: "pct" },
      { key: "degradacao", label: "Degradação dos módulos (% a.a.)", help: "Perda de geração por ano (padrão 0,5%)", kind: "pct" },
    ],
  },
];

/** "1,5" → 1.5 · "1.234,56" → 1234.56 · "0.2" → 0.2 */
function parseDec(s: string): number {
  const t = String(s).trim();
  if (!t) return NaN;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}

// useGrouping:false: valores ≥ 1000 não podem virar "2.500" e serem relidos como 2,5.
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4, useGrouping: false });

function paraTexto(p: Params): Record<ParamKey, string> {
  const out = {} as Record<ParamKey, string>;
  for (const g of CAMPOS) {
    for (const c of g.campos) {
      out[c.key] = fmt(c.kind === "pct" ? p[c.key] * 100 : p[c.key]);
    }
  }
  return out;
}

export function SolarParamsForm({ onSaved }: { onSaved?: (p: Params) => void }) {
  const [texto, setTexto] = useState<Record<ParamKey, string> | null>(null);
  const [defaults, setDefaults] = useState<Params | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/solar/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.params) setTexto(paraTexto(d.params));
        if (d.defaults) setDefaults(d.defaults);
      })
      .catch(() => setErro("Falha ao carregar os parâmetros."));
  }, []);

  async function salvar() {
    if (!texto) return;
    setErro(null);
    setStatus(null);

    const valores = {} as Params;
    for (const g of CAMPOS) {
      for (const c of g.campos) {
        const n = parseDec(texto[c.key]);
        if (!Number.isFinite(n)) {
          setErro(`Valor inválido em "${c.label}".`);
          return;
        }
        valores[c.key] = c.kind === "pct" ? n / 100 : n;
      }
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/solar/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      });
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

  if (!texto) {
    return erro
      ? <Alert tone="red">{erro}</Alert>
      : <Loading>Carregando parâmetros…</Loading>;
  }

  return (
    <div className="space-y-5">
      {CAMPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <h3 className="text-sm font-semibold text-gta-navy dark:text-slate-200">{grupo.titulo}</h3>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {grupo.campos.map((c) => (
              <Campo key={c.key} label={<>{c.label}</>} hint={<><p className="mt-1 hint">{c.help}</p></>}>
                <input
                  className="field-input"
                  inputMode="decimal"
                  value={texto[c.key]}
                  onChange={(e) => setTexto({ ...texto, [c.key]: e.target.value })}
                />
              </Campo>
            ))}
          </div>
        </div>
      ))}

      {erro && <Alert tone="red">{erro}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
        {defaults && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setTexto(paraTexto(defaults)); setStatus("Padrões da planilha restaurados — clique em Salvar para aplicar."); }}
          >
            Restaurar padrões
          </button>
        )}
        {status && <span className="text-sm text-green-600 dark:text-green-400">{status}</span>}
      </div>
    </div>
  );
}
