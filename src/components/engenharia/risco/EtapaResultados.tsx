"use client";

import { CheckCircle2, Download, FileText, Info, XCircle } from "lucide-react";
import { Alert, SectionCard } from "@/components/ui";
import {
  CHAVES,
  META_COMPONENTE,
  META_RISCO,
  componenteDominante,
  reducao,
  type ChaveRisco,
  type ResultadoRisco,
} from "@/lib/engenharia/risco/motor";
import { observacoesNorma, requisitosDps, requisitosSpda } from "@/lib/engenharia/risco/requisitos";
import type { DadosRisco } from "@/lib/engenharia/risco/tipos";
import { fmtDataHora, fmtFixo, fmtNum, fmtPct, fmtRisco } from "@/lib/engenharia/formato";
import { formatBRL } from "@/lib/format";

export function EtapaResultados({
  dados,
  resultado,
  preliminar,
  gerando,
  onBaixar,
  desatualizada,
}: {
  dados: DadosRisco;
  resultado: ResultadoRisco;
  preliminar: ResultadoRisco | null;
  gerando: "pdf" | "docx" | null;
  onBaixar: (f: "pdf" | "docx") => void;
  desatualizada: boolean;
}) {
  const riscos = (["R1", "R3", "R4"] as ChaveRisco[]).filter((k) => resultado[k]);
  const ok = resultado.toleravel;
  const spda = requisitosSpda(dados);
  const dps = requisitosDps(dados);
  const comMedidas = dados.analise != null;
  const quando = comMedidas ? dados.analise!.em : dados.preliminar?.em;
  const observacoes = observacoesNorma(dados, resultado);

  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-center gap-4 rounded-xl p-5 text-white ${ok ? "bg-green-700" : "bg-red-700"}`}>
        {ok ? <CheckCircle2 className="h-10 w-10 shrink-0" /> : <XCircle className="h-10 w-10 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{ok ? "Riscos dentro do tolerável" : "Proteção necessária"}</div>
          <div className="text-sm opacity-90">
            Parecer {comMedidas ? "com as medidas de proteção adotadas" : "preliminar (sem medidas)"}
            {quando ? ` · analisado em ${fmtDataHora(quando)}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-sm">
            {riscos.map((k) => (
              <span key={k}>
                {k} = {fmtRisco(resultado[k]!.total, META_RISCO[k].expoente)}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-80">critérios atendidos</div>
          <div className="text-2xl font-bold">
            {resultado.criterios.filter((c) => c.ok).length} de {resultado.criterios.length}
          </div>
        </div>
      </div>

      {desatualizada && (
        <Alert tone="amber" titulo="Dados alterados depois da última análise.">
          Use &quot;Analisar&quot; na etapa Parâmetros para registrar o parecer com os valores atuais. O laudo sai sempre com os dados atuais.
        </Alert>
      )}

      {observacoes.length > 0 && (
        <Alert tone="indigo" titulo="Observações da norma.">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {observacoes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Alert>
      )}

      <SectionCard
        title="Laudo"
        subtitle="Documento com capa, sumário, painel de risco, memória de cálculo e requisitos de SPDA/DPS, com a logo e o responsável técnico do projeto."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={gerando != null} onClick={() => onBaixar("pdf")}>
              <Download className="h-4 w-4" /> {gerando === "pdf" ? "Gerando…" : "Baixar PDF"}
            </button>
            <button type="button" className="btn-secondary" disabled={gerando != null} onClick={() => onBaixar("docx")}>
              <FileText className="h-4 w-4" /> {gerando === "docx" ? "Gerando…" : "Baixar Word"}
            </button>
          </div>
        }
      >
        <p className="hint">No Word, o sumário é um campo: ao abrir, aceite atualizar os campos para numerar as páginas.</p>
      </SectionCard>

      {preliminar && (
        <SectionCard title="Comparativo: preliminar × com medidas">
          <div className="overflow-x-auto">
            <table className="table-compacta">
              <thead>
                <tr>
                  <th className="py-2 pr-3">Risco</th>
                  <th className="py-2 pr-3 text-right">Sem medidas</th>
                  <th className="py-2 pr-3 text-right">Com medidas</th>
                  <th className="py-2 pr-3 text-right">Tolerável</th>
                  <th className="py-2 pr-3 text-right">Redução</th>
                  <th className="py-2">Parecer</th>
                </tr>
              </thead>
              <tbody>
                {riscos.map((k) => {
                  const a = preliminar[k]?.total ?? null;
                  const d = resultado[k]!;
                  const exp = META_RISCO[k].expoente;
                  return (
                    <tr key={k}>
                      <td className="py-2 pr-3 font-semibold">{k}</td>
                      <td className="py-2 pr-3 text-right font-mono">{fmtRisco(a, exp)}</td>
                      <td className="py-2 pr-3 text-right font-mono font-semibold">{fmtRisco(d.total, exp)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{fmtRisco(d.RT, exp)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{a != null ? fmtPct(reducao(a, d.total)) : "—"}</td>
                      <td className="py-2">
                        <Parecer ok={!d.excede} />
                      </td>
                    </tr>
                  );
                })}
                {resultado.zonas
                  .filter((z) => z.F)
                  .map((z) => {
                    const a = preliminar.zonas.find((x) => x.id === z.id)?.F?.total ?? null;
                    return (
                      <tr key={z.id}>
                        <td className="py-2 pr-3 font-semibold">F — {z.nome}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtFixo(a, 3)}</td>
                        <td className="py-2 pr-3 text-right font-mono font-semibold">{fmtFixo(z.F!.total, 3)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{fmtFixo(z.F!.FT, 3)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{a != null ? fmtPct(reducao(a, z.F!.total)) : "—"}</td>
                        <td className="py-2">
                          <Parecer ok={!z.F!.excede} f />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {riscos.map((k) => {
        const r = resultado[k]!;
        const exp = META_RISCO[k].expoente;
        const dom = componenteDominante(r);
        const grupos: ["D1" | "D2" | "D3", string][] = [
          ["D1", "Ferimentos por choque (D1)"],
          ["D2", "Danos físicos (D2)"],
          ["D3", "Falha de sistemas internos (D3)"],
        ];
        return (
          <SectionCard key={k} title={`${k} — ${META_RISCO[k].nome}`} subtitle={META_RISCO[k].equacao}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Kp rotulo="Risco calculado" valor={fmtRisco(r.total, exp)} tom={r.excede ? "red" : "green"} />
              <Kp rotulo="Risco tolerável RT" valor={fmtRisco(r.RT, exp)} />
              <Kp rotulo="Excede?" valor={r.excede ? "Sim" : "Não"} tom={r.excede ? "red" : "green"} />
              <Kp rotulo="Parecer" valor={r.excede ? "R > RT — proteção necessária" : "R ≤ RT — tolerável"} tom={r.excede ? "red" : "green"} />
            </div>
            {k === "R4" && resultado.custoPerdas && (
              <p className="mt-3 text-sm">
                Custo anual estimado das perdas (D.4, CL = R4 × ct, com ct = {fmtNum(resultado.custoPerdas.ct, 3)} mi R$):{" "}
                <strong>{formatBRL(resultado.custoPerdas.CL)}/ano</strong>
                {preliminar?.custoPerdas && (
                  <>
                    {" "}
                    · sem medidas {formatBRL(preliminar.custoPerdas.CL)}/ano · economia {formatBRL(preliminar.custoPerdas.CL - resultado.custoPerdas.CL)}/ano
                  </>
                )}
                <span className="block hint">Na comparação com RT = 10⁻³ as razões de valor valem 1 (nota a da Tabela D.1); elas entram só no custo.</span>
              </p>
            )}
            {dom && (
              <p className="mt-3 flex items-center gap-1.5 text-sm">
                <Info className="h-4 w-4 text-gta-indigo" /> {dom.chave} responde por {Math.round(dom.fracao * 100)}% de {k} ({META_COMPONENTE[dom.chave].descricao}).
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="table-compacta">
                <thead>
                  <tr>
                    <th className="py-2 pr-3">Comp.</th>
                    <th className="py-2 pr-3">Equação</th>
                    {r.porZona.map((z) => (
                      <th key={z.zonaId} className="py-2 pr-3 text-right">
                        {z.nome}
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right">Estrutura</th>
                    <th className="py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([d, titulo]) => {
                    const chaves = CHAVES.filter((c) => META_COMPONENTE[c].dano === d && (k !== "R3" || c === "RB" || c === "RV"));
                    if (!chaves.length) return null;
                    return [
                      <tr key={d}>
                        <td colSpan={r.porZona.length + 4} className="bg-slate-50 py-1 pl-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/50">
                          {titulo}
                        </td>
                      </tr>,
                      ...chaves.map((c) => (
                        <tr key={c}>
                          <td className="py-1.5 pr-3 font-mono font-semibold">{c}</td>
                          <td className="py-1.5 pr-3 text-xs">{META_COMPONENTE[c].formula}</td>
                          {r.porZona.map((z) => (
                            <td key={z.zonaId} className="py-1.5 pr-3 text-right font-mono text-xs">
                              {fmtRisco(z.componentes[c], exp)}
                            </td>
                          ))}
                          <td className="py-1.5 pr-3 text-right font-mono text-xs font-semibold">{fmtRisco(r.componentes[c], exp)}</td>
                          <td className="py-1.5 text-right font-mono text-xs">{r.total > 0 ? `${fmtNum((r.componentes[c] / r.total) * 100, 1)}%` : "—"}</td>
                        </tr>
                      )),
                    ];
                  })}
                  <tr className="font-semibold">
                    <td className="py-2 pr-3" colSpan={2}>
                      Total
                    </td>
                    {r.porZona.map((z) => (
                      <td key={z.zonaId} className="py-2 pr-3 text-right font-mono text-xs">
                        {fmtRisco(z.total, exp)}
                      </td>
                    ))}
                    <td className={`py-2 pr-3 text-right font-mono text-xs ${r.excede ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{fmtRisco(r.total, exp)}</td>
                    <td className="py-2 text-right font-mono text-xs">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        );
      })}

      {resultado.zonas.some((z) => z.F) && (
        <SectionCard title="Frequência de danos a equipamentos (Seção 7)">
          <div className="overflow-x-auto">
            <table className="table-compacta">
              <thead>
                <tr>
                  <th className="py-2 pr-3">Zona</th>
                  {["FB", "FC", "FM", "FV", "FW", "FZ"].map((c) => (
                    <th key={c} className="py-2 pr-3 text-right">
                      {c}
                    </th>
                  ))}
                  <th className="py-2 pr-3 text-right">F</th>
                  <th className="py-2 pr-3 text-right">FT</th>
                  <th className="py-2">Parecer</th>
                </tr>
              </thead>
              <tbody>
                {resultado.zonas
                  .filter((z) => z.F)
                  .map((z) => (
                    <tr key={z.id}>
                      <td className="py-2 pr-3 font-semibold">{z.nome}</td>
                      {(["FB", "FC", "FM", "FV", "FW", "FZ"] as const).map((c) => (
                        <td key={c} className="py-2 pr-3 text-right font-mono text-xs">
                          {fmtFixo(z.F![c], 4)}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right font-mono font-semibold">{fmtFixo(z.F!.total, 3)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{fmtFixo(z.F!.FT, 3)}</td>
                      <td className="py-2">
                        <Parecer ok={!z.F!.excede} f />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {spda && (
        <SectionCard title={`Requisitos do SPDA — Nível ${spda.nivel} (NBR 5419-3)`} subtitle={`Parâmetro adotado: PB = ${fmtNum(spda.pb, 3)} — ${spda.pbRotulo}`}>
          <div className="grid gap-3 sm:grid-cols-4">
            {spda.cartoes.map((c) => (
              <div key={c.rotulo} className="subcard">
                <div className="text-2xl font-bold text-gta-navy dark:text-slate-100">{c.valor}</div>
                <div className="text-sm">{c.rotulo}</div>
                <div className="hint">{c.ref}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Lista titulo="Subsistema de captação" itens={spda.captacao} />
            <Lista titulo="Subsistema de descida" itens={spda.descida} />
            <Lista titulo="Subsistema de aterramento" itens={spda.aterramento} />
          </div>
          <Alert tone="indigo" className="mt-4">
            {spda.nota}
          </Alert>
        </SectionCard>
      )}

      {dps && (
        <SectionCard title={`Requisitos mínimos do DPS — NP ${dps.np} (NBR 5419-4)`} subtitle={`Parâmetro adotado: PEB = ${fmtNum(dps.peb, 3)} — ${dps.pebRotulo}`}>
          <div className="grid gap-3 md:grid-cols-3">
            {dps.classes.map((c) => (
              <div key={c.classe} className={`subcard ${c.adotada ? "ring-2 ring-gta-indigo" : ""}`}>
                {c.adotada && <span className="badge badge-indigo mb-1">Adotada</span>}
                <div className="font-semibold">{c.classe}</div>
                <div className="mt-1 text-sm">Ensaio: {c.ensaio}</div>
                <div className="text-sm">Forma de onda: {c.onda}</div>
                <div className="text-sm">Uso: {c.uso}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Lista titulo="Instalação e coordenação" itens={dps.instalacao} />
            <div>
              <h3 className="text-sm font-semibold">Dimensionamento da corrente de impulso Iimp</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li>
                  Corrente total do NP {dps.dimensionamento.npCorrente} ({dps.dimensionamento.origemNp}): <strong>{dps.dimensionamento.total} kA</strong> (10/350 µs)
                </li>
                <li>Parcela escoada pelo aterramento (50%): {dps.dimensionamento.aterramento} kA</li>
                <li>Parcela distribuída pelas linhas (50%): {dps.dimensionamento.linhas} kA</li>
                <li>Linhas metálicas entrantes: {dps.dimensionamento.nLinhas}</li>
                <li>
                  Parcela por linha: <strong>{fmtNum(dps.dimensionamento.porLinha, 1)} kA</strong>
                </li>
                {dps.dimensionamento.porCondutor.map((p) => (
                  <li key={p.linha}>
                    {p.linha}: {fmtNum(dps.dimensionamento.porLinha, 1)} ÷ {p.condutores} condutores = {fmtNum(p.kA, 2)} kA →{" "}
                    <strong>{p.adotado != null ? `Iimp ≥ ${fmtNum(p.adotado, 1)} kA` : "acima de 25 kA — consultar fabricante"}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Alert tone="indigo" className="mt-4">
            {dps.nota}
          </Alert>
        </SectionCard>
      )}
    </div>
  );
}

function Parecer({ ok, f }: { ok: boolean; f?: boolean }) {
  return (
    <span className={`badge ${ok ? "badge-green" : "badge-red"}`}>
      {f ? (ok ? "F ≤ FT — adequado" : "F > FT — medidas necessárias") : ok ? "R ≤ RT — tolerável" : "R > RT — proteção necessária"}
    </span>
  );
}

function Kp({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "green" | "red" }) {
  return (
    <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900/50">
      <div className="hint">{rotulo}</div>
      <div className={`mt-0.5 font-semibold ${tom === "red" ? "text-red-700 dark:text-red-400" : tom === "green" ? "text-green-700 dark:text-green-400" : ""}`}>{valor}</div>
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {itens.map((i) => (
          <li key={i} className="flex gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
