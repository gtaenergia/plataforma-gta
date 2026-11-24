"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { brl, num2 } from "@/lib/financeiro/formato";
import { diaMes, diaMesAno } from "@/lib/financeiro/datas";
import { getProduto, itemAtivo } from "@/lib/produtos/registry";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";
import { useFinanceiro } from "./FinanceiroProvider";

/**
 * A faixa azul-marinho do artefato — marca, saldo conferido e as abas — e o
 * cartão "Conferir saldo com o banco", que vale para todas as abas.
 */
export function FinanceiroCasca({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fin = getProduto("financeiro")!;
  const { dados, carregado, erroCarga, conferindo, setConferindo, bloqueio, bloquear } = useFinanceiro();
  const a = dados.saldo;

  return (
    <div className="fin">
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <small>GTA Energia</small>
            <h1>Controle Financeiro</h1>
          </div>
          <div className="anchor">
            <span>
              {bloqueio ? (
                "Financeiro bloqueado"
              ) : a ? (
                <>
                  Saldo conferido no banco em {diaMesAno(a.data)}: <b>{brl(a.valor)}</b>
                </>
              ) : carregado ? (
                "Saldo do banco ainda não informado"
              ) : (
                "Carregando dados…"
              )}
            </span>
            {carregado && !bloqueio && (
              <>
                <button className="btn lite sm" type="button" onClick={() => setConferindo(true)}>
                  Conferir saldo com o banco
                </button>
                <button className="btn lite sm" type="button" onClick={() => void bloquear()} title="Fecha o Financeiro neste aparelho até digitar a senha de novo">
                  🔒 Bloquear
                </button>
              </>
            )}
          </div>
        </div>
        <nav className="tabs" aria-label="Seções do Financeiro">
          {[...fin.nav, fin.config!].map((i) => (
            <Link key={i.href} href={i.href} aria-current={itemAtivo(pathname, i) ? "page" : undefined}>
              {i.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>
        {bloqueio ? (
          <Cadeado texto={bloqueio} />
        ) : (
          <>
            {erroCarga && <div className="alert warn">{erroCarga}</div>}
            {conferindo && <ConferirSaldo onFechar={() => setConferindo(false)} />}
            {carregado ? children : !erroCarga && <p className="empty">Carregando dados…</p>}
          </>
        )}
      </main>
    </div>
  );
}

/** A tela do cadeado: pede a senha da conta para abrir o Financeiro. */
function Cadeado({ texto }: { texto: string }) {
  const { abrirCadeado } = useFinanceiro();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);

  async function abrir(ev: FormEvent) {
    ev.preventDefault();
    if (!senha) return;
    setAbrindo(true);
    setErro(null);
    const r = await abrirCadeado(senha);
    setAbrindo(false);
    setSenha("");
    if (!r.ok) setErro(r.erro ?? "Não foi possível abrir.");
  }

  return (
    <div className="card" style={{ maxWidth: 460, margin: "24px auto", width: "100%" }}>
      <h2>🔒 Área protegida</h2>
      <p className="sub">{texto}</p>
      <form className="f" onSubmit={abrir} style={{ gridTemplateColumns: "1fr auto" }}>
        <label>
          Sua senha da plataforma
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus required />
        </label>
        <button className="btn pri" type="submit" disabled={abrindo || !senha}>
          {abrindo ? "Abrindo…" : "Abrir"}
        </button>
      </form>
      {erro && (
        <p className="msg err" role="alert" style={{ marginTop: 8 }}>
          {erro}
        </p>
      )}
      <p className="msg" style={{ marginTop: 12 }}>
        Pró-labore, cartões e caixa ficam atrás desta segunda senha. O Financeiro fecha sozinho depois de 30 minutos sem uso, a cada 12 horas, e quando você sai
        da plataforma. Senhas erradas em sequência avisam os sócios.
      </p>
    </div>
  );
}

function ConferirSaldo({ onFechar }: { onFechar: () => void }) {
  const { evs, hoje, enviar } = useFinanceiro();
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abertos = useMemo(() => evs.filter((e) => !e.pago && e.data <= data), [evs, data]);
  // Marcado por padrão: o que venceu até a data quase sempre já passou pelo banco.
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  useEffect(() => setDesmarcados(new Set()), [data]);
  useAvisoNaoSalvo(valor.trim() !== "");

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const s = valor.trim().replace(/[R$\s]/g, "").replace("−", "-");
    const v = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    if (!data || s === "" || !isFinite(v)) {
      setMsg({ t: "Informe a data e o saldo (ex.: 7.068,80). Saldo negativo: use o sinal de menos.", err: true });
      return;
    }
    if (data > hoje) {
      setMsg({ t: "A data do saldo não pode ser no futuro.", err: true });
      return;
    }
    setSalvando(true);
    const r = await enviar("/api/financeiro/saldo", "PUT", {
      data,
      valor: Math.round(v * 100) / 100,
      pagos: abertos.filter((e) => !desmarcados.has(e.id)).map((e) => e.id),
    });
    setSalvando(false);
    if (r.ok) {
      setValor("");
      onFechar();
    } else setMsg({ t: r.erro ?? "Não foi possível salvar.", err: true });
  }

  return (
    <div className="card">
      <h2>Conferir saldo com o banco</h2>
      <p className="sub">
        Informe o saldo real da conta no fim do dia escolhido. A projeção passa a partir desse valor. O que foi marcado como pago ou recebido até essa data
        deixa de ser somado, porque já está dentro do saldo.
      </p>
      <form className="f" onSubmit={salvar}>
        <label>
          Data do saldo
          <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label>
          Saldo no banco (R$)
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required autoFocus />
        </label>
        <div className="row">
          <button className="btn pri" type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar saldo"}
          </button>
          <button className="btn" type="button" onClick={onFechar}>
            Cancelar
          </button>
        </div>
      </form>
      {abertos.length > 0 && (
        <>
          <p className="msg" style={{ margin: "14px 0 6px" }}>
            <b>Contas em aberto até essa data.</b> Deixe marcado o que já saiu ou entrou no banco: vira pago e não é descontado de novo. Desmarque o que ainda falta
            pagar.
          </p>
          {abertos.map((e) => (
            <label key={e.id} className="row" style={{ fontSize: 14, padding: "3px 0" }}>
              <input
                type="checkbox"
                checked={!desmarcados.has(e.id)}
                onChange={(ev) =>
                  setDesmarcados((s) => {
                    const n = new Set(s);
                    if (ev.target.checked) n.delete(e.id);
                    else n.add(e.id);
                    return n;
                  })
                }
              />
              {diaMes(e.data)} · {e.desc} ·{" "}
              <b className={e.k === "r" ? "cin" : "cout"}>
                {e.k === "r" ? "+" : "−"} {num2(e.valor)}
              </b>
            </label>
          ))}
        </>
      )}
      {msg && <p className={`msg${msg.err ? " err" : ""}`}>{msg.t}</p>}
    </div>
  );
}
