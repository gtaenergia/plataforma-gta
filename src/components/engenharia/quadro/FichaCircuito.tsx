"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { Circuito, Condutores, EsquemaCondutores, Fase, Geral, Protecao, Quadro } from "@/lib/engenharia/quadro/tipos";
import { faseCoerente, polosDoEsquema, type ResultadoCircuito } from "@/lib/engenharia/quadro/motor";
import {
  CAPACIDADES_INTERRUPCAO,
  CORRENTES_DISJUNTOR,
  GRUPOS_DEMANDA,
  METODOS_INSTALACAO,
  SENSIBILIDADES_DR,
  multiploCurva,
  secoesDe,
  type ConfigCabos,
} from "@/lib/engenharia/quadro/tabelas";
import { fmtNum } from "@/lib/engenharia/formato";
import { NumInput, SeloVerif } from "../comum";
import { campoQuadro } from "./EtapaConfig";

export const ESQUEMAS: { id: EsquemaCondutores; rotulo: string }[] = [
  { id: "F+N+PE", rotulo: "Monofásico (F+N+PE)" },
  { id: "2F+PE", rotulo: "Bifásico (2F+PE)" },
  { id: "2F+N+PE", rotulo: "Bifásico (2F+N+PE)" },
  { id: "3F+PE", rotulo: "Trifásico (3F+PE)" },
  { id: "3F+N+PE", rotulo: "Trifásico (3F+N+PE)" },
];

export const CONFIGS: { id: ConfigCabos; rotulo: string }[] = [
  { id: "unipolar-trifolio", rotulo: "Unipolares em trifólio / condutores isolados" },
  { id: "unipolar-justaposto", rotulo: "Unipolares justapostos (mesmo plano)" },
  { id: "unipolar-espacado-h", rotulo: "Unipolares espaçados — horizontal" },
  { id: "unipolar-espacado-v", rotulo: "Unipolares espaçados — vertical" },
  { id: "multipolar", rotulo: "Cabo multipolar" },
];

function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-4 dark:border-slate-700">
      <h3 className="mb-3 text-sm font-semibold text-gta-navy dark:text-slate-100">
        {n}. {titulo}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Info({ rotulo, valor, destaque }: { rotulo: string; valor: ReactNode; destaque?: "ok" | "falha" }) {
  return (
    <div className="rounded-md bg-slate-50 p-2 dark:bg-slate-900/50">
      <div className="hint">{rotulo}</div>
      <div className={`font-mono text-sm font-semibold ${destaque === "falha" ? "text-red-600" : destaque === "ok" ? "text-green-700 dark:text-green-400" : ""}`}>{valor}</div>
    </div>
  );
}

