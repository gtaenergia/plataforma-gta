"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { brl, brl0, num2 } from "@/lib/financeiro/formato";
import { diaMes, diaDaSemana, rotuloMes, SEMANA } from "@/lib/financeiro/datas";
import type { DiaDeConta } from "@/lib/financeiro/motor";
import { SeletorMes } from "./comum";
import { useFinanceiro } from "./FinanceiroProvider";

function pilula(r: DiaDeConta) {
  if (!r.tot) return <span className="pill neu">Só recebimento</span>;
  if (r.depois >= 0) return <span className="pill good">Cobre</span>;
  if (r.antes + r.inn - r.tot >= 0) return <span className="pill warn">Depende do que entra no dia</span>;
  return <span className="pill crit">Faltam {brl0(-(r.antes + r.inn - r.tot))}</span>;
}

/** Aba "Contas fixas e a pagar": saldo antes e depois de pagar, dia a dia. */
export function ContasFixas() {
  const { contas, mesesCx, serie, dados, hoje } = useFinanceiro();
  const params = useSearchParams();
  const cm = hoje.slice(0, 7);
  const ms = [...new Set([cm, ...contas.map((r) => r.d.slice(0, 7))])].sort();
  const pedido = params.get("mes");
  const [escolhido, setEscolhido] = useState(pedido && ms.includes(pedido) ? pedido : cm);
  const fxMes = ms.includes(escolhido) ? escolhido : cm;

  const rows = contas.filter((r) => r.d.startsWith(fxMes));
  const sum = (k: "tot" | "fix" | "vari" | "inn") => rows.reduce((s, r) => s + r[k], 0);
  const mo = mesesCx.find((m) => m.m === fxMes);
  const at = serie.find((p) => p.d === hoje) ?? { bal: 0 };
  const ini =
    fxMes === cm
      ? dados.saldo && dados.saldo.data === hoje
        ? dados.saldo.valor
        : rows[0]
          ? rows[0].antes
          : at.bal
      : rows[0]
        ? rows[0].antes
        : (mo?.ini ?? 0);
  const fim = mo ? mo.fim : ini;
  const pays = rows.filter((r) => r.tot > 0);
  const worst = pays.length ? pays.reduce((b, r) => (r.depois < b.depois ? r : b)) : null;

  return (
    <section className="view">
      <div className="card">
        <div className="row sb">
          <h2>Contas de {rotuloMes(fxMes)}: saldo antes e depois de pagar</h2>
          <SeletorMes meses={ms} valor={fxMes} onChange={setEscolhido} />
        </div>
        <p className="sub">
          Para cada dia com conta a pagar (fixa ou variável) ou valor a receber: quanto tem no banco antes de pagar e quanto sobra logo depois. O saldo antes é o do
          fim do dia anterior, sem contar o que entra no mesmo dia.
        </p>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className={`tile ${ini < 0 ? "neg" : "pos"}`}>
            <span className="lb">{fxMes === cm ? `Saldo agora, ${diaMes(hoje)}` : "Saldo no início do mês"}</span>
            <span className="v">{brl(ini)}</span>
            <span className="ft">antes das contas que faltam</span>
          </div>
          <div className="tile out">
            <span className="lb">Ainda a pagar no mês</span>
            <span className="v">{brl(sum("tot"))}</span>
            <span className="ft">
              fixas {brl(sum("fix"))} · variáveis {brl(sum("vari"))}
            </span>
          </div>
          <div className="tile in">
            <span className="lb">Ainda a receber no mês</span>
            <span className="v">{brl(sum("inn"))}</span>
            <span className="ft">{worst ? `pior saldo logo depois de pagar: ${brl(worst.depois)} em ${diaMes(worst.d)}` : "nenhuma conta a pagar"}</span>
          </div>
          <div className={`tile ${fim < 0 ? "neg" : "pos"}`}>
            <span className="lb">Saldo previsto no fim de {rotuloMes(fxMes)}</span>
            <span className="v">{brl(fim)}</span>
            <span className="ft">pagando e recebendo tudo que está lançado</span>
          </div>
        </div>
        <div className="tw">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th className="n">Saldo antes de pagar</th>
                  <th className="n">Contas do dia</th>
                  <th className="n">Saldo logo depois</th>
                  <th className="n">Recebe no mesmo dia</th>
                  <th className="n">Saldo no fim do dia</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => [
                  <tr key={r.d} className={r.d === hoje ? "today" : ""}>
                    <td>
                      <b>{diaMes(r.d)}</b> <small>{SEMANA[diaDaSemana(r.d)]}</small>
                    </td>
                    <td className={`n ${r.antes < 0 ? "neg" : ""}`}>{brl(r.antes)}</td>
                    <td className="n cout">{r.tot ? "− " + num2(r.tot) : ""}</td>
                    <td className={`n ${r.depois < 0 ? "neg" : ""}`}>
                      <b>{brl(r.depois)}</b>
                    </td>
                    <td className="n cin">{r.inn ? "+ " + num2(r.inn) : ""}</td>
                    <td className={`n ${r.fim < 0 ? "neg" : ""}`}>{brl(r.fim)}</td>
                    <td>{pilula(r)}</td>
                  </tr>,
                  <tr key={r.d + "-i"}>
                    <td></td>
                    <td colSpan={6} style={{ paddingTop: 2 }}>
                      {r.pay.map((e) => (
                        <span key={e.id} className="chip d">
                          {e.nat === "fixo" ? "fixa" : "variável"} · {e.desc} · {brl0(e.valor)}
                          {e.atras ? " · atrasado" : ""}
                        </span>
                      ))}
                      {r.rcv.map((e) => (
                        <span key={e.id} className="chip r">
                          recebe · {e.desc} · {brl0(e.valor)}
                          {e.crm ? " · CRM" : ""}
                          {e.atras ? " · atrasado" : ""}
                        </span>
                      ))}
                    </td>
                  </tr>,
                ])}
              </tbody>
            </table>
          ) : (
            <p className="empty">Nada em aberto neste mês: tudo que estava lançado já foi pago ou recebido.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Resumo dos próximos meses</h2>
        <p className="sub">O que falta pagar e receber em cada mês, e como o caixa fica.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="n">Antes do 1º pagamento</th>
                <th className="n">Contas fixas</th>
                <th className="n">Contas variáveis</th>
                <th className="n">A receber</th>
                <th className="n">Pior saldo logo depois de pagar</th>
                <th className="n">Saldo no fim do mês</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {ms.map((m) => {
                const rs = contas.filter((r) => r.d.startsWith(m));
                const ps = rs.filter((r) => r.tot > 0);
                const sm = (k: "fix" | "vari" | "inn") => rs.reduce((s, r) => s + r[k], 0);
                const w = ps.length ? ps.reduce((b, r) => (r.depois < b.depois ? r : b)) : null;
                const f = mesesCx.find((x) => x.m === m)?.fim ?? 0;
                return (
                  <tr key={m}>
                    <td>
                      <Link
                        href={`/financeiro/contas?mes=${m}`}
                        onClick={() => {
                          setEscolhido(m);
                          window.scrollTo({ top: 0 });
                        }}
                      >
                        {rotuloMes(m)}
                      </Link>
                    </td>
                    <td className={`n ${ps[0] && ps[0].antes < 0 ? "neg" : ""}`}>
                      {ps[0] ? (
                        <>
                          {brl(ps[0].antes)} <small className="m">{diaMes(ps[0].d)}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="n cout">{brl(sm("fix"))}</td>
                    <td className="n cout">{brl(sm("vari"))}</td>
                    <td className="n cin">{brl(sm("inn"))}</td>
                    <td className={`n ${w && w.depois < 0 ? "neg" : ""}`}>
                      {w ? (
                        <>
                          {brl(w.depois)} <small className="m">{diaMes(w.d)}</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`n ${f < 0 ? "neg" : ""}`}>
                      <b>{brl(f)}</b>
                    </td>
                    <td>
                      {!w ? (
                        <span className="pill neu">Sem contas</span>
                      ) : ps.some((r) => r.antes + r.inn - r.tot < 0) ? (
                        <span className="pill crit">Falta caixa para pagar</span>
                      ) : w.depois < 0 ? (
                        <span className="pill warn">Depende do que entra no dia</span>
                      ) : (
                        <span className="pill good">Cobre</span>
                      )}
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
