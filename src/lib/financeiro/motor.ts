import { addDias, diaNoMes, fimDoHorizonte, proximoMes } from "./datas";
import type { ContaDre, Lancamento, Natureza, ReceitaCrm, Recorrente, SaldoConferido, Tipo } from "./tipos";

/**
 * Motor de projeção do caixa — o mesmo do artefato "GTA Controle Financeiro"
 * (funções events/project/months/buildFx), portado para funções puras e
 * tipadas. As regras não mudaram:
 *
 * - Saldo do dia = saldo conferido + tudo que tem data efetiva depois dele.
 * - Pago/recebido com data até a âncora não conta: já está dentro do saldo.
 * - Em aberto com data vencida vai para hoje e fica marcado como atrasado.
 * - Horizonte: até dezembro do ano seguinte.
 *
 * Novidade da plataforma: negociação GANHA no CRM entra no caixa como um
 * recebimento previsto, até que pagamentos ligados a ela cubram o valor.
 * Cada lançamento ligado (planejado ou recebido) abate desse previsto.
 */

export interface Evento {
  /** Id do lançamento; "rec|AAAA-MM" para a ocorrência de um recorrente; "crm|id" para a negociação. */
  id: string;
  /** Não existe gravado: nasce de um recorrente ou de uma negociação ganha. */
  virt: boolean;
  /** Id da negociação, quando este evento é o "falta receber" dela. */
  crm?: string;
  k: Tipo;
  desc: string;
  valor: number;
  data: string;
  nat: Natureza;
  cat: string;
  quem: string;
  proj: string;
  pago: boolean;
  pagoEm?: string;
  rec?: string;
  mes?: string;
  negociacaoId?: string;
  dre?: ContaDre;
  by?: string;
  byNome?: string;
  atras: boolean;
  /** Data efetiva no caixa: pagoEm, ou hoje para o que venceu e não foi pago. */
  eff: string;
  /** Valor com sinal (+ entra, − sai). */
  sv: number;
}

export interface DiaCaixa {
  d: string;
  in: number;
  out: number;
  bal: number;
  items: Evento[];
}

export interface MesCaixa {
  m: string;
  ini: number;
  in: number;
  out: number;
  fim: number;
  min: number;
  minD: string;
}