export function FichaCircuito({
  quadro,
  circuito,
  geral,
  r,
  onCircuito,
  onGeral,
  onFechar,
}: {
  quadro: Quadro;
  circuito: Circuito | null;
  geral: Geral | null;
  r: ResultadoCircuito;
  onCircuito: (p: Partial<Circuito>) => void;
  onGeral: (p: Partial<Geral>) => void;
  onFechar: () => void;
}) {
  const prot: Protecao = circuito ? circuito.protecao : geral!.protecao;
  const cond: Condutores = circuito ? circuito.cond : geral!.cond;
  const comprimento = circuito ? circuito.comprimento : geral!.comprimento;
  const setProt = (p: Partial<Protecao>) => (circuito ? onCircuito({ protecao: { ...prot, ...p } }) : onGeral({ protecao: { ...prot, ...p } }));
  const setCond = (p: Partial<Condutores>) => (circuito ? onCircuito({ cond: { ...cond, ...p } }) : onGeral({ cond: { ...cond, ...p } }));
  const setComp = (v: number | null) => (circuito ? onCircuito({ comprimento: v }) : onGeral({ comprimento: v }));
  const id = circuito?.id ?? "geral";
  const curto: "ok" | "falha" | "sem-dados" = [r.verif.icu, r.verif.termica, r.verif.magnetica].includes("falha")
    ? "falha"
    : [r.verif.icu, r.verif.termica, r.verif.magnetica].includes("sem-dados")
      ? "sem-dados"
      : "ok";

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800" aria-label={`Ficha do circuito ${r.tag}`}>
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-700">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{circuito ? "Circuito" : `Alimentador de ${quadro.nome}`}</div>
          <div className="text-lg font-bold text-gta-navy dark:text-slate-100">
            {r.tag} {r.descricao && <span className="font-normal text-slate-600 dark:text-slate-300">— {r.descricao}</span>}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onFechar} aria-label="Fechar ficha">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2 px-5 pt-3 text-center">
        <Info rotulo="Ib" valor={`${fmtNum(r.Ib, 1)} A`} />
        <Info rotulo="In" valor={`${r.In} A`} />
        <Info rotulo="Seção" valor={`${fmtNum(r.secao)} mm²`} />
        <Info rotulo="Iz" valor={`${fmtNum(r.iz, 1)} A`} />
        <Info rotulo="ΔV acum." valor={r.dvAcumulada != null ? `${fmtNum(r.dvAcumulada, 2)}%` : "—"} />
      </div>
      <div className="flex flex-wrap gap-2 px-5 pt-2">
        <SeloVerif v={r.verif.sobrecarga} rotulo="Sobrecarga" />
        <SeloVerif v={r.verif.queda} rotulo="Queda" />
        <SeloVerif v={curto} rotulo="Curto" />
      </div>
      {r.avisos.length > 0 && (
        <ul className="mx-5 mt-2 list-disc rounded-md bg-amber-50 py-2 pl-8 pr-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {r.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Secao n={1} titulo="Carga">
          {circuito ? (
            <>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor={`${id}-desc`}>Descrição</label>
                <input id={`${id}-desc`} className="field-input" value={circuito.descricao} onChange={(e) => onCircuito({ descricao: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-grupo`}>Grupo de demanda</label>
                <select id={`${id}-grupo`} className="field-input" value={circuito.grupo} onChange={(e) => onCircuito({ grupo: e.target.value })}>
                  {GRUPOS_DEMANDA.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.id} — {g.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-uso`}>Uso (seção mínima, Tabela 47)</label>
                <select id={`${id}-uso`} className="field-input" value={circuito.uso} onChange={(e) => onCircuito({ uso: e.target.value as Circuito["uso"] })}>
                  <option value="forca">Força / tomadas (2,5 mm²)</option>
                  <option value="iluminacao">Iluminação (1,5 mm²)</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-esq`}>Esquema de condutores</label>
                <select
                  id={`${id}-esq`}
                  className="field-input"
                  value={circuito.esquema}
                  onChange={(e) => {
                    const esquema = e.target.value as EsquemaCondutores;
                    onCircuito({ esquema, fase: faseCoerente(esquema, circuito.fase) });
                  }}
                >
                  {ESQUEMAS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-fase`}>Fase de ligação</label>
                <select id={`${id}-fase`} className="field-input" value={circuito.fase} onChange={(e) => onCircuito({ fase: e.target.value as Fase })}>
                  {(polosDoEsquema(circuito.esquema) === 1 ? ["A", "B", "C"] : polosDoEsquema(circuito.esquema) === 2 ? ["AB", "BC", "CA"] : ["ABC"]).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              {quadro.tiposCarga.map((t) => (
                <div key={t.id}>
                  <label className="field-label" htmlFor={`${id}-q-${t.id}`}>
                    {t.nome} ({fmtNum(t.potencia)} W/un)
                  </label>
                  <NumInput id={`${id}-q-${t.id}`} value={circuito.quantidades[t.id] ?? 0} min={0} sufixo="un" onChange={(v) => onCircuito({ quantidades: { ...circuito.quantidades, [t.id]: Math.max(0, Math.round(v ?? 0)) } })} />
                </div>
              ))}
              <div>
                <label className="field-label" htmlFor={`${id}-esp`}>Carga especial</label>
                <NumInput id={`${id}-esp`} value={circuito.cargaEspecial} min={0} sufixo="W" onChange={(v) => onCircuito({ cargaEspecial: v })} />
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-fp`}>Fator de potência</label>
                <NumInput id={`${id}-fp`} value={circuito.fp} min={0.1} max={1} onChange={(v) => onCircuito({ fp: v ?? 1 })} />
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-thd`}>THD-I (3ª harmônica e múltiplos)</label>
                <NumInput id={`${id}-thd`} value={circuito.thd} min={0} max={200} sufixo="%" onChange={(v) => onCircuito({ thd: v ?? 0 })} />
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" checked={Boolean(circuito.reserva)} onChange={(e) => onCircuito({ reserva: e.target.checked })} /> Circuito reserva (sem carga)
              </label>
              <Info rotulo="P / S / Q" valor={`${fmtNum(r.P, 0)} W · ${fmtNum(r.S, 0)} VA · ${fmtNum(r.Q, 0)} var`} />
            </>
          ) : (
            <>
              <div>
                <label className="field-label" htmlFor="geral-tipo">Tipo do alimentador</label>
                <select id="geral-tipo" className="field-input" value={geral!.tipo} onChange={(e) => onGeral({ tipo: e.target.value as Geral["tipo"] })}>
                  <option value="mono">Monofásico (F+N+PE)</option>
                  <option value="bi">Bifásico (2F+N+PE)</option>
                  <option value="tri">Trifásico (3F+N+PE)</option>
                </select>
              </div>
              <Info rotulo="Demanda (P / S)" valor={`${fmtNum(r.P / 1000, 2)} kW · ${fmtNum(r.S / 1000, 2)} kVA`} />
              <Info rotulo="Corrente de projeto (fase mais carregada)" valor={`${fmtNum(r.Ib, 1)} A`} />
              <Info rotulo="Fator de potência médio" valor={fmtNum(r.fp, 3)} />
            </>
          )}
        </Secao>

        <Secao n={2} titulo="Proteção">
          <div>
            <label className="field-label" htmlFor={`${id}-in`}>Disjuntor In</label>
            <select
              id={`${id}-in`}
              className="field-input"
              value={prot.inModo === "auto" ? "auto" : String(prot.In ?? "")}
              onChange={(e) => (e.target.value === "auto" ? setProt({ inModo: "auto" }) : setProt({ inModo: "manual", In: Number(e.target.value) }))}
            >
              <option value="auto">Automático ({r.In} A)</option>
              {CORRENTES_DISJUNTOR.map((v) => (
                <option key={v} value={v}>
                  {v} A
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-curva`}>Curva (disparo magnético)</label>
            <select id={`${id}-curva`} className="field-input" value={prot.curva} onChange={(e) => setProt({ curva: e.target.value as Protecao["curva"] })}>
              <option value="B">B — Im = 5·In</option>
              <option value="C">C — Im = 10·In</option>
              <option value="D">D — Im = 20·In</option>
            </select>
            <p className="mt-1 hint">Im = {multiploCurva(prot.curva)} × {r.In} = {fmtNum(r.Im)} A</p>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-icu`}>Capacidade de interrupção Icu</label>
            <select
              id={`${id}-icu`}
              className="field-input"
              value={prot.icuModo === "auto" ? "auto" : String(prot.icu ?? "")}
              onChange={(e) => (e.target.value === "auto" ? setProt({ icuModo: "auto" }) : setProt({ icuModo: "manual", icu: Number(e.target.value) }))}
            >
              <option value="auto">Automática ({r.icu != null ? `${fmtNum(r.icu)} kA` : "—"})</option>
              {CAPACIDADES_INTERRUPCAO.map((v) => (
                <option key={v} value={v}>
                  {fmtNum(v)} kA
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="field-label">Dispositivo DR</span>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={prot.dr} onChange={(e) => setProt({ dr: e.target.checked })} /> Com DR
              </label>
              {prot.dr && (
                <select className="field-input w-32" aria-label="Sensibilidade do DR" value={prot.drSens} onChange={(e) => setProt({ drSens: Number(e.target.value) })}>
                  {SENSIBILIDADES_DR.map((s) => (
                    <option key={s} value={s}>
                      {s} mA
                    </option>
                  ))}
                </select>
              )}
            </div>
            {prot.dr && <p className="mt-1 hint">DR {r.drIn} A / {prot.drSens} mA</p>}
          </div>
        </Secao>

        <Secao n={3} titulo="Condutores e instalação">
          <div>
            <label className="field-label" htmlFor={`${id}-mat`}>Material</label>
            <select id={`${id}-mat`} className="field-input" value={cond.material} onChange={(e) => setCond({ material: e.target.value as Condutores["material"], secaoModo: "auto" })}>
              <option value="Cu">Cobre</option>
              <option value="Al">Alumínio</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-iso`}>Isolação</label>
            <select id={`${id}-iso`} className="field-input" value={cond.isolacao} onChange={(e) => setCond({ isolacao: e.target.value as Condutores["isolacao"] })}>
              <option value="PVC">PVC (70 °C)</option>
              <option value="EPR">EPR (90 °C)</option>
              <option value="XLPE">XLPE (90 °C)</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-tiso`}>Tensão de isolamento</label>
            <select id={`${id}-tiso`} className="field-input" value={cond.tensaoIsolacao} onChange={(e) => setCond({ tensaoIsolacao: e.target.value as Condutores["tensaoIsolacao"] })}>
              <option>450/750 V</option>
              <option>0,6/1 kV</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-classe`}>Classe do condutor</label>
            <select id={`${id}-classe`} className="field-input" value={cond.classe} onChange={(e) => setCond({ classe: Number(e.target.value) as 2 | 5 })}>
              <option value={5}>Classe 5 (flexível)</option>
              <option value={2}>Classe 2 (rígido)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor={`${id}-met`}>Método de instalação (Tabela 33)</label>
            <select id={`${id}-met`} className="field-input" value={cond.metodo} onChange={(e) => setCond({ metodo: e.target.value })}>
              {METODOS_INSTALACAO.map((m) => (
                <option key={m.numero} value={m.numero}>
                  {m.numero} — {m.descricao} ({m.ref === "EF" ? "E/F" : m.ref})
                </option>
              ))}
            </select>
            <p className="mt-1 hint">Método de referência: {r.metodoRef}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor={`${id}-cfg`}>Configuração dos cabos</label>
            <select id={`${id}-cfg`} className="field-input" value={cond.config} onChange={(e) => setCond({ config: e.target.value as ConfigCabos })}>
              {CONFIGS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-npar`}>Condutores por fase</label>
            <NumInput id={`${id}-npar`} value={cond.condutoresPorFase} min={1} max={12} onChange={(v) => setCond({ condutoresPorFase: Math.max(1, Math.round(v ?? 1)) })} />
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-temp`}>Temperatura ({r.metodoRef === "D" ? "solo" : "ambiente"})</label>
            <NumInput id={`${id}-temp`} value={cond.temperatura} min={10} max={80} sufixo="°C" onChange={(v) => setCond({ temperatura: v ?? 30 })} />
            {r.metodoRef === "D" && <p className="mt-1 hint">Referência das tabelas: 20 °C no solo (Tabela 40).</p>}
          </div>
          <div>
            <label className="field-label" htmlFor={`${id}-agr`}>Circuitos agrupados</label>
            <NumInput id={`${id}-agr`} value={cond.agrupados} min={1} max={30} onChange={(v) => setCond({ agrupados: Math.max(1, Math.round(v ?? 1)) })} />
            {cond.condutoresPorFase > 1 && <p className="mt-1 hint">Os {cond.condutoresPorFase} conjuntos em paralelo já entram na conta (Tabela 42, nota 3).</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label" htmlFor={`${id}-k1`}>k1</label>
              <NumInput id={`${id}-k1`} value={cond.k1Manual} placeholder={fmtNum(r.k1, 2)} min={0.1} max={1.5} onChange={(v) => setCond({ k1Manual: v })} />
            </div>
            <div>
              <label className="field-label" htmlFor={`${id}-k2`}>k2</label>
              <NumInput id={`${id}-k2`} value={cond.k2Manual} placeholder={fmtNum(r.k2, 2)} min={0.1} max={1} onChange={(v) => setCond({ k2Manual: v })} />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor={campoQuadro.circ(id, "secao")}>Seção da fase</label>
            <select
              id={campoQuadro.circ(id, "secao")}
              className="field-input"
              value={cond.secaoModo === "auto" ? "auto" : String(cond.secao ?? "")}
              onChange={(e) => (e.target.value === "auto" ? setCond({ secaoModo: "auto" }) : setCond({ secaoModo: "manual", secao: Number(e.target.value) }))}
            >
              <option value="auto">Automática ({fmtNum(r.secao)} mm²)</option>
              {secoesDe(cond.material).map((s) => (
                <option key={s} value={s}>
                  {fmtNum(s)} mm²
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <span>
              Neutro: <strong>{r.secaoN != null ? `${fmtNum(r.secaoN)} mm²` : "—"}</strong> · PE: <strong>{fmtNum(r.secaoPE)} mm²</strong>
            </span>
            {(circuito ? circuito.esquema === "3F+N+PE" : geral!.tipo === "tri") && (
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={cond.neutroReduzido} onChange={(e) => setCond({ neutroReduzido: e.target.checked })} /> Neutro reduzido (Tabela 48)
              </label>
            )}
          </div>
          <Info rotulo="Iz tabelado → corrigido" valor={`${fmtNum(r.izTab, 1)} → ${fmtNum(r.iz, 1)} A`} />
          <Info rotulo="R · X do cabo (Ω/km)" valor={`${fmtNum(r.rKm, 4)} · ${fmtNum(r.xKm, 3)}`} />
        </Secao>

        <Secao n={4} titulo="Queda de tensão">
          <div>
            <label className="field-label" htmlFor={campoQuadro.circ(id, "comp")}>Comprimento do circuito</label>
            <NumInput id={campoQuadro.circ(id, "comp")} value={comprimento} min={0} sufixo="m" onChange={setComp} />
          </div>
          <Info rotulo="Limite do trecho" valor={`${fmtNum(r.limiteTrecho, 1)}%`} />
          <Info rotulo="Queda no trecho" valor={r.dvTrecho != null ? `${fmtNum(r.dvTrecho, 2)}%` : "—"} destaque={r.dvTrecho != null ? (r.dvTrecho > r.limiteTrecho ? "falha" : "ok") : undefined} />
          <Info rotulo="A montante" valor={`${fmtNum(r.dvMontante, 2)}%`} />
          <Info
            rotulo={`Acumulada (limite ${fmtNum(r.limiteGlobal)}%)`}
            valor={r.dvAcumulada != null ? `${fmtNum(r.dvAcumulada, 2)}%` : "—"}
            destaque={r.dvAcumulada != null ? (r.dvAcumulada > r.limiteGlobal ? "falha" : "ok") : undefined}
          />
        </Secao>

        <Secao n={5} titulo="Curto-circuito">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor={`${id}-i2t`}>Energia passante I²t do disjuntor (catálogo do fabricante)</label>
            <NumInput id={`${id}-i2t`} value={prot.i2tManual} min={0} sufixo="A²s" placeholder={r.i2t != null ? `estimado ${fmtNum(r.i2t, 0)}` : "—"} onChange={(v) => setProt({ i2tManual: v })} />
            <p className="mt-1 hint">{r.i2tOrigem || "Informe o Ik na configuração."}</p>
          </div>
          <Info rotulo="Ik máx. no início" valor={r.ikInicio != null ? `${fmtNum(r.ikInicio, 2)} kA` : "—"} />
          <Info rotulo="Ik máx. no fim" valor={r.ikMaxFim != null ? `${fmtNum(r.ikMaxFim, 2)} kA` : "—"} />
          <Info rotulo="Ik mín. no fim" valor={r.ikMinFim != null ? `${fmtNum(r.ikMinFim * 1000, 0)} A` : "—"} />
          <Info rotulo="I²t no início" valor={r.i2t != null ? `${fmtNum(r.i2t, 0)} A²s` : "—"} />
          <Info rotulo={`k²·S² (k = ${r.k})`} valor={`${fmtNum(r.k2s2, 0)} A²s`} />
          <Info rotulo="Seção mínima (√I²t / k)" valor={r.secaoMinCurto != null ? `${fmtNum(r.secaoMinCurto, 2)} mm²` : "—"} />
          <div className="sm:col-span-2 space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              Capacidade de interrupção (Icu ≥ Ik na origem) <SeloVerif v={r.verif.icu} />
            </div>
            <div className="flex items-center justify-between gap-2">
              Suportabilidade térmica (I²t ≤ k²S²) <SeloVerif v={r.verif.termica} />
            </div>
            <div className="flex items-center justify-between gap-2">
              Atuação magnética (Ik mín ≥ Im = {fmtNum(r.Im)} A) <SeloVerif v={r.verif.magnetica} />
            </div>
          </div>
        </Secao>
      </div>
    </aside>
  );
}
