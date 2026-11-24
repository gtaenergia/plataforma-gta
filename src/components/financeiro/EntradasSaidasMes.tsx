"use client";

import { useMemo } from "react";
import { brl, num2 } from "@/lib/financeiro/formato";
import { diaMes, rotuloMes } from "@/lib/financeiro/datas";
import { totaisDoMes, type Evento } from "@/lib/financeiro/motor";
import { PilulaSituacao } from "./comum";

/**
 * Quadro com o TOTAL de entradas e o TOTAL de saídas do mês, e a lista de cada
 * lado. Conta pelo vencimento: tudo que foi lançado para o mês, pago ou não —
 * a separação "já recebido / falta receber" vem logo abaixo do total.
 */
export function TotaisDoMes({ evs, mes, compacto }: { evs: Evento[]; mes: string; compacto?: boolean }) {
  const t = useMemo(() => totaisDoMes(evs, mes), [evs, mes]);
  return (
    <div className="grid g3">
      <div className="tile in">
        <span className="lb">Total de entradas em {rotuloMes(mes)}</span>
        <span className="v">{brl(t.entradas)}</span>
        <span className="ft">
          recebido {brl(t.recebido)} · a receber {brl(t.aReceber)}
        </span>
      </div>
      <div className="tile out">
        <span className="lb">Total de saídas em {rotuloMes(mes)}</span>
        <span className="v">{brl(t.saidas)}</span>
        <span className="ft">
          pago {brl(t.pago)} · a pagar {brl(t.aPagar)}
        </span>
      </div>
      <div className={`tile ${t.resultado < 0 ? "neg" : "pos"}`}>
        <span className="lb">Entradas − saídas do mês</span>
        <span className="v">{brl(t.resultado)}</span>
        <span className="ft">
          {compacto ? `${t.nEntradas} entradas · ${t.nSaidas} saídas` : t.resultado < 0 ? "o mês gasta mais do que entra" : "o mês fecha no azul"}
        </span>
      </div>
    </div>
  );
}

export function EntradasSaidasMes({ evs, mes }: { evs: Evento[]; mes: string }) {
  const doMes = useMemo(() => evs.filter((e) => e.data.startsWith(mes)).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)), [evs, mes]);
  const ent = doMes.filter((e) => e.k === "r");
  const sai = doMes.filter((e) => e.k === "d");
  const t = totaisDoMes(evs, mes);
  const lista = (itens: Evento[], k: "r" | "d") =>
    itens.length ? (
      <ul>
        {itens.map((e) => (
          <li key={e.id}>
            <span>
              <small className="m">{diaMes(e.data)}</small> {e.desc} {e.crm && <span className="pill crm">CRM</span>} <PilulaSituacao e={e} />
            </span>
            <b className={k === "r" ? "cin" : "cout"}>
              {k === "r" ? "+" : "−"} {num2(e.valor)}
            </b>
          </li>
        ))}
      </ul>
    ) : (
      <p className="empty">{k === "r" ? "Nenhuma entrada lançada neste mês." : "Nenhuma saída lançada neste mês."}</p>
    );

  return (
    <>
      <TotaisDoMes evs={evs} mes={mes} />
      <div className="es" style={{ marginTop: 14 }}>
        <div className="col-in">
          <h3>
            <span>Entradas</span>
            <span className="cin">{brl(t.entradas)}</span>
          </h3>
          {lista(ent, "r")}
        </div>
        <div className="col-out">
          <h3>
            <span>Saídas</span>
            <span className="cout">{brl(t.saidas)}</span>
          </h3>
          {lista(sai, "d")}
        </div>
      </div>
    </>
  );
}
