"use client";

import { useMemo, useState } from "react";
import { brl, brl0 } from "@/lib/financeiro/formato";
import { rotuloMes } from "@/lib/financeiro/datas";
import type { Evento } from "@/lib/financeiro/motor";
import { BarrasHorizontais, GraficoBarras } from "./Graficos";
import { useFinanceiro } from "./FinanceiroProvider";

/** Aba "Gráficos": para onde o dinheiro vai e de onde vem. */
export function AbaGraficos() {
  const { evs, dados } = useFinanceiro();
  const [per, setPer] = useState("all");
  const ms = useMemo(() => [...new Set(evs.map((e) => e.data.slice(0, 7)))].sort(), [evs]);
  const anos = [...new Set(ms.map((m) => m.slice(0, 4)))];
  const opcoes = [{ v: "all", t: "Tudo que está lançado" }, ...anos.map((y) => ({ v: y, t: `Ano de ${y}` })), ...ms.map((m) => ({ v: m, t: rotuloMes(m) }))];
  const p = opcoes.some((o) => o.v === per) ? per : "all";
  const rotulo = opcoes.find((o) => o.v === p)!.t.toLowerCase();
  const sel = evs.filter((e) => p === "all" || e.data.startsWith(p));

  const agg = (k: "d" | "r", f: (e: Evento) => string) => {
    const m = new Map<string, number>();
    for (const e of sel) if (e.k === k) m.set(f(e), (m.get(f(e)) ?? 0) + e.valor);
    return m;
  };
  const porMes = new Map<string, { lb: string; in: number; out: number }>();
  for (const e of sel) {
    const m = e.data.slice(0, 7);
    if (!porMes.has(m)) porMes.set(m, { lb: rotuloMes(m), in: 0, out: 0 });
    porMes.get(m)![e.k === "r" ? "in" : "out"] += e.valor;
  }
  const barras = [...porMes].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((x) => x[1]);

  const pj = new Map<string, { r: number; d: number }>();
  for (const e of sel) {
    if (!e.proj) continue;
    if (!pj.has(e.proj)) pj.set(e.proj, { r: 0, d: 0 });
    pj.get(e.proj)![e.k] += e.valor;
  }
  const projetos = [...pj].sort((a, b) => b[1].r - b[1].d - (a[1].r - a[1].d));

  const h = dados.historico?.meses ?? [];
  const te = h.reduce((s, x) => s + x.ent, 0);
  const ts = h.reduce((s, x) => s + x.sai, 0);

  return (
    <section className="view">
      <div className="row">
        <label htmlFor="fin-per" className="msg">
          Período
        </label>
        <select id="fin-per" value={p} onChange={(e) => setPer(e.target.value)}>
          {opcoes.map((o) => (
            <option key={o.v} value={o.v}>
              {o.t}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        <h2>Entradas e saídas por mês</h2>
        <div className="lg">
          <span>
            <i style={{ background: "var(--in)" }} />
            Entradas
          </span>
          <span>
            <i style={{ background: "var(--out)" }} />
            Saídas
          </span>
        </div>
        <GraficoBarras rows={barras} rotulo="Entradas e saídas por mês" />
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Custos por categoria</h2>
          <p className="sub">Onde o dinheiro é gasto, {rotulo}.</p>
          <BarrasHorizontais mapa={agg("d", (e) => e.cat)} cor="var(--out)" />
        </div>
        <div className="card">
          <h2>Recebimentos por categoria</h2>
          <p className="sub">De que tipo de trabalho o dinheiro vem, {rotulo}.</p>
          <BarrasHorizontais mapa={agg("r", (e) => e.cat)} cor="var(--in)" />
        </div>
        <div className="card">
          <h2>Custos: fixo e variável</h2>
          <p className="sub">Fixo é o que vence todo mês, com ou sem venda.</p>
          <BarrasHorizontais mapa={agg("d", (e) => (e.nat === "fixo" ? "Fixo" : "Variável"))} cor="var(--out)" />
        </div>
        <div className="card">
          <h2>Recebimentos: recorrente e pontual</h2>
          <p className="sub">Recorrente é contrato mensal. Pontual depende de vender de novo.</p>
          <BarrasHorizontais mapa={agg("r", (e) => (e.nat === "fixo" ? "Recorrente" : "Pontual"))} cor="var(--in)" />
        </div>
        <div className="card">
          <h2>Custos por fornecedor</h2>
          <p className="sub">Para quem o dinheiro vai.</p>
          <BarrasHorizontais mapa={agg("d", (e) => e.quem || "Não informado")} cor="var(--out)" />
        </div>
        <div className="card">
          <h2>Recebimentos por cliente</h2>
          <p className="sub">De quem o dinheiro vem.</p>
          <BarrasHorizontais mapa={agg("r", (e) => e.quem || "Não informado")} cor="var(--in)" />
        </div>
      </div>
      <div className="card">
        <h2>Resultado por projeto</h2>
        <p className="sub">Recebido menos custo direto dos lançamentos ligados a cada projeto. Primeira leitura de margem.</p>
        <div className="tw">
          {projetos.length ? (
            <table>
              <thead>
                <tr>
                  <th>Projeto</th>
                  <th className="n">Recebimentos</th>
                  <th className="n">Custos diretos</th>
                  <th className="n">Resultado</th>
                  <th className="n">Margem</th>
                </tr>
              </thead>
              <tbody>
                {projetos.map(([k, v]) => {
                  const res = v.r - v.d;
                  return (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="n cin">{brl(v.r)}</td>
                      <td className="n cout">{brl(v.d)}</td>
                      <td className={`n ${res < 0 ? "neg" : ""}`}>{brl(res)}</td>
                      <td className="n">{v.r > 0 ? Math.round((res / v.r) * 100) + "%" : "sem receita lançada"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">Preencha o campo de projeto nos lançamentos para ver o resultado de cada um.</p>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Histórico do banco: últimos 12 meses</h2>
        <p className="sub">
          {h.length ? (
            <>
              Movimento real da conta ({dados.historico?.fonte || "extrato"}). Média por mês: entradas <b>{brl0(te / h.length)}</b>, saídas <b>{brl0(ts / h.length)}</b>.
            </>
          ) : (
            "Movimento real da conta, tirado do extrato."
          )}
        </p>
        <div className="lg">
          <span>
            <i style={{ background: "var(--in)" }} />
            Entradas
          </span>
          <span>
            <i style={{ background: "var(--out)" }} />
            Saídas
          </span>
        </div>
        <GraficoBarras rows={h.map((x) => ({ lb: rotuloMes(x.m), in: x.ent, out: x.sai }))} rotulo="Histórico do banco" />
      </div>
    </section>
  );
}