export interface DadosMotor {
  lanc: Lancamento[];
  rec: Recorrente[];
  saldo: SaldoConferido | null;
  crm: ReceitaCrm[];
  prazoCrmDias: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Quanto de cada negociação já está lançado (planejado ou recebido). */
export function lancadoPorNegociacao(lanc: Lancamento[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lanc) {
    if (!l.negociacaoId || l.skip || !(l.valor > 0) || l.k !== "r") continue;
    m.set(l.negociacaoId, r2((m.get(l.negociacaoId) ?? 0) + l.valor));
  }
  return m;
}

export function eventos(dados: Pick<DadosMotor, "lanc" | "rec" | "crm" | "prazoCrmDias">, hoje: string): Evento[] {
  const fimH = fimDoHorizonte(hoje).slice(0, 7);
  const out: Omit<Evento, "atras" | "eff" | "sv">[] = [];
  const substituidos = new Set<string>();
  for (const l of dados.lanc) if (l.rec && l.mes) substituidos.add(`${l.rec}|${l.mes}`);

  for (const l of dados.lanc) {
    if (l.skip || !l.data || !(l.valor > 0)) continue;
    out.push({
      id: l.id,
      virt: false,
      k: l.k,
      desc: l.desc,
      valor: l.valor,
      data: l.data,
      nat: l.nat || "variavel",
      cat: l.cat || "Outros",
      quem: l.quem || "",
      proj: l.proj || "",
      pago: !!l.pago,
      pagoEm: l.pagoEm,
      rec: l.rec,
      mes: l.mes,
      negociacaoId: l.negociacaoId,
      dre: l.dre,
      by: l.by,
      byNome: l.byNome,
    });
  }

  for (const r of dados.rec) {
    if (!r.ini || !(r.valor > 0)) continue;
    const fim = r.fim && r.fim < fimH ? r.fim : fimH;
    let n = 0;
    for (let m = r.ini; m <= fim && n < 400; m = proximoMes(m), n++) {
      if (substituidos.has(`${r.id}|${m}`)) continue;
      out.push({
        id: `${r.id}|${m}`,
        virt: true,
        k: r.k,
        desc: r.desc,
        valor: r.valor,
        data: diaNoMes(m, r.dia || 1),
        nat: "fixo",
        cat: r.cat || "Outros",
        quem: r.quem || "",
        proj: r.proj || "",
        pago: false,
        rec: r.id,
        mes: m,
        dre: r.dre,
        by: r.by,
        byNome: r.byNome,
      });
    }
  }

  // Negociação ganha: o que ainda não foi lançado vira um "a receber" previsto.
  const lancado = lancadoPorNegociacao(dados.lanc);
  for (const n of dados.crm) {
    const falta = r2(n.valor - (lancado.get(n.negociacaoId) ?? 0));
    if (!(falta > 0.009) || !n.fechadoEm) continue;
    out.push({
      id: `crm|${n.negociacaoId}`,
      virt: true,
      crm: n.negociacaoId,
      k: "r",
      desc: n.nome,
      valor: falta,
      data: addDias(n.fechadoEm, dados.prazoCrmDias),
      nat: "variavel",
      cat: "Projetos",
      quem: n.cliente,
      proj: n.cliente,
      pago: false,
      negociacaoId: n.negociacaoId,
    });
  }

  const evs: Evento[] = out.map((e) => ({
    ...e,
    atras: !e.pago && e.data < hoje,
    eff: e.pago ? e.pagoEm || e.data : e.data < hoje ? hoje : e.data,
    sv: e.k === "r" ? e.valor : -e.valor,
  }));
  // Mesma ordem do artefato: por data efetiva e, no mesmo dia, o que entra antes.
  evs.sort((a, b) => (a.eff < b.eff ? -1 : a.eff > b.eff ? 1 : a.k === b.k ? 0 : a.k === "r" ? -1 : 1));
  return evs;
}

export function projetar(evs: Evento[], saldo: SaldoConferido | null, hoje: string): DiaCaixa[] {
  const a = saldo ?? { data: hoje, valor: 0 };
  const fimH = fimDoHorizonte(hoje);
  const dias = new Map<string, { in: number; out: number; items: Evento[] }>();
  for (const e of evs) {
    let d = e.eff;
    if (e.pago) {
      if (d <= a.data) continue;
    } else if (d < a.data) d = a.data;
    if (d > fimH) continue;
    let o = dias.get(d);
    if (!o) dias.set(d, (o = { in: 0, out: 0, items: [] }));
    if (e.k === "r") o.in += e.valor;
    else o.out += e.valor;
    o.items.push(e);
  }
  const serie: DiaCaixa[] = [];
  let bal = a.valor;
  // Trava de segurança: um saldo conferido muito antigo não pode gerar laço sem fim.
  for (let d = a.data, n = 0; d <= fimH && n < 5000; d = addDias(d, 1), n++) {
    const o = dias.get(d) ?? { in: 0, out: 0, items: [] };
    bal = r2(bal + o.in - o.out);
    serie.push({ d, in: r2(o.in), out: r2(o.out), bal, items: o.items });
  }
  return serie;
}

export function meses(serie: DiaCaixa[], saldo: SaldoConferido | null): MesCaixa[] {
  const out: MesCaixa[] = [];
  let cur: MesCaixa | null = null;
  let prev = saldo?.valor ?? 0;
  for (const p of serie) {
    const m = p.d.slice(0, 7);
    if (!cur || cur.m !== m) {
      cur = { m, ini: prev, in: 0, out: 0, fim: prev, min: Infinity, minD: p.d };
      out.push(cur);
    }
    cur.in = r2(cur.in + p.in);
    cur.out = r2(cur.out + p.out);
    cur.fim = p.bal;
    if (p.bal < cur.min) {
      cur.min = p.bal;
      cur.minD = p.d;
    }
    prev = p.bal;
  }
  return out;
}

/** Um dia com conta a pagar ou a receber em aberto: saldo antes e depois de pagar. */
export interface DiaDeConta {
  d: string;
  /** Saldo do fim do dia anterior (sem o que entra no mesmo dia). */
  antes: number;
  tot: number;
  fix: number;
  vari: number;
  depois: number;
  inn: number;
  fim: number;
  pay: Evento[];
  rcv: Evento[];
}

export function contasPorDia(serie: DiaCaixa[], saldo: SaldoConferido | null, hoje: string): DiaDeConta[] {
  const out: DiaDeConta[] = [];
  let prev = saldo?.valor ?? 0;
  for (const p of serie) {
    const it = p.items.filter((e) => !e.pago);
    if (it.length && p.d >= hoje) {
      const pay = it.filter((e) => e.k === "d");
      const rcv = it.filter((e) => e.k === "r");
      const fix = r2(pay.filter((e) => e.nat === "fixo").reduce((s, e) => s + e.valor, 0));
      const tot = r2(pay.reduce((s, e) => s + e.valor, 0));
      const inn = r2(rcv.reduce((s, e) => s + e.valor, 0));
      out.push({ d: p.d, antes: prev, tot, fix, vari: r2(tot - fix), depois: r2(prev - tot), inn, fim: p.bal, pay, rcv });
    }
    prev = p.bal;
  }
  return out;
}

/** Totais de um mês, separando o que já passou pelo banco do que falta. */
export interface TotaisMes {
  entradas: number;
  recebido: number;
  aReceber: number;
  saidas: number;
  pago: number;
  aPagar: number;
  resultado: number;
  nEntradas: number;
  nSaidas: number;
}

/**
 * Entradas e saídas com VENCIMENTO no mês (o que foi lançado para ele), não o
 * movimento projetado do caixa: é a pergunta "quanto entra e quanto sai em
 * dezembro?", respondida pelos próprios lançamentos.
 */
export function totaisDoMes(evs: Evento[], mes: string): TotaisMes {
  const t: TotaisMes = { entradas: 0, recebido: 0, aReceber: 0, saidas: 0, pago: 0, aPagar: 0, resultado: 0, nEntradas: 0, nSaidas: 0 };
  for (const e of evs) {
    if (!e.data.startsWith(mes)) continue;
    if (e.k === "r") {
      t.entradas += e.valor;
      t.nEntradas++;
      if (e.pago) t.recebido += e.valor;
      else t.aReceber += e.valor;
    } else {
      t.saidas += e.valor;
      t.nSaidas++;
      if (e.pago) t.pago += e.valor;
      else t.aPagar += e.valor;
    }
  }
  for (const k of ["entradas", "recebido", "aReceber", "saidas", "pago", "aPagar"] as const) t[k] = r2(t[k]);
  t.resultado = r2(t.entradas - t.saidas);
  return t;
}
