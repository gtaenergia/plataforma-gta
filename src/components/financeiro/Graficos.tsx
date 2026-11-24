"use client";

import { useId, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { brl, brl0, kfmt } from "@/lib/financeiro/formato";
import { diaMes, diaMesAno, rotuloMes } from "@/lib/financeiro/datas";
import type { DiaCaixa } from "@/lib/financeiro/motor";

/**
 * Os três gráficos do artefato (linha do saldo, barras de entradas × saídas e
 * barras horizontais), em SVG puro como lá — sem biblioteca de gráficos.
 */

// ------------------------------------------------------------------ dica

export function useDica() {
  const [dica, setDica] = useState<{ x: number; y: number; conteudo: ReactNode } | null>(null);
  const mostrar = (ev: { clientX: number; clientY: number }, conteudo: ReactNode) => setDica({ x: ev.clientX, y: ev.clientY, conteudo });
  const esconder = () => setDica(null);
  const el = dica ? <Dica {...dica} /> : null;
  return { mostrar, esconder, el };
}

function Dica({ x, y, conteudo }: { x: number; y: number; conteudo: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const w = ref.current?.offsetWidth ?? 180;
  const h = ref.current?.offsetHeight ?? 50;
  let left = x + 14;
  let top = y + 14;
  if (typeof window !== "undefined") {
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
  }
  return (
    <div ref={ref} className="fin-tip" role="tooltip" style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
      {conteudo}
    </div>
  );
}

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const st = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  const t: number[] = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) t.push(Math.round(v));
  return t;
}

// ----------------------------------------------------------- saldo (linha)

export function GraficoSaldo({ pts }: { pts: DiaCaixa[] }) {
  const id = useId().replace(/:/g, "");
  const { mostrar, esconder, el } = useDica();
  const [cursor, setCursor] = useState<number | null>(null);
  if (pts.length < 2) return <p className="empty">Sem dados para o período.</p>;

  const W = 640, H = 250, L = 52, R = 12, T = 12, B = 26;
  let lo = Math.min(0, ...pts.map((p) => p.bal));
  let hi = Math.max(0, ...pts.map((p) => p.bal));
  const padv = (hi - lo) * 0.08 || 100;
  lo -= lo < 0 ? padv : 0;
  hi += padv;
  const x = (i: number) => L + ((W - L - R) * i) / (pts.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let path = "";
  pts.forEach((p, i) => {
    const X = x(i).toFixed(1), Y = y(p.bal).toFixed(1);
    path += i ? `H${X}V${Y}` : `M${X},${Y}`;
  });
  const z = y(0);
  const area = path + `V${z.toFixed(1)}H${L}Z`;
  const mi = pts.reduce((b, p, i) => (p.bal < pts[b].bal ? i : b), 0);
  const last = pts.length - 1;
  const rotulosX: { X: number; t: string; a: "start" | "middle" }[] = [];
  let lastX = -99;
  pts.forEach((p, i) => {
    if (p.d.slice(8) === "01" || i === 0) {
      const X = x(i);
      if (X - lastX > 44) {
        rotulosX.push({ X, t: i === 0 ? diaMes(p.d) : rotuloMes(p.d.slice(0, 7)), a: i === 0 ? "start" : "middle" });
        lastX = X;
      }
    }
  });

  function mover(ev: RPointerEvent<SVGRectElement>) {
    const r = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * last)));
    const p = pts[i];
    setCursor(i);
    mostrar(
      ev,
      <>
        <b>{diaMesAno(p.d)}</b> · saldo {brl(p.bal)}
        {p.in ? <><br />entra {brl(p.in)}</> : null}
        {p.out ? <><br />sai {brl(p.out)}</> : null}
      </>,
    );
  }

  return (
    <>
      <svg className="ch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Saldo previsto por dia">
        <defs>
          <clipPath id={`${id}p`}><rect x="0" y="0" width={W} height={Math.max(0, z)} /></clipPath>
          <clipPath id={`${id}n`}><rect x="0" y={z} width={W} height={H} /></clipPath>
        </defs>
        {niceTicks(lo, hi).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{kfmt(t)}</text>
          </g>
        ))}
        <path d={area} fill="var(--in)" opacity=".13" clipPath={`url(#${id}p)`} />
        <path d={area} fill="var(--crit)" opacity=".16" clipPath={`url(#${id}n)`} />
        <line x1={L} x2={W - R} y1={z} y2={z} stroke="var(--line2)" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="var(--in)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${id}p)`} />
        <path d={path} fill="none" stroke="var(--crit)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${id}n)`} />
        {[mi, last].map((i) => (
          <circle key={i} cx={x(i)} cy={y(pts[i].bal)} r="4" fill={pts[i].bal < 0 ? "var(--crit)" : "var(--in)"} stroke="var(--surface)" strokeWidth="2" />
        ))}
        {rotulosX.map((r) => (
          <text key={r.X} x={r.X} y={H - 8} textAnchor={r.a}>{r.t}</text>
        ))}
        {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={T} y2={H - B} stroke="var(--ink2)" strokeWidth="1" strokeDasharray="3 3" />}
        <rect
          x={L}
          y={T}
          width={W - L - R}
          height={H - T - B}
          fill="transparent"
          onPointerMove={mover}
          onPointerLeave={() => {
            setCursor(null);
            esconder();
          }}
        />
      </svg>
      <p className="msg">
        Menor saldo do período: <b className={pts[mi].bal < 0 ? "neg" : ""}>{brl(pts[mi].bal)}</b> em {diaMesAno(pts[mi].d)}. Fim do período:{" "}
        <b className={pts[last].bal < 0 ? "neg" : ""}>{brl(pts[last].bal)}</b>.
      </p>
      {el}
    </>
  );
}

