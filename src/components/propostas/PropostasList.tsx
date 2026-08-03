"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ServiceIcon } from "@/components/ServiceIcon";
import { Alert, Badge, EmptyState, Loading, Marca, type Tone } from "@/components/ui";
import { usePaginacao, Paginacao } from "@/components/Paginacao";
import { SERVICO_OUTRO, SERVICO_OUTRO_LABEL, statusPropostaLabel, STATUS_PROPOSTA, type Proposta } from "@/lib/propostas/types";
import { Campo } from "@/components/Campo";

const STATUS_TONE: Record<string, Tone> = {
  rascunho: "slate",
  precificada: "amber",
  gerada: "green",
};

interface ServiceMeta {
  key: string;
  label: string;
  icon: string;
  usesConfigurator: boolean;
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function PropostasList({ podeEnviar }: { podeEnviar: boolean }) {
  const router = useRouter();
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [services, setServices] = useState<ServiceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null);

  // filtros
  const [busca, setBusca] = useState("");
  const [fServico, setFServico] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCriador, setFCriador] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/propostas").then((r) => r.json()),
      fetch("/api/services").then((r) => r.json()),
    ])
      .then(([p, s]) => {
        setPropostas(p.propostas ?? []);
        setServices(s.services ?? []);
      })
      .catch(() => setErro("Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  const serviceMap = useMemo(() => {
    const m = new Map<string, ServiceMeta>();
    services.forEach((s) => m.set(s.key, s));
    return m;
  }, [services]);

  const nomeCriador = (p: Proposta) => p.criadoPorNome || p.criadoPor || "—";

  // só mostra no filtro os serviços que têm propostas
  const servicosComPropostas = useMemo(() => {
    const keys = new Set(propostas.map((p) => p.serviceKey));
    return services.filter((s) => keys.has(s.key));
  }, [services, propostas]);

  const criadores = useMemo(() => {
    return Array.from(new Set(propostas.map(nomeCriador))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [propostas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return propostas.filter((p) => {
      if (fServico && p.serviceKey !== fServico) return false;
      if (fStatus && p.status !== fStatus) return false;
      if (fCriador && nomeCriador(p) !== fCriador) return false;
      if (q) {
        const alvo = `${p.cliente} ${p.referencia}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [propostas, busca, fServico, fStatus, fCriador]);

  const { paginados, controles } = usePaginacao(filtradas);

  async function excluir(p: Proposta) {
    if (!window.confirm(`Excluir a proposta de "${p.cliente}"?`)) return;
    const res = await fetch(`/api/propostas/${p.id}`, { method: "DELETE" });
    if (res.ok) setPropostas((prev) => prev.filter((x) => x.id !== p.id));
    else setErro("Falha ao excluir.");
  }

  async function enviarParaAprovacao(p: Proposta) {
    setErro(null);
    setEnviandoId(p.id);
    try {
      const res = await fetch("/api/orcamentos/da-proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propostaId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar para aprovação.");
      router.push(`/aprovacoes/${data.orcamento.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
      setEnviandoId(null);
    }
  }

  async function duplicar(p: Proposta) {
    setErro(null);
    setDuplicandoId(p.id);
    try {
      const res = await fetch(`/api/propostas/${p.id}/duplicar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao duplicar.");
      router.push(`/nova/${p.serviceKey}?proposta=${data.proposta.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
      setDuplicandoId(null);
    }
  }

  /**
   * "Gerada" descreve o que a PLATAFORMA fez, e ela não fez nada numa proposta
   * trazida de fora — a linha dizia "Fora da plataforma" e "Gerada" ao mesmo
   * tempo. Só o rótulo muda; o status gravado continua sendo o mesmo, porque é
   * ele que libera o envio para a aprovação.
   */
  function rotuloStatus(p: Proposta) {
    if (p.manual && p.status === "gerada") return "Registrada";
    return statusPropostaLabel(p.status);
  }

  function rotuloServico(key: string) {
    if (key === SERVICO_OUTRO) return SERVICO_OUTRO_LABEL;
    return serviceMap.get(key)?.label ?? key;
  }

  const limparFiltros = () => { setBusca(""); setFServico(""); setFStatus(""); setFCriador(""); };
  const temFiltro = busca || fServico || fStatus || fCriador;

  if (loading) return <Loading>Carregando propostas…</Loading>;

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Filtros */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        <Campo className="flex-1 sm:min-w-[200px]" label="Buscar cliente / referência">
          <input
            className="field-input"
            placeholder="Digite para filtrar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </Campo>
        <Campo className="min-w-[170px]" label="Serviço">
          <select className="field-input" value={fServico} onChange={(e) => setFServico(e.target.value)}>
            <option value="">Todos</option>
            {servicosComPropostas.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </Campo>
        <Campo className="min-w-[150px]" label="Criador">
          <select className="field-input" value={fCriador} onChange={(e) => setFCriador(e.target.value)}>
            <option value="">Todos</option>
            {criadores.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo className="min-w-[140px]" label="Status">
          <select className="field-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_PROPOSTA.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Campo>
        {temFiltro && (
          <button className="btn-secondary !py-2 text-sm" onClick={limparFiltros}>Limpar</button>
        )}
      </div>

      <div className="subtitle">
        {filtradas.length} de {propostas.length} {propostas.length === 1 ? "proposta" : "propostas"}
      </div>

      {/* Cartões (mobile) */}
      <div className="space-y-3 md:hidden">
        {filtradas.length === 0 && (
          <EmptyState>{propostas.length === 0 ? "Nenhuma proposta gerada ainda." : "Nenhuma proposta corresponde aos filtros."}</EmptyState>
        )}
        {paginados.map((p) => {
          // `!p.manual`: a manual pode estar classificada como Solar, e sem isso
          // o botão Abrir cairia no configurador com o formulário vazio.
          const podeReabrir = !p.manual && serviceMap.get(p.serviceKey)?.usesConfigurator;
          return (
            <div key={p.id} className="p-3 card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gta-navy dark:text-slate-100">{p.cliente}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <ServiceIcon serviceKey={p.serviceKey} className="h-4 w-4 shrink-0 text-gta-indigo dark:text-indigo-300" />
                    <span className="truncate">{rotuloServico(p.serviceKey)}</span>
                    {p.manual && <Badge tone="slate" className="shrink-0">Fora da plataforma</Badge>}
                  </div>
                </div>
                <Marca tone={STATUS_TONE[p.status] ?? "slate"} className="shrink-0">{rotuloStatus(p)}</Marca>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                {p.referencia && <span className="font-mono">{p.referencia}</span>}
                <span>{nomeCriador(p)}</span>
                <span>{fmtData(p.atualizadoEm)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {podeEnviar && (
                  <button
                    onClick={() => enviarParaAprovacao(p)}
                    disabled={enviandoId === p.id}
                    className="btn-primary flex-1 justify-center !py-2 text-xs"
                  >
                    {enviandoId === p.id ? "Enviando…" : "Enviar p/ aprovação"}
                  </button>
                )}
                {podeReabrir && (
                  <Link href={`/nova/${p.serviceKey}?proposta=${p.id}`} className="btn-secondary flex-1 justify-center !py-2 text-xs">
                    Abrir
                  </Link>
                )}
                {podeReabrir && (
                  <button
                    onClick={() => duplicar(p)}
                    disabled={duplicandoId === p.id}
                    className="btn-secondary flex-1 justify-center !py-2 text-xs"
                  >
                    {duplicandoId === p.id ? "Duplicando…" : "Duplicar"}
                  </button>
                )}
                <button onClick={() => excluir(p)} className="btn-danger flex-1 !py-2 text-xs">Excluir</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabela (desktop) */}
      <div className="hidden overflow-x-auto md:block card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Serviço</th>
              <th>Referência</th>
              <th>Criador</th>
              <th>Status</th>
              <th>Atualizada</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  {propostas.length === 0 ? "Nenhuma proposta gerada ainda." : "Nenhuma proposta corresponde aos filtros."}
                </td>
              </tr>
            )}
            {paginados.map((p) => {
              const meta = serviceMap.get(p.serviceKey);
              const podeReabrir = !p.manual && meta?.usesConfigurator;
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">{p.cliente}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <ServiceIcon serviceKey={p.serviceKey} className="h-4 w-4 text-gta-indigo dark:text-indigo-300" />
                      {rotuloServico(p.serviceKey)}
                      {p.manual && <Badge tone="slate">Fora da plataforma</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{p.referencia || "—"}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{nomeCriador(p)}</td>
                  <td className="px-4 py-2">
                    <Marca tone={STATUS_TONE[p.status] ?? "slate"}>{rotuloStatus(p)}</Marca>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{fmtData(p.atualizadoEm)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap text-xs">
                      {podeEnviar && (
                        <button
                          onClick={() => enviarParaAprovacao(p)}
                          disabled={enviandoId === p.id}
                          title="Enviar para aprovação"
                          className="btn-link text-xs"
                        >
                          {enviandoId === p.id ? "Enviando…" : "Enviar"}
                        </button>
                      )}
                      {podeReabrir && (
                        <Link href={`/nova/${p.serviceKey}?proposta=${p.id}`} className="btn-link text-xs">
                          Abrir
                        </Link>
                      )}
                      {podeReabrir && (
                        <button
                          onClick={() => duplicar(p)}
                          disabled={duplicandoId === p.id}
                          title="Duplicar em novo rascunho"
                          className="btn-link text-xs"
                        >
                          {duplicandoId === p.id ? "Duplicando…" : "Duplicar"}
                        </button>
                      )}
                      {/* `.btn-link` e não `text-gta-indigo` solto: a classe do
                          sistema traz a variante de tema escuro. Sem ela, o
                          índigo da marca sobre o cartão escuro dava 2,41:1 —
                          azul quase invisível no azul escuro. */}
                      <button onClick={() => excluir(p)} className="btn-link text-xs !text-red-600 dark:!text-red-400">
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Paginacao {...controles} />
    </div>
  );
}
