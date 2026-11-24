"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { brl, num2 } from "@/lib/financeiro/formato";
import { addDias, diaMes, diaMesAno, fimDoHorizonte, proximoMes, rotuloMes } from "@/lib/financeiro/datas";
import { BarrasSimples, GraficoSaldo } from "./Graficos";
import { BotaoPagar, SeletorMes } from "./comum";
import { EntradasSaidasMes } from "./EntradasSaidasMes";
import { useFinanceiro } from "./FinanceiroProvider";

export function VisaoGeral() {
  const { dados, evs, serie, mesesCx, contas, hoje, carregado, setConferindo } = useFinanceiro();
  const [faixa, setFaixa] = useState("90");
  const [erro, setErro] = useState<string | null>(null);
  const mesAtual = hoje.slice(0, 7);
  const [mesES, setMesES] = useState(mesAtual);

  const at = serie.find((p) => p.d === hoje) ?? serie[0] ?? { bal: 0, d: hoje, in: 0, out: 0, items: [] };
  const lim = addDias(hoje, 30);
  const janela = serie.filter((p) => p.d >= hoje && p.d <= lim);
  const mn = janela.reduce<(typeof serie)[number] | null>((b, p) => (!b || p.bal < b.bal ? p : b), null) ?? at;
  const rin = janela.reduce((s, p) => s + p.in, 0);
  const rout = janela.reduce((s, p) => s + p.out, 0);
  const abertosAteHoje = evs.filter((e) => !e.pago && e.data <= hoje);

  // alerta de caixa negativo
  const fut = serie.filter((p) => p.d >= hoje);
  const neg = fut.find((p) => p.bal < 0);
  const lim90 = addDias(hoje, 90);
  let alerta: React.ReactNode = null;
  if (!dados.saldo && carregado) {
    alerta = (
      <div className="alert warn">
        <div>
          Informe o saldo do banco para começar.{" "}
          <span>
            Use o botão{" "}
            <button className="btn sm" type="button" onClick={() => setConferindo(true)}>
              Conferir saldo com o banco
            </button>
          </span>
        </div>
      </div>
    );
  } else if (neg && neg.d <= lim90) {
    const i = fut.indexOf(neg);
    let run = 0;
    while (fut[i + run] && fut[i + run].bal < 0) run++;
    const worst = fut.slice(i, i + run).reduce((b, p) => (p.bal < b.bal ? p : b));
    alerta = (
      <div className="alert crit">
        <div>
          Caixa fica negativo em {diaMesAno(neg.d)}.{" "}
          <span>
            Pior ponto dessa janela: {brl(worst.bal)} em {diaMesAno(worst.d)}
            {fut[i + run] ? `, volta ao positivo em ${diaMesAno(fut[i + run].d)}` : ", e não volta com o que está lançado"}. Antecipe um recebimento ou adie um
            pagamento desses dias.
          </span>
        </div>
      </div>
    );
  } else if (dados.saldo) {
    alerta = (
      <div className="alert good">
        <div>
          Caixa positivo nos próximos 90 dias.{" "}
          <span>{neg ? `Primeiro dia negativo previsto: ${diaMesAno(neg.d)}.` : "Nenhum dia negativo até o fim do horizonte."}</span>
        </div>
      </div>
    );
  }

  const nx = contas.find((r) => r.tot > 0);
  const fimGrafico = faixa === "all" ? fimDoHorizonte(hoje) : addDias(hoje, +faixa);

  // estrutura fixa do mês que vem
  const nm = proximoMes(mesAtual);
  const fixos = dados.rec.filter((r) => r.ini <= nm && (!r.fim || r.fim >= nm));
  const fd = fixos.filter((r) => r.k === "d").reduce((s, r) => s + r.valor, 0);
  const fr = fixos.filter((r) => r.k === "r").reduce((s, r) => s + r.valor, 0);
  const gap = fr - fd;

  const l15 = addDias(hoje, 15);
  const prox = evs.filter((e) => !e.pago && e.eff <= l15);

  const mesesES = useMemo(() => {
    const ms = new Set([mesAtual, ...mesesCx.map((m) => m.m), ...evs.map((e) => e.data.slice(0, 7))]);
    return [...ms].sort();
  }, [mesAtual, mesesCx, evs]);

  return (
    <section className="view">
      {alerta}
      <div className="grid g4">
        <div className={`tile ${at.bal < 0 ? "neg" : "pos"}`}>
          <span className="lb">Saldo previsto hoje, {diaMes(hoje)}</span>
          <span className="v">{brl(at.bal)}</span>
          <span className="ft">
            {abertosAteHoje.length
              ? `já descontando ${brl(abertosAteHoje.reduce((s, e) => s - e.sv, 0))} de ${abertosAteHoje.length === 1 ? "1 conta em aberto" : abertosAteHoje.length + " contas em aberto"} até hoje`
              : "fim do dia, nada em aberto até hoje"}
          </span>
        </div>
        <div className={`tile ${mn.bal < 0 ? "neg" : "pos"}`}>
          <span className="lb">Menor saldo nos próximos 30 dias</span>
          <span className="v">{brl(mn.bal)}</span>
          <span className="ft">em {diaMesAno(mn.d)}</span>
        </div>
        <div className="tile in">
          <span className="lb">A receber em 30 dias</span>
          <span className="v">{brl(rin)}</span>
          <span className="ft">até {diaMesAno(lim)}</span>
        </div>
        <div className="tile out">
          <span className="lb">A pagar em 30 dias</span>
          <span className="v">{brl(rout)}</span>
          <span className="ft">até {diaMesAno(lim)}</span>
        </div>
      </div>

      {nx && (
        <div className={`alert ${nx.depois < 0 ? "crit" : "good"}`}>
          <div>
            Próximas contas a pagar: {diaMesAno(nx.d)}, {brl(nx.tot)}.{" "}
            <span>
              Saldo antes de pagar: <b>{brl(nx.antes)}</b>. Logo depois: <b className={nx.depois < 0 ? "neg" : ""}>{brl(nx.depois)}</b>.{" "}
              <Link href="/financeiro/contas">Ver todos os dias</Link>
            </span>
          </div>
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <h2>Saldo previsto dia a dia</h2>
          <div className="row sb">
            <p className="sub" style={{ margin: 0 }}>
              Saldo no fim de cada dia, com tudo que está lançado.
            </p>
            <select aria-label="Período do gráfico" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
              <option value="90">Próximos 90 dias</option>
              <option value="180">Próximos 6 meses</option>
              <option value="all">Até {rotuloMes(fimDoHorizonte(hoje).slice(0, 7))}</option>
            </select>
          </div>
          <GraficoSaldo pts={serie.filter((p) => p.d <= fimGrafico)} />
        </div>
        <div className="card">
          <h2>Estrutura fixa do mês</h2>
          <p className="sub">O que se repete todo mês, pelo mês que vem.</p>
          {fixos.length ? (
            <>
              <div className="kv">
                <span>Receita recorrente ({rotuloMes(nm)})</span>
                <b className="cin">{brl(fr)}</b>
                <span>Custo fixo ({rotuloMes(nm)})</span>
                <b className="cout">{brl(fd)}</b>
                <span className="tot">Sobra ou falta todo mês</span>
                <b className={`tot ${gap < 0 ? "neg" : ""}`}>{brl(gap)}</b>
              </div>
              <p className="msg" style={{ margin: "12px 0 8px" }}>
                {gap < 0 ? (
                  <>
                    Só para empatar, precisa entrar <b>{brl(-gap)}</b> por mês em projetos e serviços pontuais. Isso antes de qualquer custo do próprio projeto.
                  </>
                ) : (
                  "As receitas recorrentes já cobrem o custo fixo."
                )}
              </p>
              <BarrasSimples
                cor="var(--out)"
                itens={fixos
                  .filter((r) => r.k === "d")
                  .sort((a, b) => b.valor - a.valor)
                  .map((r) => ({ rotulo: r.desc, v: r.valor }))}
              />
            </>
          ) : (
            <p className="empty">Nenhum recorrente cadastrado.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Saúde financeira mês a mês</h2>
        <p className="sub">Menor saldo mostra o pior dia do mês. É ele que diz se falta caixa antes de o dinheiro entrar.</p>
        <div className="tw">
          {mesesCx.length ? (
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="n">Saldo inicial</th>
                  <th className="n">Entradas</th>
                  <th className="n">Saídas</th>
                  <th className="n">Resultado</th>
                  <th className="n">Saldo final</th>
                  <th className="n">Menor saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {mesesCx.map((m) => {
                  const res = m.in - m.out;
                  const st: [string, string] =
                    m.min < 0 ? (m.fim < 0 ? ["crit", "Fecha negativo"] : ["crit", "Falta caixa no mês"]) : res < 0 ? ["warn", "Gasta mais do que entra"] : ["good", "Saudável"];
                  return (
                    <tr key={m.m}>
                      <td>
                        <Link href={`/financeiro/dia-a-dia?mes=${m.m}`}>{rotuloMes(m.m)}</Link>
                      </td>
                      <td className="n">{brl(m.ini)}</td>
                      <td className="n cin">{brl(m.in)}</td>
                      <td className="n cout">{brl(m.out)}</td>
                      <td className={`n ${res < 0 ? "neg" : ""}`}>{brl(res)}</td>
                      <td className={`n ${m.fim < 0 ? "neg" : ""}`}>
                        <b>{brl(m.fim)}</b>
                      </td>
                      <td className={`n ${m.min < 0 ? "neg" : ""}`}>
                        {brl(m.min)} <small className="m">{diaMes(m.minD)}</small>
                      </td>
                      <td>
                        <span className={`pill ${st[0]}`}>{st[1]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">Sem dados ainda.</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row sb">
          <h2>Entradas e saídas do mês</h2>
          <SeletorMes meses={mesesES} valor={mesES} onChange={setMesES} />
        </div>
        <p className="sub">Tudo que foi lançado com vencimento no mês, pago ou não: o total de cada lado e o que falta.</p>
        <EntradasSaidasMes evs={evs} mes={mesES} />
      </div>

      <div className="card">
        <h2>Vencimentos: atrasados e próximos 15 dias</h2>
        <p className="sub">Marque o que foi pago ou recebido para o saldo ficar certo.</p>
        {erro && <p className="msg err">{erro}</p>}
        <div className="tw">
          {prox.length ? (
            <table>
              <thead>
                <tr>
                  <th>Vence</th>
                  <th>Descrição</th>
                  <th className="n">Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prox.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {diaMes(e.data)} {e.atras ? <span className="pill crit">atrasado</span> : e.data === hoje ? <span className="pill warn">hoje</span> : null}
                    </td>
                    <td>
                      {e.desc} <small className="m">{e.cat}</small> {e.crm && <span className="pill crm">CRM</span>}
                    </td>
                    <td className={`n ${e.k === "r" ? "cin" : "cout"}`}>
                      {e.k === "r" ? "+" : "−"} {num2(e.valor)}
                    </td>
                    <td>
                      <div className="acts">
                        <BotaoPagar e={e} onErro={setErro} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">Nada em aberto nos próximos 15 dias.</p>
          )}
        </div>
      </div>
    </section>
  );
}
