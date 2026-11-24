"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { brl, pct } from "@/lib/financeiro/formato";
import { MESES_CURTOS } from "@/lib/financeiro/datas";
import { calcularDre, type LinhaDre } from "@/lib/financeiro/dre";
import { useFinanceiro } from "./FinanceiroProvider";

const fmt = (v: number) => (Math.abs(v) < 0.005 ? "–" : (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * Aba "DRE": a Demonstração do Resultado mês a mês, na sequência da planilha
 * de Gestão Financeira (aba DRE-BP-DFC). Meses passados são o que foi lançado;
 * do mês atual em diante, a projeção com o que está lançado.
 */
export function AbaDre() {
  const { evs, dados, hoje } = useFinanceiro();
  const anoAtual = +hoje.slice(0, 4);
  const anos = useMemo(() => {
    const s = new Set<number>([anoAtual]);
    for (const e of evs) s.add(+e.data.slice(0, 4));
    for (const n of dados.crm) s.add(+n.fechadoEm.slice(0, 4));
    return [...s].filter((y) => y >= 2020 && y <= anoAtual + 2).sort();
  }, [evs, dados.crm, anoAtual]);
  const [ano, setAno] = useState(anoAtual);
  const [detalhe, setDetalhe] = useState(true);
  const [memoria, setMemoria] = useState(false);
  const dre = useMemo(() => calcularDre(evs, dados.crm, dados.config, ano), [evs, dados.crm, dados.config, ano]);
  const L = (k: string) => dre.linhas.find((l) => l.key === k)!;
  const mesHoje = ano === anoAtual ? +hoje.slice(5, 7) - 1 : ano < anoAtual ? 12 : -1;
  const linhas = dre.linhas.filter((l) => detalhe || (l.tipo !== "sub" && !(l.tipo === "fora" && Math.abs(l.total) < 0.005)));
  const primeiraFora = linhas.findIndex((l) => l.tipo === "fora");

  const tile = (rotulo: string, l: LinhaDre, margem?: LinhaDre) => (
    <div className={`tile ${l.total < 0 ? "neg" : "pos"}`}>
      <span className="lb">{rotulo}</span>
      <span className="v">{brl(l.total)}</span>
      <span className="ft">{margem ? `margem ${pct(margem.total)} sobre o faturamento líquido` : `em ${ano}`}</span>
    </div>
  );

  return (
    <section className="view">
      <div className="card">
        <div className="row sb">
          <h2>DRE — Demonstração do resultado de {ano}</h2>
          <div className="row">
            <label className="toggle">
              <input type="checkbox" checked={detalhe} onChange={(e) => setDetalhe(e.target.checked)} /> Detalhar contas
            </label>
            <label className="toggle">
              <input type="checkbox" checked={memoria} onChange={(e) => setMemoria(e.target.checked)} /> Memória de cálculo
            </label>
            <select aria-label="Ano" value={ano} onChange={(e) => setAno(+e.target.value)}>
              {anos.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="sub">
          Regime de competência, na sequência da planilha de Gestão Financeira. Negociação ganha no CRM entra no faturamento no mês em que foi ganha, pelo valor
          inteiro; os recebimentos dela no caixa não contam de novo. {mesHoje >= 0 && mesHoje < 12 ? "Colunas em azul-claro são projeção, com o que está lançado." : ""}
        </p>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          {tile("Faturamento bruto", L("fb"))}
          {tile("Lucro bruto", L("lb"), L("mb"))}
          {tile("EBITDA", L("ebitda"), L("ebitdap"))}
          {tile("Lucro líquido", L("ll"), L("mlp"))}
        </div>
        <div className="tw">
          <table className="dre">
            <thead>
              <tr>
                <th>Conta</th>
                {MESES_CURTOS.map((m, i) => (
                  <th key={m} className={`n ${i > mesHoje ? "proj" : ""} ${i === mesHoje ? "atual" : ""}`}>
                    {m.toUpperCase()}
                  </th>
                ))}
                <th className="n">Total {ano}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, idx) => (
                <Fragment key={l.key}>
                  {idx === primeiraFora && (
                    <tr className="secao">
                      <td colSpan={14}>Abaixo do resultado — sai do caixa, mas não é despesa da operação</td>
                    </tr>
                  )}
                  <tr className={l.tipo}>
                    <td>
                      {l.rotulo}
                      {memoria && l.memoria && <span className="memo">{l.memoria}</span>}
                    </td>
                    {l.valores.map((v, i) => (
                      <td key={i} className={`n ${i > mesHoje ? "proj" : ""} ${l.tipo !== "pct" && v < -0.005 ? "neg" : ""}`}>
                        {l.tipo === "pct" ? (v ? pct(v) : "–") : fmt(v)}
                      </td>
                    ))}
                    <td className={`n ${l.tipo !== "pct" && l.total < -0.005 ? "neg" : ""}`}>
                      <b>{l.tipo === "pct" ? (l.total ? pct(l.total) : "–") : fmt(l.total)}</b>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="msg" style={{ marginTop: 10 }}>
          Cada lançamento vai para a linha da sua categoria (ou a que foi escolhida nele). Para mudar onde uma categoria cai, ou os bens que depreciam, vá em{" "}
          <Link href="/financeiro/configuracoes">Configurações</Link>. Diferença em relação à planilha: lá o LAIR subtraía o resultado financeiro inteiro (inclusive
          juros recebidos); aqui ele entra com o próprio sinal: LAIR = EBITDA + RF − DA.
        </p>
      </div>
    </section>
  );
}
