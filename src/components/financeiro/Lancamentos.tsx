"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { brl, lerDinheiro, num2, valorParaCampo } from "@/lib/financeiro/formato";
import { diaMesAno, diaNoMes, pad, rotuloMes } from "@/lib/financeiro/datas";
import { lancadoPorNegociacao, type Evento } from "@/lib/financeiro/motor";
import { CATEGORIAS, CONTAS_DE, CONTAS_DRE, contaDre, type ContaDre, type ReceitaCrm, type Tipo } from "@/lib/financeiro/tipos";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";
import { BotaoPagar, PilulaSituacao } from "./comum";
import { TotaisDoMes } from "./EntradasSaidasMes";
import { useFinanceiro } from "./FinanceiroProvider";

type Modo =
  | null
  | { t: "lanc"; id: string; rec?: string; mes?: string; negociacaoId?: string }
  | { t: "occ"; rec: string; mes: string }
  | { t: "rec"; id: string }
  | { t: "crm"; negociacaoId: string; falta: number };

interface Form {
  k: Tipo;
  desc: string;
  valor: string;
  data: string;
  nat: "fixo" | "variavel";
  cat: string;
  quem: string;
  proj: string;
  dre: "" | ContaDre;
  negociacaoId: string;
  rep: boolean;
  fim: string;
  pago: boolean;
}

const vazio = (hoje: string): Form => ({
  k: "d",
  desc: "",
  valor: "",
  data: hoje,
  nat: "variavel",
  cat: "",
  quem: "",
  proj: "",
  dre: "",
  negociacaoId: "",
  rep: false,
  fim: "",
  pago: false,
});

