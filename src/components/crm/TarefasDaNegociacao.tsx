"use client";

import { useEffect, useState } from "react";
import { Alert, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import {
  TIPO_TAREFA_LABEL,
  TIPOS_TAREFA,
  type TarefaCrm,
  type TipoTarefa,
} from "@/lib/crm/types";
import { classificarTarefa, dataCurta, hojeISO } from "./util";

/**
 * As tarefas de UMA negociação, dentro da ficha. Agendar e concluir aqui
 * também grava no histórico (o servidor faz); `onHistoricoMudou` avisa a ficha
 * para recarregar a negociação e mostrar o registro novo.
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
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/tarefas?negociacao=${negociacaoId}`)
      .then((r) => r.json())
      .then((d) => setTarefas(d.tarefas ?? []))
      .catch(() => setErro("Falha ao carregar as tarefas."))
      .finally(() => setLoading(false));
  }, [negociacaoId]);

  async function agendar(e: React.FormEvent) {
    e.preventDefault();
    if (!assunto.trim()) return;
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/crm/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negociacaoId, tipo, assunto, data, hora }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao agendar.");
      setTarefas((prev) => [...prev, d.tarefa as TarefaCrm]);
      setAssunto("");
      setHora("");
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
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? (d.tarefa as TarefaCrm) : x)));
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
              <li key={t.id} className="flex items-center gap-2.5 py-2">
                <input
                  type="checkbox"
                  className="toque shrink-0"
                  checked={t.concluida}
                  onChange={() => void concluir(t, !t.concluida)}
                  aria-label={`Concluir: ${t.assunto}`}
                />
                <span className={`min-w-0 flex-1 truncate text-sm ${t.concluida ? "text-slate-400 line-through dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
                  <span className="mr-1.5 text-xs text-slate-500 dark:text-slate-400">{TIPO_TAREFA_LABEL[t.tipo]}</span>
                  {t.assunto}
                </span>
                <span className={`shrink-0 text-xs ${atrasada ? "font-semibold text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
                  {dataCurta(t.data)}{t.hora ? ` ${t.hora}` : ""}
                </span>
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
        </form>
      )}
    </div>
  );
}
