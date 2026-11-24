"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { brl, lerDinheiro, valorParaCampo } from "@/lib/financeiro/formato";
import { CATEGORIAS, CONTAS_DE, CONTAS_DRE, MAPA_PADRAO, type BemDepreciavel, type ContaDre, type Tipo } from "@/lib/financeiro/tipos";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";
import { ACAO_TEXTO, type RegistroAuditoria } from "@/lib/financeiro/auditoria-tipos";
import { useFinanceiro } from "./FinanceiroProvider";

interface BemForm {
  id: string;
  nome: string;
  valor: string;
  vidaMeses: string;
  inicio: string;
}

/** Configurações do Financeiro: DRE por categoria, depreciação, prazo do CRM, importação e acesso. */
export function AbaConfiguracoes() {
  const { dados, evs, enviar } = useFinanceiro();
  const comAcesso = dados.acesso;
  const isAdmin = dados.souAdmin;
  const cfg = dados.config;
  const [mapa, setMapa] = useState<Record<Tipo, Record<string, ContaDre>>>(cfg.mapa);
  const [bens, setBens] = useState<BemForm[]>([]);
  const [prazo, setPrazo] = useState(String(cfg.prazoCrmDias));
  const [sujo, setSujo] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useAvisoNaoSalvo(sujo);

  // Recarrega o formulário quando os dados chegam (ou mudam por outra pessoa), se não houver edição aberta.
  useEffect(() => {
    if (sujo) return;
    setMapa(cfg.mapa);
    setBens(cfg.bens.map((b) => ({ id: b.id, nome: b.nome, valor: valorParaCampo(b.valor), vidaMeses: String(b.vidaMeses), inicio: b.inicio })));
    setPrazo(String(cfg.prazoCrmDias));
  }, [cfg, sujo]);

  const categorias = useMemo(() => {
    const out: Record<Tipo, string[]> = { d: [...CATEGORIAS.d], r: [...CATEGORIAS.r] };
    for (const e of evs) if (!out[e.k].includes(e.cat)) out[e.k].push(e.cat);
    return out;
  }, [evs]);

  const mexeu = () => {
    setSujo(true);
    setMsg(null);
  };

  async function salvar() {
    const bensOk: BemDepreciavel[] = [];
    for (const b of bens) {
      const valor = lerDinheiro(b.valor);
      const vida = Math.round(Number(b.vidaMeses));
      if (!b.nome.trim() || isNaN(valor) || !(vida > 0) || !/^\d{4}-\d{2}$/.test(b.inicio)) {
        setMsg({ t: `Confira o bem "${b.nome || "sem nome"}": nome, valor, vida útil em meses e mês de início.`, err: true });
        return;
      }
      bensOk.push({ id: b.id, nome: b.nome.trim(), valor, vidaMeses: vida, inicio: b.inicio });
    }
    const p = Math.round(Number(prazo));
    if (!(p >= 0 && p <= 365)) {
      setMsg({ t: "O prazo do CRM precisa ser entre 0 e 365 dias.", err: true });
      return;
    }
    // Grava só o que difere do padrão: assim uma mudança futura no padrão chega a quem não mexeu.
    const soDiferencas = (k: Tipo) => Object.fromEntries(Object.entries(mapa[k]).filter(([cat, c]) => MAPA_PADRAO[k][cat] !== c));
    setSalvando(true);
    const r = await enviar("/api/financeiro/config", "PUT", { mapa: { d: soDiferencas("d"), r: soDiferencas("r") }, bens: bensOk, prazoCrmDias: p });
    setSalvando(false);
    if (r.ok) {
      setSujo(false);
      setMsg({ t: "Configurações salvas. O DRE já usa os novos valores." });
    } else setMsg({ t: r.erro ?? "Não foi possível salvar.", err: true });
  }

  const tabelaMapa = (k: Tipo) => (
    <table>
      <thead>
        <tr>
          <th>Categoria</th>
          <th>Linha do DRE</th>
        </tr>
      </thead>
      <tbody>
        {categorias[k].map((cat) => {
          const atual = mapa[k][cat] ?? MAPA_PADRAO[k][cat] ?? (k === "r" ? "receita" : "dv:outras");
          return (
            <tr key={cat}>
              <td>{cat}</td>
              <td>
                <select
                  className="inp"
                  style={{ fontSize: 13, padding: "4px 6px" }}
                  value={atual}
                  aria-label={`Linha do DRE para ${cat}`}
                  onChange={(e) => {
                    setMapa((m) => ({ ...m, [k]: { ...m[k], [cat]: e.target.value as ContaDre } }));
                    mexeu();
                  }}
                >
                  {CONTAS_DE[k].map((c) => (
                    <option key={c} value={c}>
                      {CONTAS_DRE[c]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <section className="view">
      <div className="card">
        <div className="row sb">
          <h2>Configurações do Financeiro</h2>
          <div className="row">
            {sujo && <span className="pill warn">alterações não salvas</span>}
            <button className="btn pri" type="button" onClick={salvar} disabled={salvando || !sujo}>
              {salvando ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </div>
        <p className="sub">Valem para todos que acessam o Financeiro.</p>
        {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.t}</p>}
      </div>

      <div className="card">
        <h2>Onde cada categoria entra no DRE</h2>
        <p className="sub">
          O padrão segue a planilha de Gestão Financeira. Cartões de crédito e despesas pessoais dos sócios saem do resultado, como retirada — alinhe com a
          contabilidade. Um lançamento pode escolher outra linha no próprio formulário.
        </p>
        <div className="grid g2">
          <div className="tw">
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Saídas (a pagar)</h3>
            {tabelaMapa("d")}
          </div>
          <div className="tw">
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Entradas (a receber)</h3>
            {tabelaMapa("r")}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Bens que depreciam</h2>
        <p className="sub">Linha &quot;Depreciação&quot; do DRE: o valor do bem dividido pela vida útil, um pedaço por mês a partir do mês de início.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Bem</th>
                <th className="n">Valor (R$)</th>
                <th className="n">Vida útil (meses)</th>
                <th>Começa em</th>
                <th className="n">Por mês</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bens.map((b, i) => {
                const v = lerDinheiro(b.valor);
                const vida = Number(b.vidaMeses);
                const upd = (patch: Partial<BemForm>) => {
                  setBens((bs) => bs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  mexeu();
                };
                return (
                  <tr key={b.id}>
                    <td>
                      <input className="inp" value={b.nome} onChange={(e) => upd({ nome: e.target.value })} aria-label="Nome do bem" />
                    </td>
                    <td className="n">
                      <input className="inp" style={{ textAlign: "right", maxWidth: 130 }} inputMode="decimal" value={b.valor} onChange={(e) => upd({ valor: e.target.value })} aria-label="Valor do bem" />
                    </td>
                    <td className="n">
                      <input className="inp" style={{ textAlign: "right", maxWidth: 90 }} inputMode="numeric" value={b.vidaMeses} onChange={(e) => upd({ vidaMeses: e.target.value })} aria-label="Vida útil em meses" />
                    </td>
                    <td>
                      <input className="inp" type="month" value={b.inicio} onChange={(e) => upd({ inicio: e.target.value })} aria-label="Mês de início" />
                    </td>
                    <td className="n">{!isNaN(v) && vida > 0 ? brl(v / vida) : "—"}</td>
                    <td>
                      <button
                        className="btn sm dang"
                        type="button"
                        onClick={() => {
                          setBens((bs) => bs.filter((_, j) => j !== i));
                          mexeu();
                        }}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setBens((bs) => [...bs, { id: crypto.randomUUID(), nome: "", valor: "", vidaMeses: "36", inicio: new Date().toISOString().slice(0, 7) }]);
              mexeu();
            }}
          >
            + Adicionar bem
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Negociações ganhas no CRM</h2>
        <p className="sub">
          Quando uma negociação é ganha, o valor entra no DRE no mês do fechamento e no caixa como recebimento previsto, este número de dias depois — até alguém
          lançar as parcelas de verdade.
        </p>
        <label className="f-lb" style={{ maxWidth: 220 }}>
          Prazo previsto para receber (dias)
          <input
            className="inp"
            inputMode="numeric"
            value={prazo}
            onChange={(e) => {
              setPrazo(e.target.value);
              mexeu();
            }}
          />
        </label>
      </div>

      <div className="card">
        <h2>Quem acessa o Financeiro</h2>
        <p className="sub">
          O acesso é por pessoa, no cadastro do usuário (marca &quot;Acesso ao Financeiro&quot;). Nem administrador entra sem ela.{" "}
          {isAdmin ? (
            <>
              Para dar ou tirar o acesso de alguém, vá em <Link href="/admin/usuarios">Gerenciar usuários</Link>.
            </>
          ) : (
            "Para dar acesso a mais alguém, peça a um administrador."
          )}
        </p>
        <p className="msg">
          Com acesso hoje: <b>{comAcesso.length ? comAcesso.join(", ") : "ninguém"}</b>.
        </p>
      </div>

      <Importar />
      <Auditoria />
    </section>
  );
}

const ALERTA = new Set(["cadeado.falha", "cadeado.bloqueio", "acesso.negado", "acesso.concedido", "acesso.revogado", "senha.redefinida", "lanc.excluir", "rec.excluir", "importar"]);

function quandoTexto(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Auditoria: só leitura. Não há botão (nem rota) para apagar registro. */
function Auditoria() {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todos");

  async function carregar() {
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/auditoria?limite=500", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(json.error ?? "Não foi possível carregar a auditoria.");
      setRegistros(json.registros ?? []);
    } catch {
      setErro("Sem conexão.");
    }
  }
  useEffect(() => {
    void carregar();
  }, []);

  const lista = (registros ?? []).filter((r) =>
    filtro === "todos" ? true : filtro === "seguranca" ? r.acao.startsWith("cadeado") || r.acao.startsWith("acesso") || r.acao.startsWith("senha") : !r.acao.startsWith("cadeado"),
  );

  return (
    <div className="card" id="auditoria" style={{ scrollMarginTop: 12 }}>
      <div className="row sb">
        <h2>Auditoria: quem fez o quê</h2>
        <div className="row">
          <select aria-label="Filtro da auditoria" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="todos">Tudo</option>
            <option value="dinheiro">Mudanças nos valores</option>
            <option value="seguranca">Acessos e segurança</option>
          </select>
          <button className="btn sm" type="button" onClick={() => void carregar()}>
            Atualizar
          </button>
        </div>
      </div>
      <p className="sub">
        Cada abertura, alteração, exclusão e mudança de acesso fica registrada com o valor de antes e de depois, quem fez e de onde. O registro não pode ser
        alterado nem apagado — nem por administrador. Um lançamento excluído por engano pode ser refeito a partir daqui.
      </p>
      {erro && <p className="msg err">{erro}</p>}
      <div className="tw">
        {registros === null ? (
          <p className="empty">Carregando…</p>
        ) : lista.length ? (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
                <th>Detalhe</th>
                <th>De onde</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{quandoTexto(r.quando)}</td>
                  <td>{r.nome}</td>
                  <td>{ALERTA.has(r.acao) ? <span className={`pill ${r.acao === "acesso.concedido" || r.acao === "importar" ? "warn" : "crit"}`}>{ACAO_TEXTO[r.acao] ?? r.acao}</span> : ACAO_TEXTO[r.acao] ?? r.acao}</td>
                  <td>
                    {r.resumo}
                    {(r.antes != null || r.depois != null) && (
                      <details>
                        <summary className="m" style={{ cursor: "pointer", fontSize: 12 }}>
                          antes e depois
                        </summary>
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: 520, margin: "4px 0" }}>
                          {JSON.stringify({ antes: r.antes ?? null, depois: r.depois ?? null }, null, 1)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td>
                    <small className="m" title={r.agente}>
                      {r.ip || "—"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">Nada registrado ainda.</p>
        )}
      </div>
    </div>
  );
}

function Importar() {
  const { enviar } = useFinanceiro();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setMsg(null);
    let json: unknown;
    try {
      json = JSON.parse(await arquivo.text());
    } catch {
      setMsg({ t: "O arquivo não é um JSON válido.", err: true });
      return;
    }
    setEnviando(true);
    const r = await enviar("/api/financeiro/importar", "POST", json);
    setEnviando(false);
    if (!r.ok) {
      setMsg({ t: r.erro ?? "Não foi possível importar.", err: true });
      return;
    }
    const i = (r.json?.importados ?? {}) as { lancamentos?: number; recorrentes?: number; saldo?: boolean; historico?: boolean };
    setMsg({
      t: `Importado: ${i.lancamentos ?? 0} lançamentos, ${i.recorrentes ?? 0} recorrentes${i.saldo ? ", saldo conferido" : ""}${i.historico ? " e histórico do banco" : ""}.`,
    });
  }

  return (
    <div className="card">
      <h2>Importar dados do artefato</h2>
      <p className="sub">
        Traz os lançamentos, recorrentes, saldo conferido e histórico do controle financeiro que vocês usavam no chat do Claude (arquivo .json). Importar o mesmo
        arquivo de novo não duplica nada: os mesmos lançamentos são regravados.
      </p>
      <input type="file" accept="application/json,.json" disabled={enviando} onChange={(e) => aoEscolher(e.target.files?.[0])} />
      {enviando && <p className="msg">Importando…</p>}
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.t}</p>}
    </div>
  );
}