export function Lancamentos() {
  const { dados, evs, hoje, enviar } = useFinanceiro();
  const [form, setForm] = useState<Form>(() => vazio(hoje));
  const [modo, setModo] = useState<Modo>(null);
  const [titulo, setTitulo] = useState("Novo lançamento");
  const [sub, setSub] = useState("Lance tudo que vai entrar ou sair. Leva 20 segundos.");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filK, setFilK] = useState("aberto");
  const [filM, setFilM] = useState("");
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const cartao = useRef<HTMLDivElement>(null);
  useAvisoNaoSalvo(form.desc.trim() !== "" || form.valor.trim() !== "");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ganhas = new Map(dados.crm.map((n) => [n.negociacaoId, n]));

  function limpar() {
    setModo(null);
    setForm(vazio(hoje));
    setTitulo("Novo lançamento");
    setSub("Lance tudo que vai entrar ou sair. Leva 20 segundos.");
  }

  function carregar(f: Partial<Form>, m: Modo, t: string, s: string) {
    setModo(m);
    setForm({ ...vazio(hoje), ...f, rep: m?.t === "rec" });
    setTitulo(t);
    setSub(s);
    setMsg(null);
    cartao.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function editar(e: Evento) {
    const base = { k: e.k, desc: e.desc, valor: valorParaCampo(e.valor), nat: e.nat, cat: e.cat, quem: e.quem, proj: e.proj, dre: (e.dre ?? "") as Form["dre"] };
    if (e.crm) {
      carregar(
        { ...base, data: e.data < hoje ? hoje : e.data, negociacaoId: e.crm },
        { t: "crm", negociacaoId: e.crm, falta: e.valor },
        `Planejar recebimento: ${e.desc}`,
        "Lance a parcela (ou o valor inteiro) com a data prevista. O que faltar continua como previsto do CRM até ser lançado.",
      );
    } else if (e.virt && e.rec && e.mes) {
      carregar({ ...base, data: e.data }, { t: "occ", rec: e.rec, mes: e.mes }, `Editar só ${rotuloMes(e.mes)}: ${e.desc}`, "A alteração vale só para este mês. A regra mensal continua igual.");
    } else {
      carregar(
        { ...base, data: e.pago ? e.pagoEm || e.data : e.data, pago: e.pago, negociacaoId: e.negociacaoId ?? "" },
        { t: "lanc", id: e.id, rec: e.rec, mes: e.mes, negociacaoId: e.negociacaoId },
        "Editar lançamento",
        "Corrija o que precisar e salve.",
      );
    }
  }

  function editarRec(id: string) {
    const r = dados.rec.find((x) => x.id === id);
    if (!r) return;
    carregar(
      { k: r.k, desc: r.desc, valor: valorParaCampo(r.valor), data: diaNoMes(r.ini, r.dia), nat: "fixo", cat: r.cat, quem: r.quem, proj: r.proj, dre: (r.dre ?? "") as Form["dre"], fim: r.fim ?? "" },
      { t: "rec", id },
      "Editar recorrente",
      "Alterar a regra muda todos os meses ainda não pagos.",
    );
  }

  function planejarCrm(n: ReceitaCrm, falta: number) {
    carregar(
      { k: "r", desc: n.nome, valor: valorParaCampo(falta), data: hoje, nat: "variavel", cat: "Projetos", quem: n.cliente, proj: n.cliente, negociacaoId: n.negociacaoId },
      { t: "crm", negociacaoId: n.negociacaoId, falta },
      `Planejar recebimento: ${n.nome}`,
      "Lance a parcela (ou o valor inteiro) com a data prevista. O que faltar continua como previsto do CRM até ser lançado.",
    );
  }

  function recorrenteDoCrm(n: ReceitaCrm) {
    carregar(
      { k: "r", desc: `${n.nome} (mensal)`, valor: valorParaCampo(n.mensal), data: n.fechadoEm, nat: "fixo", cat: "Consultoria recorrente", quem: n.cliente, proj: n.cliente, rep: true },
      null,
      `Mensalidade de ${n.nome}`,
      "A parte mensal da negociação vira um recorrente: um recebimento por mês, a partir do primeiro vencimento.",
    );
    setForm((f) => ({ ...f, rep: true }));
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const valor = lerDinheiro(form.valor);
    if (!form.desc.trim() || !form.data || isNaN(valor)) {
      setMsg({ t: "Preencha descrição, data e um valor maior que zero (ex.: 1.500,00).", err: true });
      return;
    }
    const comum = {
      k: form.k,
      desc: form.desc.trim(),
      valor,
      cat: form.cat.trim() || "Outros",
      quem: form.quem.trim(),
      proj: form.proj.trim(),
      dre: form.dre || undefined,
    };
    const ehRec = modo?.t === "rec" || (!modo && form.rep);
    setSalvando(true);
    let r;
    if (ehRec) {
      const ini = form.data.slice(0, 7);
      if (form.fim && form.fim < ini) {
        setSalvando(false);
        setMsg({ t: "O último mês não pode ser antes do primeiro vencimento.", err: true });
        return;
      }
      const doc = { ...comum, dia: +form.data.slice(8), ini, fim: form.fim || null };
      r = modo?.t === "rec" ? await enviar(`/api/financeiro/recorrentes/${encodeURIComponent(modo.id)}`, "PUT", doc) : await enviar("/api/financeiro/recorrentes", "POST", doc);
    } else {
      const doc: Record<string, unknown> = { ...comum, data: form.data, nat: form.nat, pago: form.pago, pagoEm: form.pago ? form.data : undefined };
      if (form.k === "r") doc.negociacaoId = form.negociacaoId; // "" desfaz o vínculo
      if (modo?.t === "occ") Object.assign(doc, { rec: modo.rec, mes: modo.mes, nat: "fixo" });
      if (modo?.t === "lanc" && modo.rec) Object.assign(doc, { rec: modo.rec, mes: modo.mes });
      if (modo?.t === "crm") doc.negociacaoId = modo.negociacaoId;
      r = modo?.t === "lanc" ? await enviar(`/api/financeiro/lancamentos/${encodeURIComponent(modo.id)}`, "PUT", doc) : await enviar("/api/financeiro/lancamentos", "POST", doc);
    }
    setSalvando(false);
    if (r.ok) {
      limpar();
      setMsg({ t: "Salvo." });
    } else setMsg({ t: r.erro ?? "Não foi possível salvar.", err: true });
  }

  async function acao(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErroLista(null);
    const r = await fn();
    if (!r.ok) setErroLista(r.erro ?? "Não foi possível salvar.");
  }

  // listas de sugestão
  const sugestoes = useMemo(() => {
    const cs = new Set(CATEGORIAS[form.k]);
    const qs = new Set<string>();
    const ps = new Set<string>();
    for (const e of evs) {
      if (e.k === form.k) {
        cs.add(e.cat);
        if (e.quem) qs.add(e.quem);
      }
      if (e.proj) ps.add(e.proj);
    }
    return { cs: [...cs], qs: [...qs].sort(), ps: [...ps].sort() };
  }, [evs, form.k]);

  // filtro da lista
  const mesesLista = useMemo(() => [...new Set(evs.map((e) => e.data.slice(0, 7)))].sort(), [evs]);
  let rows = evs.filter(
    (e) =>
      (!filM || e.data.startsWith(filM)) &&
      (filK === "todos" ||
        (filK === "aberto" && !e.pago) ||
        (filK === "atras" && e.atras) ||
        (filK === "pago" && e.pago) ||
        (filK === "crm" && (e.crm || e.negociacaoId)) ||
        ((filK === "d" || filK === "r") && e.k === filK && !e.pago)),
  );
  rows = [...rows].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const cortado = rows.length > 250;
  if (cortado) rows = rows.slice(0, 250);
  const soma = rows.reduce((s, e) => s + e.sv, 0);
  const mesTotais = filM || hoje.slice(0, 7);

  const ehRec = modo?.t === "rec" || (!modo && form.rep);
  const contaAuto = contaDre(form.k, form.cat.trim() || "Outros", undefined, dados.config);
  const lancado = lancadoPorNegociacao(dados.lanc);

  return (
    <section className="view">
      <div className="card" ref={cartao} style={{ scrollMarginTop: 12 }}>
        <h2>{titulo}</h2>
        <p className="sub">{sub}</p>
        <form className="f" onSubmit={salvar}>
          <div className="seg" role="radiogroup" aria-label="Tipo">
            <label>
              <input type="radio" name="k" checked={form.k === "d"} disabled={modo?.t === "crm"} onChange={() => setForm((f) => ({ ...f, k: "d", negociacaoId: "", dre: "" }))} />A pagar
            </label>
            <label>
              <input type="radio" name="k" checked={form.k === "r"} onChange={() => setForm((f) => ({ ...f, k: "r", dre: "" }))} />A receber
            </label>
          </div>
          <label className="span2">
            Descrição
            <input value={form.desc} onChange={(e) => set("desc", e.target.value)} required maxLength={120} placeholder="Ex.: Parcela 2 do projeto X" />
          </label>
          <label>
            Valor (R$)
            <input inputMode="decimal" value={form.valor} onChange={(e) => set("valor", e.target.value)} required placeholder="0,00" />
          </label>
          <label>
            {ehRec ? "Primeiro vencimento" : "Data"}
            <input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} required />
          </label>
          <label>
            Natureza
            <select value={ehRec ? "fixo" : form.nat} disabled={ehRec} onChange={(e) => set("nat", e.target.value as Form["nat"])}>
              <option value="variavel">Variável / pontual</option>
              <option value="fixo">Fixo / recorrente</option>
            </select>
          </label>
          <label>
            Categoria
            <input list="fin-dl-cat" value={form.cat} onChange={(e) => set("cat", e.target.value)} required placeholder="Escolha ou digite" />
          </label>
          <label>
            {form.k === "r" ? "Cliente / quem paga" : "Fornecedor / quem recebe"}
            <input list="fin-dl-quem" value={form.quem} onChange={(e) => set("quem", e.target.value)} maxLength={60} />
          </label>
          <label>
            Projeto ou cliente ligado
            <input list="fin-dl-proj" value={form.proj} onChange={(e) => set("proj", e.target.value)} maxLength={60} placeholder="Opcional" />
          </label>
          <label>
            Linha no DRE
            <select value={form.dre} onChange={(e) => set("dre", e.target.value as Form["dre"])}>
              <option value="">Pela categoria ({CONTAS_DRE[contaAuto]})</option>
              {CONTAS_DE[form.k].map((c) => (
                <option key={c} value={c}>
                  {CONTAS_DRE[c]}
                </option>
              ))}
            </select>
          </label>
          {form.k === "r" && !ehRec && (
            <label>
              Negociação ganha no CRM
              <select value={form.negociacaoId} disabled={modo?.t === "crm"} onChange={(e) => set("negociacaoId", e.target.value)}>
                <option value="">Nenhuma</option>
                {dados.crm.map((n) => (
                  <option key={n.negociacaoId} value={n.negociacaoId}>
                    {n.nome}
                    {n.cliente ? ` · ${n.cliente}` : ""}
                  </option>
                ))}
                {form.negociacaoId && !ganhas.has(form.negociacaoId) && <option value={form.negociacaoId}>(negociação não está mais ganha)</option>}
              </select>
            </label>
          )}
          {!modo && (
            <label className="chk">
              <input type="checkbox" checked={form.rep} onChange={(e) => setForm((f) => ({ ...f, rep: e.target.checked, nat: e.target.checked ? "fixo" : f.nat }))} />
              Repete todo mês
            </label>
          )}
          {ehRec && (
            <label>
              Último mês (vazio = sem fim)
              <input type="month" value={form.fim} onChange={(e) => set("fim", e.target.value)} />
            </label>
          )}
          {!ehRec && (
            <label className="chk">
              <input type="checkbox" checked={form.pago} onChange={(e) => set("pago", e.target.checked)} />
              {form.k === "r" ? "Já foi recebido" : "Já foi pago"}
            </label>
          )}
          <div className="row">
            <button className="btn pri" type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : modo && modo.t !== "crm" ? "Salvar alteração" : "Lançar"}
            </button>
            {modo || form.rep ? (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  limpar();
                  setMsg(null);
                }}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
        {form.k === "r" && form.negociacaoId && !ehRec && (
          <p className="msg" style={{ marginTop: 8 }}>
            Ligado à negociação do CRM: não entra de novo no faturamento do DRE (ele já contou no mês em que a negociação foi ganha) e abate o que falta receber dela.
          </p>
        )}
        {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.t}</p>}
        <datalist id="fin-dl-cat">
          {sugestoes.cs.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="fin-dl-quem">
          {sugestoes.qs.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="fin-dl-proj">
          {sugestoes.ps.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="card">
        <div className="row sb">
          <h2>Lançamentos</h2>
          <div className="row">
            <select aria-label="Filtro" value={filK} onChange={(e) => setFilK(e.target.value)}>
              <option value="aberto">Em aberto</option>
              <option value="atras">Atrasados</option>
              <option value="d">A pagar</option>
              <option value="r">A receber</option>
              <option value="pago">Pagos e recebidos</option>
              <option value="crm">Ligados ao CRM</option>
              <option value="todos">Todos</option>
            </select>
            <select aria-label="Mês do filtro" value={mesesLista.includes(filM) ? filM : ""} onChange={(e) => setFilM(e.target.value)}>
              <option value="">Todos os meses</option>
              {mesesLista.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ margin: "10px 0 14px" }}>
          <TotaisDoMes evs={evs} mes={mesTotais} compacto />
          {!filM && (
            <p className="msg" style={{ marginTop: 6 }}>
              Totais do mês atual. Escolha um mês no filtro acima para ver os de outro.
            </p>
          )}
        </div>
        {erroLista && <p className="msg err">{erroLista}</p>}
        <div className="tw">
          {rows.length ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th className="n">Valor</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>{diaMesAno(e.data)}</td>
                      <td>
                        {e.desc}
                        {e.rec && (
                          <>
                            {" "}
                            <span className="pill neu">mensal</span>
                          </>
                        )}
                        {(e.crm || e.negociacaoId) && (
                          <>
                            {" "}
                            <span className="pill crm" title={e.crm ? "Negociação ganha no CRM: previsto até ser lançado" : "Ligado a uma negociação do CRM"}>
                              CRM
                            </span>
                          </>
                        )}
                        {e.negociacaoId && !e.crm && !ganhas.has(e.negociacaoId) && (
                          <>
                            {" "}
                            <span className="pill warn">negociação não está mais ganha</span>
                          </>
                        )}
                        <br />
                        <small className="m">{[e.quem, e.proj && "projeto " + e.proj, e.byNome && "por " + e.byNome].filter(Boolean).join(" · ")}</small>
                      </td>
                      <td>
                        {e.cat}
                        <br />
                        <small className="m">
                          {e.nat === "fixo" ? "fixo" : "variável"} · DRE: {CONTAS_DRE[contaDre(e.k, e.cat, e.dre, dados.config)].replace(/^.*· /, "")}
                        </small>
                      </td>
                      <td className={`n ${e.k === "r" ? "cin" : "cout"}`}>
                        {e.k === "r" ? "+" : "−"} {num2(e.valor)}
                      </td>
                      <td>
                        <PilulaSituacao e={e} />
                      </td>
                      <td>
                        <div className="acts">
                          <BotaoPagar e={e} onErro={setErroLista} />
                          <button className="btn sm" type="button" onClick={() => editar(e)}>
                            {e.crm ? "Planejar" : "Editar"}
                          </button>
                          {e.virt && e.rec ? (
                            <button
                              className="btn sm"
                              type="button"
                              title="Não cobrar neste mês"
                              onClick={() =>
                                acao(() =>
                                  enviar("/api/financeiro/lancamentos", "POST", { k: e.k, desc: e.desc, valor: e.valor, data: e.data, rec: e.rec, mes: e.mes, skip: true }),
                                )
                              }
                            >
                              Pular mês
                            </button>
                          ) : !e.virt ? (
                            <button
                              className="btn sm dang"
                              type="button"
                              onClick={() => {
                                if (confirmar !== e.id) return setConfirmar(e.id);
                                setConfirmar(null);
                                void acao(() => enviar(`/api/financeiro/lancamentos/${encodeURIComponent(e.id)}`, "DELETE"));
                              }}
                            >
                              {confirmar === e.id ? "Confirmar exclusão" : "Excluir"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="msg">
                {rows.length} lançamentos{cortado ? " (mostrando os 250 primeiros, filtre por mês para ver o resto)" : ""}. Soma: <b className={soma < 0 ? "neg" : ""}>{brl(soma)}</b>.
              </p>
            </>
          ) : (
            <p className="empty">Nenhum lançamento neste filtro.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Negociações ganhas no CRM</h2>
        <p className="sub">
          Ao ganhar uma negociação no CRM, o valor entra no DRE no mês do fechamento e aparece aqui no caixa como recebimento previsto ({dados.config.prazoCrmDias} dias depois),
          até que pagamentos ligados a ela cubram o valor. Use &quot;Planejar&quot; para lançar as parcelas com as datas certas.
        </p>
        <div className="tw">
          {dados.crm.length ? (
            <table>
              <thead>
                <tr>
                  <th>Negociação</th>
                  <th>Ganha em</th>
                  <th className="n">Valor (DRE)</th>
                  <th className="n">Recebido</th>
                  <th className="n">Planejado</th>
                  <th className="n">Falta lançar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dados.crm.map((n) => {
                  const ligados = dados.lanc.filter((l) => l.negociacaoId === n.negociacaoId && !l.skip && l.k === "r");
                  const recebido = ligados.filter((l) => l.pago).reduce((s, l) => s + l.valor, 0);
                  const planejado = ligados.filter((l) => !l.pago).reduce((s, l) => s + l.valor, 0);
                  const falta = Math.max(0, Math.round((n.valor - (lancado.get(n.negociacaoId) ?? 0)) * 100) / 100);
                  return (
                    <tr key={n.negociacaoId}>
                      <td>
                        <Link href={`/crm/negociacoes/${n.negociacaoId}`}>{n.nome}</Link>
                        <br />
                        <small className="m">{[n.cliente, n.responsavelNome].filter(Boolean).join(" · ")}</small>
                        {n.mensal > 0 && (
                          <>
                            <br />
                            <small className="m">
                              + {brl(n.mensal)}/mês recorrente —{" "}
                              <button className="btn sm" type="button" onClick={() => recorrenteDoCrm(n)}>
                                Cadastrar recorrente
                              </button>
                            </small>
                          </>
                        )}
                      </td>
                      <td>{diaMesAno(n.fechadoEm)}</td>
                      <td className="n">{brl(n.valor)}</td>
                      <td className="n cin">{brl(recebido)}</td>
                      <td className="n">{brl(planejado)}</td>
                      <td className="n">
                        <b>{brl(falta)}</b>
                      </td>
                      <td>
                        <div className="acts">
                          {falta > 0 && (
                            <button className="btn sm" type="button" onClick={() => planejarCrm(n, falta)}>
                              Planejar
                            </button>
                          )}
                          {falta <= 0 && recebido >= n.valor && <span className="pill good">quitada</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="empty">Nenhuma negociação ganha no CRM ainda.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Recorrentes cadastrados</h2>
        <p className="sub">Regras que geram um lançamento por mês. Alterar aqui muda todos os meses ainda não pagos.</p>
        <div className="tw">
          {dados.rec.length ? (
            <table>
              <thead>
                <tr>
                  <th>Todo dia</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th className="n">Valor</th>
                  <th>Vigência</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...dados.rec]
                  .sort((a, b) => (a.k !== b.k ? (a.k === "r" ? -1 : 1) : a.dia - b.dia))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{pad(r.dia)}</td>
                      <td>{r.desc}</td>
                      <td>{r.cat}</td>
                      <td className={`n ${r.k === "r" ? "cin" : "cout"}`}>
                        {r.k === "r" ? "+" : "−"} {num2(r.valor)}
                      </td>
                      <td>
                        {rotuloMes(r.ini)} {r.fim ? "a " + rotuloMes(r.fim) : "em diante"}
                      </td>
                      <td>
                        <div className="acts">
                          <button className="btn sm" type="button" onClick={() => editarRec(r.id)}>
                            Editar
                          </button>
                          <button
                            className="btn sm dang"
                            type="button"
                            onClick={() => {
                              const chave = "rec:" + r.id;
                              if (confirmar !== chave) return setConfirmar(chave);
                              setConfirmar(null);
                              void acao(() => enviar(`/api/financeiro/recorrentes/${encodeURIComponent(r.id)}`, "DELETE"));
                            }}
                          >
                            {confirmar === "rec:" + r.id ? "Confirmar exclusão" : "Excluir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">Nenhum recorrente cadastrado.</p>
          )}
        </div>
      </div>
    </section>
  );
}
