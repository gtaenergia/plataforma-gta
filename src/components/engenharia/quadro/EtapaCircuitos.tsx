"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Columns3, Copy, FileSpreadsheet, Percent, Plus, Scale, Settings2, Trash2 } from "lucide-react";
import type { Circuito, Fase, Quadro, TipoCarga } from "@/lib/engenharia/quadro/tipos";
import { novoCircuito, novoIdQ, novoQuadro } from "@/lib/engenharia/quadro/tipos";
import { faseCoerente, polosDoEsquema, type ResultadoCircuito, type ResultadoQuadro } from "@/lib/engenharia/quadro/motor";
import { GRUPOS_DEMANDA } from "@/lib/engenharia/quadro/tabelas";
import { fmtNum } from "@/lib/engenharia/formato";
import { Dialogo, NumInput } from "../comum";
import { ESQUEMAS } from "./FichaCircuito";
import { campoQuadro } from "./EtapaConfig";

/** Controles compactos das células (o `.field-input` venceria as larguras). */
const SEL = "rounded border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

interface ColunaDef {
  id: string;
  titulo: string;
  padrao?: boolean;
  num?: boolean;
  cel: (c: Circuito | null, r: ResultadoCircuito) => ReactNode;
}

const estado = (r: ResultadoCircuito) => {
  const v = Object.values(r.verif);
  return v.includes("falha") ? "falha" : v.includes("sem-dados") ? "sem-dados" : "ok";
};