// ------------------------------------------------ entradas × saídas (barras)

export function GraficoBarras({ rows, rotulo }: { rows: { lb: string; in: number; out: number }[]; rotulo: string }) {
  const { mostrar, esconder, el } = useDica();
  if (!rows.length) return <p className="empty">Sem dados para o período.</p>;
  const W = 900, H = 240, L = 52, R = 8, T = 10, B = 26;
  const hi = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out))) * 1.06;
  const y = (v: number) => T + (H - T - B) * (1 - v / hi);
  const gw = (W - L - R) / rows.length;
  const bw = Math.min(24, (gw - 8) / 2);
  const bar = (X: number, v: number, c: string) => {
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, h);
    if (h <= 0) return null;
    return <path d={`M${X},${y(0)}V${y(v) + r}q0,-${r} ${r},-${r}H${X + bw - r}q${r},0 ${r},${r}V${y(0)}Z`} fill={c} />;
  };
  return (
    <>
      <svg className="ch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={rotulo}>
        {niceTicks(0, hi).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{kfmt(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = L + gw * i + gw / 2;
          return (
            <g
              key={i}
              onPointerMove={(ev) =>
                mostrar(
                  ev,
                  <>
                    <b>{r.lb}</b>
                    <br />entradas {brl(r.in)}
                    <br />saídas {brl(r.out)}
                    <br />resultado {brl(r.in - r.out)}
                  </>,
                )
              }
              onPointerLeave={esconder}
            >
              {bar(cx - bw - 1, r.in, "var(--in)")}
              {bar(cx + 1, r.out, "var(--out)")}
              <text x={cx} y={H - 8} textAnchor="middle">{r.lb}</text>
              <rect x={L + gw * i} y={T} width={gw} height={H - T - B} fill="transparent" />
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeWidth="1.5" />
      </svg>
      {el}
    </>
  );
}

// ------------------------------------------------------ barras horizontais

export function BarrasHorizontais({ mapa, cor }: { mapa: Map<string, number>; cor: string }) {
  const rows = [...mapa].filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <p className="empty">Nada lançado neste período.</p>;
  const tot = rows.reduce((s, r) => s + r[1], 0);
  const mx = rows[0][1];
  return (
    <>
      <div className="hb">
        {rows.map(([k, v]) => (
          <Linha key={k} rotulo={k || "Sem nome"} v={v} pctDoMax={(v / mx) * 100} pctDoTotal={Math.round((v / tot) * 100)} cor={cor} />
        ))}
      </div>
      <div className="kv" style={{ marginTop: 10 }}>
        <span className="tot">Total</span>
        <b className="tot">{brl(tot)}</b>
      </div>
    </>
  );
}

function Linha({ rotulo, v, pctDoMax, pctDoTotal, cor }: { rotulo: string; v: number; pctDoMax: number; pctDoTotal?: number; cor: string }) {
  return (
    <>
      <div>{rotulo}</div>
      <div className="tr">
        <div className="br" style={{ width: `${pctDoMax.toFixed(1)}%`, background: cor }} />
      </div>
      <div className="vl">
        {brl0(v)} {pctDoTotal !== undefined && <small>{pctDoTotal}%</small>}
      </div>
    </>
  );
}

/** Barras sem total nem percentual (estrutura fixa da Visão geral). */
export function BarrasSimples({ itens, cor }: { itens: { rotulo: string; v: number }[]; cor: string }) {
  const mx = Math.max(1, ...itens.map((i) => i.v));
  return (
    <div className="hb">
      {itens.map((i, n) => (
        <Linha key={n} rotulo={i.rotulo} v={i.v} pctDoMax={(i.v / mx) * 100} cor={cor} />
      ))}
    </div>
  );
}
