"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Alert, Badge, EmptyState, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { formatBRL } from "@/lib/format";
import { valorDaNegociacao, type Funil, type Negociacao } from "@/lib/crm/types";
import { buscarJson, enviarJson } from "./buscar";
import { dataCurta } from "./util";

/**
 * O quadro do funil: uma coluna por etapa, um cartão por negociação em aberto.
 *
 * Mover de etapa: arrastando o cartão (desktop) ou pelo seletor de etapa no
 * próprio cartão — que é também o caminho do dedo, onde arrastar não existe.
 * Ganhar/perder ficam na ficha da negociação, onde a perda pede o motivo.
 */
export function FunilBoard() {
  const [funis, setFunis] = useState<Funil[]>([]);
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [funilId, setFunilId] = useState("");
  const [fResponsavel, setFResponsavel] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  /** Criação rápida na coluna (como no RD): etapa com o formulário aberto. */
  const [novaEm, setNovaEm] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState("");
  const [criandoRapida, setCriandoRapida] = useState(false);

  useEffect(() => {
    Promise.all([
      buscarJson<{ funis: Funil[] }>("/api/crm/funis"),
      buscarJson<{ negociacoes: Negociacao[] }>("/api/crm/negociacoes"),
    ])
      .then(([f, n]) => {
        const lista = f.funis ?? [];
        setFunis(lista);
        setNegociacoes(n.negociacoes ?? []);
        if (lista.length > 0) setFunilId((atual) => atual || lista[0].id);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o funil."))
      .finally(() => setLoading(false));
  }, []);

  const funil = useMemo(() => funis.find((f) => f.id === funilId) ?? null, [funis, funilId]);

  /** No quadro só vive o que ainda está em jogo: abertas e pausadas. */
  const doQuadro = useMemo(
    () =>
      negociacoes.filter(
        (n) =>
          n.funilId === funilId &&
          (n.situacao === "aberta" || n.situacao === "pausada") &&
          (!fResponsavel || n.responsavel === fResponsavel),
      ),
    [negociacoes, funilId, fResponsavel],
  );

  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const n of negociacoes) if (n.responsavel) mapa.set(n.responsavel, n.responsavelNome || n.responsavel);
    return Array.from(mapa, ([email, nome]) => ({ email, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [negociacoes]);

  async function moverEtapa(n: Negociacao, etapaId: string) {
    if (etapaId === n.etapaId) return;
    // Otimista: o cartão muda de coluna já no arrasto; a resposta confirma
    // (e traz o histórico novo) ou devolve com a mensagem de erro.
    setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? { ...x, etapaId } : x)));
    try {
      const data = await enviarJson<{ negociacao: Negociacao }>(`/api/crm/negociacoes/${n.id}`, "PATCH", { etapaId });
      setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? data.negociacao : x)));
    } catch (err) {
      setNegociacoes((prev) => prev.map((x) => (x.id === n.id ? n : x)));
      setErro(err instanceof Error ? err.message : "Falha ao mover.");
    }
  }

  /** A criação rápida da coluna: só o nome — o resto fica para a ficha. */
  async function criarRapida(etapaId: string) {
    const nome = novoNome.trim();
    if (!nome || !funil) return;
    setCriandoRapida(true);
    setErro(null);
    try {
      const data = await enviarJson<{ negociacao: Negociacao }>("/api/crm/negociacoes", "POST", {
        nome, funilId: funil.id, etapaId,
      });
      setNegociacoes((prev) => [data.negociacao, ...prev]);
      setNovoNome("");
      setNovaEm(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao criar.");
    } finally {
      setCriandoRapida(false);
    }
  }

  if (loading) return <Loading>Carregando o funil…</Loading>;
  /*
   * O ERRO vem antes do vazio.
   *
   * Sem esta ordem, uma falha de rede virava "Nenhum funil configurado" — uma
   * frase falsa, sobre um estado sem saída: a pessoa ia às Configurações,
   * encontrava o funil lá, e não entendia nada.
   */
  if (erro) {
    return (
      <Alert tone="red" titulo="Não foi possível carregar o funil.">
        {erro}{" "}
        <button type="button" className="btn-link" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </Alert>
    );
  }
  if (!funil) {
    return (
      <EmptyState>
        Nenhum funil configurado.{" "}
        <Link href="/crm/configuracoes/funis" className="btn-link">Criar o primeiro funil</Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Barra: seletor de funil + filtro + nova negociação */}
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:p-4 card">
        {funis.length > 1 && (
          <Campo className="min-w-[180px]" label="Funil">
            <select className="field-input" value={funilId} onChange={(e) => setFunilId(e.target.value)}>
              {funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo className="min-w-[180px]" label="Responsável">
          <select className="field-input" value={fResponsavel} onChange={(e) => setFResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {responsaveis.map((r) => <option key={r.email} value={r.email}>{r.nome}</option>)}
          </select>
        </Campo>
        <div className="flex-1" />
        <Link href="/crm/negociacoes#novo" className="btn-primary whitespace-nowrap">+ Nova negociação</Link>
      </div>

      {/* O quadro. As colunas DIVIDEM a largura disponível (`flex-1`): com o
          funil padrão de 5 etapas, todas cabem inteiras no container — a
          versão anterior fixava 260px por coluna e a última ficava cortada ao
          meio, parecendo defeito. O `min-w` segura a legibilidade: com mais
          etapas do que cabe, volta a rolagem horizontal. */}
      <div className="sem-barra-rolagem -mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex items-start gap-3">
          {funil.etapas.map((etapa) => {
            const daColuna = doQuadro.filter((n) => n.etapaId === etapa.id);
            const soma = daColuna.reduce((s, n) => s + valorDaNegociacao(n), 0);
            return (
              <section
                key={etapa.id}
                aria-label={`Etapa ${etapa.nome}`}
                className={`min-w-[230px] flex-1 basis-0 rounded-xl border bg-slate-50 dark:bg-slate-900/50 ${
                  alvo === etapa.id ? "border-gta-indigo" : "border-slate-200 dark:border-slate-700"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(etapa.id);
                }}
                onDragLeave={() => setAlvo((a) => (a === etapa.id ? null : a))}
                onDrop={(e) => {
                  e.preventDefault();
                  setAlvo(null);
                  const n = negociacoes.find((x) => x.id === arrastando);
                  if (n) void moverEtapa(n, etapa.id);
                  setArrastando(null);
                }}
              >
                <header className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gta-navy dark:text-slate-100">{etapa.nome}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="hint">{daColuna.length}</span>
                      {/* Criar direto na etapa, como no RD — só o nome; o resto na ficha. */}
                      {/* `icon-btn` sem os `!h-6 !w-6` de antes: eles venciam a
                          media query de toque (que não usa `!important`) e
                          deixavam o botão com 24px no celular, metade do
                          mínimo. E `icon-btn-neutro` porque criar não é
                          remover — o hover vermelho enganava. */}
                      <button
                        type="button"
                        className="icon-btn icon-btn-neutro h-7 w-7"
                        aria-label={`Nova negociação em ${etapa.nome}`}
                        onClick={() => {
                          setNovaEm((v) => (v === etapa.id ? null : etapa.id));
                          setNovoNome("");
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  </div>
                  <div className="hint mt-0.5">{soma > 0 ? formatBRL(soma) : "—"}</div>
                </header>
                <div className="space-y-2 p-2">
                  {novaEm === etapa.id && (
                    <form
                      className="space-y-2 rounded-lg border border-gta-indigo bg-white p-2 dark:bg-slate-800"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void criarRapida(etapa.id);
                      }}
                    >
                      <input
                        className="field-input !py-1.5 text-sm"
                        value={novoNome}
                        onChange={(e) => setNovoNome(e.target.value)}
                        placeholder="Nome da negociação…"
                        aria-label={`Nome da nova negociação em ${etapa.nome}`}
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary flex-1 justify-center !py-1 text-xs" disabled={criandoRapida || !novoNome.trim()}>
                          {criandoRapida ? "Criando…" : "Criar"}
                        </button>
                        <button type="button" className="btn-secondary !py-1 text-xs" onClick={() => setNovaEm(null)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                  {daColuna.length === 0 && novaEm !== etapa.id && (
                    <p className="px-1 py-3 text-center text-xs text-slate-500 dark:text-slate-400">Sem negociações</p>
                  )}
                  {daColuna.map((n) => (
                    <article
                      key={n.id}
                      draggable
                      onDragStart={() => setArrastando(n.id)}
                      onDragEnd={() => {
                        setArrastando(null);
                        setAlvo(null);
                      }}
                      className={`rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${
                        arrastando === n.id ? "opacity-50" : ""
                      }`}
                    >
                      {/* O bloco de informações inteiro leva à ficha — só o
                          título era alvo pequeno demais para um cartão. */}
                      <Link href={`/crm/negociacoes/${n.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-gta-navy hover:underline dark:text-slate-100">
                            {n.nome}
                          </span>
                          {n.situacao === "pausada" && <Badge tone="amber" className="shrink-0">Pausada</Badge>}
                        </div>
                        {n.empresaNome && <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">{n.empresaNome}</div>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-gta-navy dark:text-slate-200">{formatBRL(valorDaNegociacao(n))}</span>
                          {n.previsao && <span>{dataCurta(n.previsao)}</span>}
                        </div>
                        {n.responsavelNome && <div className="hint mt-1 truncate">{n.responsavelNome}</div>}
                      </Link>
                      {/* Caminho sem arrasto (dedo, teclado): o mesmo movimento, por seletor. */}
                      <select
                        className="field-input mt-2 w-full !py-1 text-xs"
                        value={n.etapaId}
                        onChange={(e) => void moverEtapa(n, e.target.value)}
                        aria-label={`Etapa de ${n.nome}`}
                      >
                        {funil.etapas.map((e2) => <option key={e2.id} value={e2.id}>{e2.nome}</option>)}
                      </select>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