export function EtapaCircuitos({
  quadros,
  ativo,
  setAtivo,
  setQuadros,
  resultado,
  onAbrir,
  onExportar,
  onBalancear,
}: {
  quadros: Quadro[];
  ativo: Quadro;
  setAtivo: (id: string) => void;
  setQuadros: (fn: (q: Quadro[]) => Quadro[]) => void;
  resultado: ResultadoQuadro;
  onAbrir: (id: string | "geral") => void;
  onExportar: () => void;
  onBalancear: () => void;
}) {
  const [verColunas, setVerColunas] = useState(false);
  const [verDemanda, setVerDemanda] = useState(false);
  const [verTipos, setVerTipos] = useState(false);
  const [visiveis, setVisiveis] = useState<Record<string, boolean> | null>(null);

  const setQ = (fn: (q: Quadro) => Quadro) => setQuadros((qs) => qs.map((q) => (q.id === ativo.id ? fn(q) : q)));
  const setC = (id: string, p: Partial<Circuito>) => setQ((q) => ({ ...q, circuitos: q.circuitos.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  const colunas: ColunaDef[] = useMemo(() => {
    const ro = (f: (r: ResultadoCircuito) => ReactNode): ColunaDef["cel"] => (_c, r) => f(r);
    const cols: ColunaDef[] = [
      {
        id: "descricao",
        titulo: "Descrição",
        padrao: true,
        cel: (c, r) =>
          c ? (
            <input className={SEL} style={{ width: 180 }} value={c.descricao} aria-label={`Descrição de ${c.tag}`} onChange={(e) => setC(c.id, { descricao: e.target.value })} />
          ) : (
            <span className="text-xs font-semibold">{r.descricao}</span>
          ),
      },
      {
        id: "grupo",
        titulo: "Grupo",
        padrao: true,
        cel: (c) =>
          c ? (
            <select className={SEL} style={{ width: 64 }} value={c.grupo} aria-label={`Grupo de ${c.tag}`} title={GRUPOS_DEMANDA.find((g) => g.id === c.grupo)?.nome} onChange={(e) => setC(c.id, { grupo: e.target.value })}>
              {GRUPOS_DEMANDA.map((g) => (
                <option key={g.id} value={g.id} title={g.nome}>
                  {g.id}
                </option>
              ))}
            </select>
          ) : null,
      },
      ...ativo.tiposCarga.map<ColunaDef>((t) => ({
        id: `q-${t.id}`,
        titulo: `${t.nome} (${fmtNum(t.potencia)} W)`,
        padrao: true,
        num: true,
        cel: (c) =>
          c ? (
            <NumInput value={c.quantidades[t.id] ?? 0} min={0} largura="64px" className="!py-1 text-xs" ariaLabel={`${t.nome} em ${c.tag}`} onChange={(v) => setC(c.id, { quantidades: { ...c.quantidades, [t.id]: Math.max(0, Math.round(v ?? 0)) } })} />
          ) : null,
      })),
      {
        id: "especial",
        titulo: "Carga especial (W)",
        padrao: true,
        num: true,
        cel: (c) => (c ? <NumInput value={c.cargaEspecial} min={0} largura="84px" className="!py-1 text-xs" ariaLabel={`Carga especial de ${c.tag}`} onChange={(v) => setC(c.id, { cargaEspecial: v })} /> : null),
      },
      { id: "P", titulo: "P (W)", padrao: true, num: true, cel: ro((r) => fmtNum(r.P, 0)) },
      {
        id: "esquema",
        titulo: "Tipo de circuito",
        padrao: true,
        cel: (c, r) =>
          c ? (
            <select
              className={SEL}
              style={{ width: 92 }}
              value={c.esquema}
              aria-label={`Esquema de ${c.tag}`}
              onChange={(e) => {
                const esquema = e.target.value as Circuito["esquema"];
                setC(c.id, { esquema, fase: faseCoerente(esquema, c.fase) });
              }}
            >
              {ESQUEMAS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs">{r.esquema}</span>
          ),
      },
      {
        id: "fase",
        titulo: "Fase",
        padrao: true,
        cel: (c, r) =>
          c ? (
            <select className={SEL} style={{ width: 62 }} value={faseCoerente(c.esquema, c.fase)} aria-label={`Fase de ${c.tag}`} onChange={(e) => setC(c.id, { fase: e.target.value as Fase })}>
              {(polosDoEsquema(c.esquema) === 1 ? ["A", "B", "C"] : polosDoEsquema(c.esquema) === 2 ? ["AB", "BC", "CA"] : ["ABC"]).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs">{r.fase}</span>
          ),
      },
      { id: "S", titulo: "S (VA)", num: true, cel: ro((r) => fmtNum(r.S, 0)) },
      { id: "Q", titulo: "Q (var)", num: true, cel: ro((r) => fmtNum(r.Q, 0)) },
      { id: "fp", titulo: "FP", num: true, cel: ro((r) => fmtNum(r.fp, 2)) },
      { id: "thd", titulo: "THD-I (%)", num: true, cel: ro((r) => fmtNum(r.thd, 0)) },
      { id: "Ib", titulo: "Ib (A)", padrao: true, num: true, cel: ro((r) => fmtNum(r.Ib, 1)) },
      { id: "In", titulo: "Disjuntor", padrao: true, cel: ro((r) => `${r.In} A ${r.curva}`) },
      { id: "Im", titulo: "Im (A)", num: true, cel: ro((r) => fmtNum(r.Im, 0)) },
      { id: "icu", titulo: "Icu (kA)", num: true, cel: ro((r) => fmtNum(r.icu)) },
      { id: "dr", titulo: "DR", cel: ro((r) => (r.dr ? `${r.drIn} A / ${r.drSens} mA` : "—")) },
      { id: "material", titulo: "Material", cel: ro((r) => r.material) },
      { id: "isolacao", titulo: "Isolação", cel: ro((r) => r.isolacao) },
      { id: "metodo", titulo: "Método", cel: ro((r) => `${r.metodo} (${r.metodoRef})`) },
      { id: "classe", titulo: "Classe", cel: ro((r) => r.classe) },
      { id: "tiso", titulo: "Isolamento", cel: ro((r) => r.tensaoIsolacao) },
      { id: "config", titulo: "Configuração", cel: ro((r) => r.config.replace("unipolar-", "unip. ")) },
      { id: "npar", titulo: "Cond./fase", num: true, cel: ro((r) => r.condPorFase) },
      { id: "secao", titulo: "Seção fase (mm²)", padrao: true, num: true, cel: ro((r) => fmtNum(r.secao)) },
      { id: "secaoN", titulo: "Neutro (mm²)", num: true, cel: ro((r) => fmtNum(r.secaoN)) },
      { id: "secaoPE", titulo: "PE (mm²)", padrao: true, num: true, cel: ro((r) => fmtNum(r.secaoPE)) },
      { id: "k1", titulo: "k1", num: true, cel: ro((r) => fmtNum(r.k1, 2)) },
      { id: "k2", titulo: "k2", num: true, cel: ro((r) => fmtNum(r.k2, 2)) },
      { id: "izTab", titulo: "Iz tab. (A)", num: true, cel: ro((r) => fmtNum(r.izTab, 1)) },
      { id: "iz", titulo: "Iz corr. (A)", padrao: true, num: true, cel: ro((r) => fmtNum(r.iz, 1)) },
      { id: "R", titulo: "R (Ω/km)", num: true, cel: ro((r) => fmtNum(r.rKm, 3)) },
      { id: "X", titulo: "X (Ω/km)", num: true, cel: ro((r) => fmtNum(r.xKm, 3)) },
      {
        id: "comp",
        titulo: "Comprimento (m)",
        padrao: true,
        num: true,
        cel: (c, r) => (c ? <NumInput id={campoQuadro.circ(c.id, "comp-tab")} value={c.comprimento} min={0} largura="70px" className="!py-1 text-xs" ariaLabel={`Comprimento de ${c.tag}`} onChange={(v) => setC(c.id, { comprimento: v })} /> : fmtNum(r.comprimento)),
      },
      { id: "dvMax", titulo: "ΔV máx (%)", num: true, cel: ro((r) => fmtNum(r.limiteTrecho, 1)) },
      { id: "dv", titulo: "ΔV trecho (%)", num: true, cel: ro((r) => fmtNum(r.dvTrecho, 2)) },
      {
        id: "dvAc",
        titulo: "ΔV acum. (%)",
        padrao: true,
        num: true,
        cel: ro((r) => <span className={r.verif.queda === "falha" ? "font-semibold text-red-600" : ""}>{fmtNum(r.dvAcumulada, 2)}</span>),
      },
      { id: "ikIni", titulo: "Ik início (kA)", num: true, cel: ro((r) => fmtNum(r.ikInicio, 2)) },
      { id: "ikMax", titulo: "Ik máx fim (kA)", num: true, cel: ro((r) => fmtNum(r.ikMaxFim, 2)) },
      {
        id: "ikMin",
        titulo: "Ik mín fim (A)",
        padrao: true,
        num: true,
        cel: ro((r) => <span className={r.verif.magnetica === "falha" ? "font-semibold text-red-600" : ""}>{r.ikMinFim != null ? fmtNum(r.ikMinFim * 1000, 0) : "—"}</span>),
      },
      {
        id: "verif",
        titulo: "Verificações",
        padrao: true,
        cel: ro((r) => {
          const e = estado(r);
          return (
            <span className={`badge ${e === "ok" ? "badge-green" : e === "falha" ? "badge-red" : "badge-slate"}`}>{e === "ok" ? "OK" : e === "falha" ? "Não atende" : "Faltam dados"}</span>
          );
        }),
      },
    ];
    return cols;
    // setC muda a cada render, mas só fecha sobre `ativo.id` — basta ele e os tipos de carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo.id, ativo.tiposCarga]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem("gta-eng:colunas-quadro");
      if (salvo) setVisiveis(JSON.parse(salvo));
    } catch {
      /* ignora */
    }
  }, []);
  const vis = (c: ColunaDef) => (visiveis && c.id in visiveis ? visiveis[c.id] : Boolean(c.padrao) || c.id.startsWith("q-"));
  const alternar = (id: string, v: boolean) => {
    const novo = { ...(visiveis ?? {}), [id]: v };
    setVisiveis(novo);
    try {
      localStorage.setItem("gta-eng:colunas-quadro", JSON.stringify(novo));
    } catch {
      /* ignora */
    }
  };
  const mostradas = colunas.filter(vis);

  function novoQd() {
    const q = novoQuadro(quadros.length + 1);
    setQuadros((qs) => [...qs, q]);
    setAtivo(q.id);
  }

  const proxTag = () => {
    const nums = ativo.circuitos.map((c) => Number(c.tag.replace(/\D/g, "")) || 0);
    return Math.max(0, ...nums) + 1;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="q-ativo" className="field-label">
            Quadro
          </label>
          <select id="q-ativo" className="field-input min-w-[160px]" value={ativo.id} onChange={(e) => setAtivo(e.target.value)}>
            {quadros.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q-nome" className="field-label">
            Nome (TAG)
          </label>
          <input id="q-nome" className="field-input w-36" value={ativo.nome} onChange={(e) => setQ((q) => ({ ...q, nome: e.target.value }))} />
        </div>
        <div className="min-w-[180px] flex-1">
          <label htmlFor="q-desc" className="field-label">
            Descrição
          </label>
          <input id="q-desc" className="field-input" value={ativo.descricao} onChange={(e) => setQ((q) => ({ ...q, descricao: e.target.value }))} placeholder="Ex.: Quadro de distribuição de força e luz — térreo" />
        </div>
        <button type="button" className="btn-secondary" onClick={novoQd}>
          <Plus className="h-4 w-4" /> Novo quadro
        </button>
        {quadros.length > 1 && (
          <button
            type="button"
            className="btn-link-danger"
            onClick={() => {
              if (!confirm(`Excluir o quadro ${ativo.nome} e seus circuitos?`)) return;
              const resto = quadros.filter((q) => q.id !== ativo.id);
              setQuadros(() => resto);
              setAtivo(resto[0].id);
            }}
          >
            <Trash2 className="h-4 w-4" /> Excluir quadro
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setVerColunas(true)}>
          <Columns3 className="h-4 w-4" /> Colunas ({mostradas.length}/{colunas.length})
        </button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setVerDemanda(true)}>
          <Percent className="h-4 w-4" /> Fatores de demanda
        </button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setVerTipos(true)}>
          <Settings2 className="h-4 w-4" /> Tipos de carga
        </button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onBalancear}>
          <Scale className="h-4 w-4" /> Balancear fases
        </button>
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onExportar}>
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 dark:bg-slate-900">Circuito</th>
              {mostradas.map((c) => (
                <th key={c.id} className={`whitespace-nowrap px-2 py-2 font-semibold ${c.num ? "text-right" : ""}`}>
                  {c.titulo}
                </th>
              ))}
              <th className="px-2 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t-2 border-gta-navy/30 bg-indigo-50/50 dark:bg-indigo-900/10">
              <td className="sticky left-0 z-10 bg-indigo-50 px-2 py-1.5 dark:bg-slate-800">
                <button type="button" className="btn-link font-bold" onClick={() => onAbrir("geral")}>
                  GERAL
                </button>
              </td>
              {mostradas.map((c) => (
                <td key={c.id} className={`whitespace-nowrap px-2 py-1.5 ${c.num ? "text-right font-mono" : ""}`}>
                  {c.id === "comp" ? fmtNum(resultado.geral.comprimento) : c.cel(null, resultado.geral)}
                </td>
              ))}
              <td className="px-2 py-1.5">
                <button type="button" className="btn-link text-xs" onClick={() => onAbrir("geral")}>
                  Editar
                </button>
              </td>
            </tr>
            {ativo.circuitos.map((c) => {
              const r = resultado.circuitos.find((x) => x.id === c.id)!;
              const e = estado(r);
              return (
                <tr key={c.id} className={`border-t border-slate-100 dark:border-slate-700 ${e === "falha" ? "bg-red-50/60 dark:bg-red-900/10" : ""} ${c.reserva ? "opacity-60" : ""}`}>
                  <td className="sticky left-0 z-10 bg-white px-2 py-1.5 dark:bg-slate-800">
                    <button type="button" className="btn-link font-semibold" onClick={() => onAbrir(c.id)} title="Abrir ficha do circuito">
                      {c.tag}
                    </button>
                  </td>
                  {mostradas.map((col) => (
                    <td key={col.id} className={`whitespace-nowrap px-2 py-1 ${col.num ? "text-right font-mono" : ""}`}>
                      {col.cel(c, r)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-1">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Duplicar"
                      aria-label={`Duplicar ${c.tag}`}
                      onClick={() => setQ((q) => {
                        const i = q.circuitos.findIndex((x) => x.id === c.id);
                        const copia = { ...structuredClone(c), id: novoIdQ("circ"), tag: `C${proxTag()}` };
                        const lista = [...q.circuitos];
                        lista.splice(i + 1, 0, copia);
                        return { ...q, circuitos: lista };
                      })}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="icon-btn" title="Remover" aria-label={`Remover ${c.tag}`} onClick={() => setQ((q) => ({ ...q, circuitos: q.circuitos.filter((x) => x.id !== c.id) }))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-primary" onClick={() => setQ((q) => ({ ...q, circuitos: [...q.circuitos, novoCircuito(proxTag(), q.tiposCarga)] }))}>
          <Plus className="h-4 w-4" /> Adicionar circuito
        </button>
        <div className="flex flex-wrap gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900/50">
          {(["A", "B", "C"] as const).map((f) => (
            <span key={f}>
              Fase {f}: <strong>{fmtNum(resultado.fases[f].I, 1)} A</strong> · {fmtNum(resultado.fases[f].kVA, 2)} kVA
            </span>
          ))}
          <span className={resultado.fases.desequilibrio > 20 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>Diferença: {fmtNum(resultado.fases.desequilibrio, 1)}%</span>
        </div>
      </div>

      <Dialogo aberto={verColunas} titulo="Colunas da tabela" onFechar={() => setVerColunas(false)}>
        <div className="grid grid-cols-2 gap-1.5">
          {colunas.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vis(c)} onChange={(e) => alternar(c.id, e.target.checked)} /> {c.titulo}
            </label>
          ))}
        </div>
      </Dialogo>

      <Dialogo aberto={verDemanda} titulo={`Fatores de demanda — ${ativo.nome}`} onFechar={() => setVerDemanda(false)} largura="max-w-2xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Ativa instalada", `${fmtNum(resultado.potencias.Pinst / 1000, 2)} kW`],
            ["Ativa demandada", `${fmtNum(resultado.potencias.Pdem / 1000, 2)} kW`],
            ["Reativa", `${fmtNum(resultado.potencias.Qdem / 1000, 2)} kvar`],
            ["Aparente", `${fmtNum(resultado.potencias.Sdem / 1000, 2)} kVA`],
          ].map(([a, b]) => (
            <div key={a} className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
              <div className="hint">{a}</div>
              <div className="font-semibold">{b}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">
          Alimentador: <strong>{ativo.geral.tipo === "mono" ? "monofásico" : ativo.geral.tipo === "bi" ? "bifásico" : "trifásico"}</strong> · disjuntor geral{" "}
          <strong>
            {resultado.geral.In} A {resultado.geral.curva}
          </strong>{" "}
          · Ib {fmtNum(resultado.geral.Ib, 1)} A.{" "}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setVerDemanda(false);
              onAbrir("geral");
            }}
          >
            Editar alimentador
          </button>
        </p>
        <table className="table-compacta mt-3">
          <thead>
            <tr>
              <th className="py-2 pr-2">Grupo</th>
              <th className="py-2 pr-2 text-right">Instalada (W)</th>
              <th className="py-2 pr-2 text-right">FD (%)</th>
              <th className="py-2 text-right">Demandada (W)</th>
            </tr>
          </thead>
          <tbody>
            {GRUPOS_DEMANDA.map((g) => {
              const linha = resultado.grupos.find((x) => x.id === g.id);
              const fd = ativo.fatoresDemanda[g.id] ?? 100;
              return (
                <tr key={g.id} className={linha ? "" : "opacity-50"}>
                  <td className="py-1.5 pr-2">
                    <strong>{g.id}</strong> — {g.nome}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmtNum(linha?.Pinst ?? 0, 0)}</td>
                  <td className="py-1.5 pr-2 text-right">
                    <NumInput value={fd} min={0} max={100} largura="80px" className="!py-1 ml-auto text-right text-xs" ariaLabel={`Fator de demanda do grupo ${g.id}`} onChange={(v) => setQ((q) => ({ ...q, fatoresDemanda: { ...q.fatoresDemanda, [g.id]: v ?? 100 } }))} />
                  </td>
                  <td className="py-1.5 text-right font-mono">{fmtNum(linha?.Pdem ?? 0, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 hint">Fatores editáveis: confira a norma de fornecimento da distribuidora.</p>
      </Dialogo>

      <Dialogo aberto={verTipos} titulo="Tipos de carga" onFechar={() => setVerTipos(false)}>
        <p className="mb-3 hint">Cada tipo vira uma coluna de quantidades na tabela (ex.: tomadas 100 W/un, iluminação 60 W/un).</p>
        <div className="space-y-2">
          {ativo.tiposCarga.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <input className="field-input flex-1" value={t.nome} aria-label="Nome do tipo" onChange={(e) => setQ((q) => ({ ...q, tiposCarga: q.tiposCarga.map((x) => (x.id === t.id ? { ...x, nome: e.target.value } : x)) }))} />
              <div className="w-32">
                <NumInput value={t.potencia} min={0} sufixo="W/un" ariaLabel="Potência unitária" onChange={(v) => setQ((q) => ({ ...q, tiposCarga: q.tiposCarga.map((x) => (x.id === t.id ? { ...x, potencia: v ?? 0 } : x)) }))} />
              </div>
              <button type="button" className="icon-btn" aria-label={`Remover ${t.nome}`} onClick={() => setQ((q) => ({ ...q, tiposCarga: q.tiposCarga.filter((x) => x.id !== t.id) }))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-3"
          onClick={() => setQ((q) => ({ ...q, tiposCarga: [...q.tiposCarga, { id: novoIdQ("tipo"), nome: "Nova carga", potencia: 100 } as TipoCarga] }))}
        >
          <Plus className="h-4 w-4" /> Adicionar tipo de carga
        </button>
      </Dialogo>
    </div>
  );
}
