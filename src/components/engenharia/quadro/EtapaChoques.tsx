"use client";

import { useState } from "react";
import { Alert, SectionCard } from "@/components/ui";
import type { ConfigQuadro } from "@/lib/engenharia/quadro/tipos";
import type { ResultadoQuadros } from "@/lib/engenharia/quadro/motor";
import { tempoSeccionamento, tensaoContatoLimite } from "@/lib/engenharia/quadro/tabelas";
import { fmtNum } from "@/lib/engenharia/formato";
import { SeloVerif } from "../comum";

export function EtapaChoques({ cfg, res, onAbrir }: { cfg: ConfigQuadro; res: ResultadoQuadros; onAbrir: (quadroId: string, circId: string) => void }) {
  const [tabela, setTabela] = useState(false);
  const tn = cfg.esquema === "TN-S";
  const todos = res.quadros.flatMap((q) => q.circuitos.map((r) => ({ q, r })));
  const conta = (v: string) => todos.filter((x) => x.r.verif.choque === v).length;
  const semDr = todos.filter((x) => x.r.avisos.some((a) => a.includes("5.1.3.2.2")));

  return (
    <div className="space-y-6">
      <SectionCard title="Condições da instalação" subtitle={tn ? "Seccionamento automático no esquema TN (5.1.2.2.4.2)" : "Seccionamento automático no esquema TT (5.1.2.2.4.3)"}>
        <div className="grid gap-3 sm:grid-cols-5">
          <Item rotulo="Esquema" valor={cfg.esquema} />
          <Item rotulo="Situação de contato" valor={`Situação ${cfg.situacao}`} />
          <Item rotulo="Tensão fase-neutro U0" valor={`${res.U0} V`} />
          <Item rotulo={tn ? "Tempo máximo (Tabela 25)" : "Tensão de contato limite UL"} valor={tn ? `${fmtNum(tempoSeccionamento(res.U0, cfg.situacao))} s` : `${tensaoContatoLimite(cfg.situacao)} V`} />
          <Item rotulo="Critério" valor={tn ? "Zs × Ia ≤ U0" : "RA × IΔn ≤ UL"} />
        </div>
        <button type="button" className="btn-link mt-3" onClick={() => setTabela((v) => !v)}>
          {tabela ? "Ocultar" : "Ver"} Tabela 25 — tempos de seccionamento máximos no esquema TN
        </button>
        {tabela && (
          <table className="table-compacta mt-2 max-w-md">
            <thead>
              <tr>
                <th className="py-1.5">U0 (V)</th>
                <th className="py-1.5 text-right">Situação 1 (s)</th>
                <th className="py-1.5 text-right">Situação 2 (s)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["115, 120, 127", 0.8, 0.35],
                ["220", 0.4, 0.2],
                ["254", 0.4, 0.2],
                ["277", 0.4, 0.2],
                ["400", 0.2, 0.05],
              ].map(([u, a, b]) => (
                <tr key={String(u)}>
                  <td className="py-1.5">{u}</td>
                  <td className="py-1.5 text-right">{fmtNum(a as number, 2)}</td>
                  <td className="py-1.5 text-right">{fmtNum(b as number, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {semDr.length > 0 && (
        <Alert tone="amber" titulo="DR obrigatório (5.1.3.2.2).">
          Sem DR de IΔn ≤ 30 mA em circuito de local com chuveiro ou banheira: {semDr.map(({ q, r }) => `${q.nome} · ${r.tag}`).join(", ")}.
        </Alert>
      )}
      <p className="hint">
        Lembrete (5.1.3.2.2): também exigem DR ≤ 30 mA as tomadas em áreas externas ou que alimentem equipamentos no exterior e os pontos de cozinhas, copas,
        lavanderias, áreas de serviço, garagens e áreas molhadas. Marque o DR na ficha desses circuitos.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Contador n={conta("ok")} rotulo="Conformes" cor="text-green-700 dark:text-green-400" />
        <Contador n={conta("falha")} rotulo="Não conformes" cor="text-red-700 dark:text-red-400" />
        <Contador n={conta("sem-dados")} rotulo="Dados faltantes" cor="text-slate-600 dark:text-slate-300" />
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>Quadro / circuito</th>
              <th>Dispositivo</th>
              <th className="text-right">Ia (A)</th>
              <th>Origem de Ia</th>
              <th className="text-right">PE (mm²)</th>
              <th className="text-right">{tn ? "Zs (Ω)" : "RA (Ω)"}</th>
              <th className="text-right">t máx (s)</th>
              <th className="text-right">{tn ? "Zs × Ia (V)" : "RA × IΔn (V)"}</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {todos.map(({ q, r }) => (
              <tr key={r.id}>
                <td>
                  <button type="button" className="btn-link text-xs" onClick={() => onAbrir(q.id, r.id)}>
                    {q.nome} · {r.tag}
                  </button>
                  {r.descricao && <span className="hint"> {r.descricao}</span>}
                </td>
                <td>
                  {r.In} A {r.curva}
                  {r.dr ? ` + DR ${r.drSens} mA` : ""}
                </td>
                <td className="text-right font-mono">{r.ia != null ? fmtNum(r.ia, r.ia < 1 ? 3 : 0) : "—"}</td>
                <td>{r.iaOrigem}</td>
                <td className="text-right font-mono">{fmtNum(r.secaoPE)}</td>
                <td className="text-right font-mono">{tn ? fmtNum(r.zs, 3) : fmtNum(cfg.RA)}</td>
                <td className="text-right font-mono">{fmtNum(r.tmax, 2)}</td>
                <td className="text-right font-mono">
                  {r.zsIa != null ? `${fmtNum(r.zsIa, 1)} ${tn ? `≤ ${r.U0}` : `≤ ${tensaoContatoLimite(cfg.situacao)}`}` : "—"}
                </td>
                <td>
                  <SeloVerif v={r.verif.choque} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {tn
          ? "Ia: corrente de disparo magnético do disjuntor (limite superior da curva, atuação instantânea abaixo do tempo da Tabela 25) ou IΔn do DR. Zs: laço fase–PE da fonte ao fim do circuito, com condutores na temperatura de serviço."
          : "No esquema TT o seccionamento é feito por DR; a resistência RA soma o eletrodo de aterramento e os condutores de proteção das massas."}
      </p>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
      <div className="hint">{rotulo}</div>
      <div className="font-semibold">{valor}</div>
    </div>
  );
}

function Contador({ n, rotulo, cor }: { n: number; rotulo: string; cor: string }) {
  return (
    <div className="card p-4 text-center">
      <div className={`text-3xl font-bold ${cor}`}>{n}</div>
      <div className="hint">{rotulo}</div>
    </div>
  );
}
