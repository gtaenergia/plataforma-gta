"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat } from "lucide-react";
import { Alert, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { quemFez } from "@/lib/crm/followups";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import {
  TIPO_TAREFA_LABEL,
  TIPOS_TAREFA,
  type TarefaCrm,
  type TipoTarefa,
} from "@/lib/crm/types";
import { RepeticaoCampo, type Repeticao } from "./RepeticaoCampo";
import { classificarTarefa, dataCurta, hojeISO } from "./util";

/**
 * As tarefas de UMA negociação, dentro da ficha. Agendar e concluir aqui
 * também grava no histórico (o servidor faz); `onHistoricoMudou` avisa a ficha
 * para recarregar a negociação e mostrar o registro novo.
 *
 * O tique aqui é o atalho: conclui em nome de quem está logado, sem
 * comentário. Quem quer registrar o que o cliente disse usa o "Concluir" da
 * agenda ou da ficha do cliente. A repetição vale igual nos dois caminhos —
 * quem gera a próxima é o servidor.
 */
export function TarefasDaNegociacao({ negociacaoId, aberta, onHistoricoMudou }: {
  negociacaoId: string;
  aberta: boolean;
  onHistoricoMudou: () => void;
}) {
  const [tarefas, setTarefas] = useState<TarefaCrm[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState<TipoTarefa>("ligacao");
  const [assunto, setAssunto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [repeticao, setRepeticao] = useState<Repeticao>({ cada: 0, unidade: "" });
  /** Recria o campo de repetição depois de agendar — ele lembra se estava em "Personalizado". */
  const [versaoForm, setVersaoForm] = useState(0);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/crm/tarefas?negociacao=${encodeURIComponent(negociacaoId)}`);
    const d = await r.json();
    setTarefas(d.tarefas ?? []);
  }, [negociacaoId]);

  useEffect(() => {
    carregar()
      .catch(() => setErro("Falha ao carregar as tarefas."))
      .finally(() => setLoading(false));
  }, [carregar]);

  async function agendar(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim()) return;
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/crm/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          negociacaoId,
          tipo,
          assunto,
          data,
          hora,
          repetirCada: repeticao.cada,
          repetirUnidade: repeticao.cada ? repeticao.unidade : "",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao agendar.");
      setTarefas((prev) => [...prev, d.tarefa as TarefaCrm]);
      setAssunto("");
      setHora("");
      setRepeticao({ cada: 0, unidade: "" });
      setVersaoForm((v) => v + 1);
      onHistoricoMudou();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao agendar.");
    } finally {
      setSalvando(false);
    }
  }

  async function concluir(t: TarefaCrm, concluida: boolean) {
    setErro(null);
    const res = await fetch(`/api/crm/tarefas/${t.id}/concluir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concluida }),
    });
    const d = await res.json();
    if (!res.ok) { setErro(d.error ?? "Falha ao concluir."); return; }
    // Recarrega em vez de remendar: concluir pode ter gerado a próxima
    // ocorrência, e reabrir pode ter apagado a que tinha gerado.
    await carregar().catch(() => setErro("Falha ao recarregar as tarefas."));
    onHistoricoMudou();
  }

  if (loading) return <Loading>Carregando tarefas…</Loading>;

  const hoje = hojeISO();

  return (
    <div className="space-y-3">
      {erro && <Alert tone="red">{erro}</Alert>}

      {tarefas.length === 0 && <p className="subtitle">Nenhuma tarefa agendada.</p>}
      {tarefas.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {tarefas.map((t) => {
            const atrasada = classificarTarefa(t, hoje) === "atrasada";
            return (
              <li key={t.id} className="py-2">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="toque shrink-0"
                    checked={t.concluida}
                    onChange={() => void concluir(t, !t.concluida)}
                    aria-label={`${t.concluida ? "Reabrir" : "Concluir"}: ${t.assunto}`}
                  />
                  <span className={`min-w-0 flex-1 truncate text-sm ${t.concluida ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
                    <span className="mr-1.5 text-xs text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
                    {t.assunto}
                  </span>
                  {t.repetirCada > 0 && !t.concluida && (
                    <span className="hint inline-flex shrink-0 items-center gap-1" title={descreverRepeticao(t.repetirCada, t.repetirUnidade)}>
                      <Repeat className="h-3 w-3" aria-hidden />
                      <span className="sr-only">{descreverRepeticao(t.repetirCada, t.repetirUnidade)}</span>
                    </span>
                  )}
                  <span className={`shrink-0 text-xs ${atrasada ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
                    {dataCurta(t.data)}{t.hora ? ` ${t.hora}` : ""}
                  </span>
                </div>
                {t.concluida && t.comentario && (
                  <p className="ml-9 mt-0.5 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-400">
                    {quemFez(t)} — {t.comentario}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {aberta && (
        <form onSubmit={agendar} className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-6 dark:border-slate-700">
          <Campo className="col-span-2 sm:col-span-2" label="Assunto">
            <input className="field-input !py-1 text-sm" value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Ex.: Ligar após a visita" />
          </Campo>
          <Campo label="Tipo">
            <select className="field-input !py-1 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)}>
              {TIPOS_TAREFA.map((t) => <option key={t} value={t}>{TIPO_TAREFA_LABEL[t]}</option>)}
            </select>
          </Campo>
          <Campo label="Data">
            <input type="date" className="field-input !py-1 text-sm" value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
          <Campo label="Hora">
            <input type="time" className="field-input !py-1 text-sm" value={hora} onChange={(e) => setHora(e.target.value)} />
          </Campo>
          <div className="flex items-end">
            <button type="submit" className="btn-secondary w-full justify-center !py-1.5 text-sm" disabled={salvando || !assunto.trim()}>
              Agendar
            </button>
          </div>
          <RepeticaoCampo key={versaoForm} className="col-span-2 sm:col-span-3" valor={repeticao} onChange={setRepeticao} compacto />
        </form>
      )}
    </div>
  );
}
