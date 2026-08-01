"use client";

import { useEffect, useState } from "react";
import { Database, HardDrive } from "lucide-react";
import { Alert, EmptyState, Kpi, KpiGrid, Loading, SectionCard } from "@/components/ui";
import { formatarBytes, type Armazenamento } from "@/lib/admin/types";

/** Faixa de alerta: abaixo de 70% é rotina, acima de 90% precisa de ação. */
function tomDoUso(pct: number): "green" | "amber" | "red" {
  if (pct >= 90) return "red";
  if (pct >= 70) return "amber";
  return "green";
}

const BARRA_COR = { green: "bg-green-500", amber: "bg-amber-500", red: "bg-red-500" } as const;

/** Barra de uso contra a referência de plano. */
function Barra({ usado, limite }: { usado: number; limite: number }) {
  const pct = limite > 0 ? (usado / limite) * 100 : 0;
  const tom = tomDoUso(pct);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-semibold text-gta-navy dark:text-slate-100">{formatarBytes(usado)}</span>
        <span className="hint">
          {pct < 0.1 ? "menos de 0,1" : pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de {formatarBytes(limite)}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${formatarBytes(usado)} de ${formatarBytes(limite)}`}
      >
        <div className={`h-full rounded-full ${BARRA_COR[tom]}`} style={{ width: `${Math.min(100, Math.max(pct, pct > 0 ? 1 : 0))}%` }} />
      </div>
    </div>
  );
}

/** Linha "nome — barra proporcional — tamanho", o mesmo padrão do Dashboard. */
function LinhaProporcional({ nome, bytes, maior, detalhe }: { nome: string; bytes: number; maior: number; detalhe: string }) {
  const pct = maior > 0 ? Math.round((bytes / maior) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">{nome}</span>
        <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
          {formatarBytes(bytes)} · {detalhe}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-gta-indigo" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Aviso de que o serviço não está ligado neste ambiente (o caso do dev local). */
function NaoConfigurado({ oQue, onde }: { oQue: string; onde: string }) {
  return (
    <EmptyState>
      {oQue} não está configurado neste ambiente — os dados ficam em {onde}. Este painel só mostra números em produção.
    </EmptyState>
  );
}

export function ArmazenamentoPainel() {
  const [dados, setDados] = useState<Armazenamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/admin/armazenamento")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao consultar o armazenamento.");
        return d as Armazenamento;
      })
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao consultar."))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <Loading>Medindo o armazenamento…</Loading>;
  if (erro) return <Alert tone="red">{erro}</Alert>;
  if (!dados) return null;

  const { banco, blob } = dados;
  const maiorTabela = banco.configurado ? Math.max(1, ...banco.tabelas.map((t) => t.bytes)) : 1;
  const maiorPasta = blob.configurado ? Math.max(1, ...blob.pastas.map((p) => p.bytes)) : 1;

  return (
    <div className="space-y-6">
      {dados.erro && <Alert tone="amber">{dados.erro}</Alert>}

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <Database className="h-5 w-5 text-gta-indigo dark:text-indigo-300" aria-hidden />
            Banco de dados
          </span>
        }
        subtitle="Propostas, orçamentos, tarefas, clientes, apontamentos e notificações."
      >
        {!banco.configurado ? (
          <NaoConfigurado oQue="O banco" onde="arquivos JSON em data/" />
        ) : (
          <>
            <Barra usado={banco.totalBytes} limite={banco.limiteBytes} />

            <KpiGrid className="mt-4">
              <Kpi label="Total no banco" value={formatarBytes(banco.totalBytes)} destaque />
              <Kpi label="Tabelas" value={String(banco.tabelas.length)} />
              <Kpi
                label="Registros"
                value={banco.tabelas.reduce((s, t) => s + t.linhas, 0).toLocaleString("pt-BR")}
              />
              <Kpi label="Maior tabela" value={banco.tabelas[0]?.nome ?? "—"} />
            </KpiGrid>

            <h3 className="mt-6 mb-3 text-sm font-semibold text-gta-navy dark:text-slate-200">Por tabela</h3>
            {banco.tabelas.length === 0 ? (
              <EmptyState>Nenhuma tabela criada ainda.</EmptyState>
            ) : (
              <div className="space-y-2.5">
                {banco.tabelas.map((t) => (
                  <LinhaProporcional
                    key={t.nome}
                    nome={t.nome}
                    bytes={t.bytes}
                    maior={maiorTabela}
                    detalhe={`${t.linhas.toLocaleString("pt-BR")} ${t.linhas === 1 ? "registro" : "registros"}`}
                  />
                ))}
              </div>
            )}
            {/* O total do banco é maior que a soma das tabelas: catálogo do
                Postgres e espaço ainda não recuperado pelo VACUUM entram nele. */}
            <p className="hint mt-3">
              O total do banco inclui o catálogo interno do Postgres, por isso é maior que a soma das tabelas.
            </p>
          </>
        )}
      </SectionCard>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-gta-indigo dark:text-indigo-300" aria-hidden />
            Arquivos (Blob)
          </span>
        }
        subtitle="Anexos dos orçamentos e fotos de perfil."
      >
        {!blob.configurado ? (
          <NaoConfigurado oQue="O Blob" onde="data/uploads/" />
        ) : (
          <>
            <Barra usado={blob.totalBytes} limite={blob.limiteBytes} />

            <KpiGrid className="mt-4">
              <Kpi label="Total em arquivos" value={formatarBytes(blob.totalBytes)} destaque />
              <Kpi label="Arquivos" value={blob.arquivos.toLocaleString("pt-BR")} />
              <Kpi
                label="Tamanho médio"
                value={blob.arquivos > 0 ? formatarBytes(blob.totalBytes / blob.arquivos) : "—"}
              />
              <Kpi label="Pastas" value={String(blob.pastas.length)} />
            </KpiGrid>

            {blob.truncado && (
              <Alert tone="amber" className="mt-4">
                A contagem parou nos primeiros {blob.arquivos.toLocaleString("pt-BR")} arquivos — os números acima
                são um piso, não o total.
              </Alert>
            )}

            <h3 className="mt-6 mb-3 text-sm font-semibold text-gta-navy dark:text-slate-200">Por pasta</h3>
            {blob.pastas.length === 0 ? (
              <EmptyState>Nenhum arquivo enviado ainda.</EmptyState>
            ) : (
              <div className="space-y-2.5">
                {blob.pastas.map((p) => (
                  <LinhaProporcional
                    key={p.nome}
                    nome={p.nome}
                    bytes={p.bytes}
                    maior={maiorPasta}
                    detalhe={`${p.arquivos.toLocaleString("pt-BR")} ${p.arquivos === 1 ? "arquivo" : "arquivos"}`}
                  />
                ))}
              </div>
            )}

            {blob.maiores.length > 0 && (
              <>
                <h3 className="mt-6 mb-3 text-sm font-semibold text-gta-navy dark:text-slate-200">Maiores arquivos</h3>
                <div className="overflow-x-auto">
                  <table className="table-compacta">
                    <thead>
                      <tr>
                        <th className="py-1 pr-3">Arquivo</th>
                        <th className="py-1 pr-3 whitespace-nowrap">Enviado em</th>
                        <th className="py-1 text-right">Tamanho</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blob.maiores.map((m) => (
                        <tr key={m.nome}>
                          <td className="py-1.5 pr-3">
                            <span className="block max-w-[26rem] truncate" title={m.nome}>{m.nome}</span>
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400">
                            {new Date(m.enviadoEm).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-medium">{formatarBytes(m.bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </SectionCard>

      <p className="hint">
        As barras usam a cota do <strong>plano gratuito</strong> como referência (0,5 GB no banco, 1 GB em arquivos) —
        nem o Neon nem o Blob informam a cota real pela conexão. Se a conta mudar de plano, ajuste
        <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">LIMITE_REFERENCIA</code>
        em <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">src/lib/admin/armazenamento.ts</code>.
      </p>
    </div>
  );
}
