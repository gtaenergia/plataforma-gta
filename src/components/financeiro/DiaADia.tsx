"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { brl, brl0 } from "@/lib/financeiro/formato";
import { diaDaSemana, diaMes, rotuloMes, SEMANA } from "@/lib/financeiro/datas";
import { SeletorMes } from "./comum";
import { useFinanceiro } from "./FinanceiroProvider";

/** Aba "Dia a dia": o saldo no fim de cada dia do mês e o que entra e sai. */
export function DiaADia() {
  const { mesesCx, serie, hoje } = useFinanceiro();
  const params = useSearchParams();
  const ms = mesesCx.map((m) => m.m);
  const pedido = params.get("mes");
  const [escolhido, setEscolhido] = useState(pedido ?? hoje.slice(0, 7));
  if (!ms.length) return <p className="empty">Sem dados ainda.</p>;
  const cur = ms.includes(escolhido) ? escolhido : ms.includes(hoje.slice(0, 7)) ? hoje.slice(0, 7) : ms[0];
  const mo = mesesCx.find((m) => m.m === cur)!;
  const rows = serie.filter((p) => p.d.startsWith(cur));

  return (
    <section className="view">
      <div className="card">
        <div className="row sb">
          <h2>Dia a dia de {rotuloMes(cur)}</h2>
          <SeletorMes meses={ms} valor={cur} onChange={setEscolhido} />
        </div>
        <p className="sub msg" style={{ margin: "6px 0 10px" }}>
          Entra <b className="cin">{brl(mo.in)}</b>, sai <b className="cout">{brl(mo.out)}</b>, fecha em <b className={mo.fim < 0 ? "neg" : ""}>{brl(mo.fim)}</b>.
          Menor saldo: <b className={mo.min < 0 ? "neg" : ""}>{brl(mo.min)}</b> no dia {diaMes(mo.minD)}.
        </p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th className="n">Entradas</th>
                <th className="n">Saídas</th>
                <th className="n">Saldo no fim do dia</th>
                <th>Lançamentos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const wd = diaDaSemana(p.d);
                return (
                  <tr key={p.d} className={`${p.d === hoje ? "today" : ""} ${wd === 0 || wd === 6 ? "we" : ""}`}>
                    <td>
                      {p.d.slice(8)} <small>{SEMANA[wd]}</small>
                      {p.d === hoje && (
                        <>
                          {" "}
                          <span className="pill warn">hoje</span>
                        </>
                      )}
                    </td>
                    <td className="n cin">{p.in ? brl(p.in) : ""}</td>
                    <td className="n cout">{p.out ? brl(p.out) : ""}</td>
                    <td className={`n ${p.bal < 0 ? "neg" : ""}`}>{brl(p.bal)}</td>
                    <td>
                      {p.items.map((e) => (
                        <span key={e.id} className={`chip ${e.k}`} title={e.cat}>
                          {e.pago ? "✓ " : ""}
                          {e.desc} · {brl0(e.valor)}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
