"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, EmptyState, Loading, SectionCard } from "@/components/ui";
import { CATEGORIAS_PADRAO_TAREFA } from "@/lib/tasks/types";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade, type TipoDemanda } from "@/lib/capacidade/types";
import { chaveCategoria } from "@/lib/capacidade/motor";
import { CargaEquipe } from "./CargaEquipe";
import { DIA_NOME, SeletorDias } from "./SeletorDias";

/**
 * Parâmetros de planejamento: jornada da equipe, catálogo de tipos de demanda
 * e calendário.
 *
 * Um formulário só, um PUT com o objeto inteiro — mesmo desenho de
 * /admin/parametros. Salvar campo a campo exigiria mesclagem no servidor e
 * abriria a porta para dois administradores se sobrescreverem sem perceber.
 *
 * A tela fala em HORAS; o que trafega e o que fica salvo são MINUTOS. A
 * conversão acontece só aqui.
 */


interface Usuario {
  email: string;
  name: string;
}

/** O recorte de `Task` que esta tela consome — o resto vai para `CargaEquipe`. */
type TarefaResumo = Parameters<typeof CargaEquipe>[0]["tarefas"][number];

/** Minutos → texto em horas para o input. `0` é um valor legítimo, não vazio. */
function paraHoras(min: number | undefined): string {
  if (min === undefined) return "";
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, "");
}

/** Texto em horas → minutos. Vazio devolve `undefined` = "herda o padrão". */
function paraMinutos(txt: string): number | undefined {
  const t = txt.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 60);
}

export function PlanejamentoAdmin() {
  const [config, setConfig] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tarefas, setTarefas] = useState<TarefaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [novoFeriado, setNovoFeriado] = useState("");
  const [novaCategoria, setNovaCategoria] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rc, ru, rt] = await Promise.all([
          fetch("/api/planejamento"),
          fetch("/api/usuarios"),
          fetch("/api/tarefas"),
        ]);
        const [dc, du, dt] = await Promise.all([rc.json(), ru.json(), rt.json()]);
        if (!rc.ok) throw new Error(dc.error ?? "Falha ao carregar a configuração.");
        setConfig(dc.config);
        setUsuarios(du.usuarios ?? []);
        setTarefas(dt.tasks ?? []);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
        setConfig(CONFIG_CAPACIDADE_PADRAO);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  /**
   * Categorias exibidas: as três de fábrica, as que já têm tipos cadastrados e
   * as que alguma tarefa usa. Sem reunir as três origens, uma categoria criada
   * direto na tarefa ficaria invisível aqui e nunca receberia duração.
   */
  const categorias = useMemo(() => {
    const set = new Set<string>(CATEGORIAS_PADRAO_TAREFA);
    for (const t of config?.tipos ?? []) if (t.categoria.trim()) set.add(t.categoria.trim());
    for (const t of tarefas) if (t.categoria?.trim()) set.add(t.categoria.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [config?.tipos, tarefas]);

  /** Tipos sem duração cadastrada — caem no valor padrão até serem preenchidos. */
  const semDuracao = useMemo(() => (config?.tipos ?? []).filter((t) => !(t.minutos > 0)), [config?.tipos]);

  function alterar(patch: Partial<ConfigCapacidade>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
    setOk(false);
  }

  function alterarPessoa(email: string, campo: "minutosPorDia" | "atrasoInicioMin", valor: string) {
    if (!config) return;
    const min = paraMinutos(valor);
    const atual = { ...(config.pessoas[email] ?? {}) };
    if (min === undefined) delete atual[campo];
    else atual[campo] = min;

    const pessoas = { ...config.pessoas };
    // Sem campo nenhum, a entrada some — assim o mapa não acumula objetos
    // vazios que confundem quem for ler o JSON depois.
    if (Object.keys(atual).length === 0) delete pessoas[email];
    else pessoas[email] = atual;
    alterar({ pessoas });
  }

  function alternarDiaPessoa(email: string, dia: number) {
    if (!config) return;
    const atual = { ...(config.pessoas[email] ?? {}) };
    const base = atual.diasUteis ?? config.padrao.diasUteis;
    const novos = base.includes(dia) ? base.filter((d) => d !== dia) : [...base, dia].sort();
    // Igual ao padrão volta a ser herança, não um ajuste travado que deixaria
    // de acompanhar uma mudança futura no padrão da equipe.
    const igualAoPadrao = novos.join() === config.padrao.diasUteis.join();
    if (igualAoPadrao) delete atual.diasUteis;
    else atual.diasUteis = novos;

    const pessoas = { ...config.pessoas };
    if (Object.keys(atual).length === 0) delete pessoas[email];
    else pessoas[email] = atual;
    alterar({ pessoas });
  }

  /** Altera um campo de um tipo do catálogo, preservando a ordem da lista. */
  function alterarTipo(id: string, patch: Partial<TipoDemanda>) {
    if (!config) return;
    alterar({ tipos: config.tipos.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  }

  function removerTipo(id: string) {
    if (!config) return;
    alterar({ tipos: config.tipos.filter((t) => t.id !== id) });
  }

  function adicionarTipo(categoria: string) {
    if (!config) return;
    // Id gerado no cliente e nunca reaproveitado: é a chave do React e o alvo
    // das edições. Reutilizar o índice faria a linha em edição trocar de valor
    // quando outra fosse removida acima dela.
    const id = `tipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    alterar({ tipos: [...config.tipos, { id, categoria, nome: "", minutos: 0 }] });
  }

  function adicionarCategoria() {
    const nome = novaCategoria.trim();
    if (!config || !nome) return;
    // Uma categoria só existe enquanto tiver ao menos um tipo dentro dela, já
    // que a lista de categorias é derivada do catálogo.
    const id = `tipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    alterar({ tipos: [...config.tipos, { id, categoria: nome, nome: "", minutos: 0 }] });
    setNovaCategoria("");
  }

  async function salvar() {
    if (!config) return;
    // Linha em branco é rascunho abandonado, não dado: o schema rejeitaria o
    // objeto inteiro por causa dela e o administrador não saberia por quê.
    const limpa = { ...config, tipos: config.tipos.filter((t) => t.nome.trim() !== "") };
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch("/api/planejamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limpa),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setConfig(data.config);
      setOk(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Loading />;
  if (!config) return <Alert tone="red">{erro ?? "Não foi possível carregar."}</Alert>;

  const padraoDias = config.padrao.diasUteis
    .map((d) => DIA_NOME[d])
    .join(", ")
    .replace(/, ([^,]*)$/, " e $1");

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}
      {ok && (
        <Alert tone="green">
          Parâmetros salvos. As indicações de responsável já consideram os novos valores.
        </Alert>
      )}

      <SectionCard
        title="Jornada padrão da equipe"
        subtitle="Aplicada a todos os profissionais que não tiverem parâmetros individuais."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="cap-horas">Horas por dia</label>
            <input
              id="cap-horas"
              type="number"
              min={0}
              max={24}
              step={0.5}
              className="field-input"
              value={paraHoras(config.padrao.minutosPorDia)}
              onChange={(e) =>
                alterar({ padrao: { ...config.padrao, minutosPorDia: paraMinutos(e.target.value) ?? 0 } })
              }
            />
          </div>
          <div>
            <label className="field-label" htmlFor="cap-atraso">Tempo médio de resposta (h)</label>
            <input
              id="cap-atraso"
              type="number"
              min={0}
              step={0.5}
              className="field-input"
              value={paraHoras(config.padrao.atrasoInicioMin)}
              onChange={(e) =>
                alterar({ padrao: { ...config.padrao, atrasoInicioMin: paraMinutos(e.target.value) ?? 0 } })
              }
            />
            <p className="hint mt-1">
              Intervalo médio entre a abertura da tarefa e o início do atendimento. Considerado no cálculo do prazo.
            </p>
          </div>
          <div>
            <span className="field-label">Dias de trabalho</span>
            <SeletorDias
              valor={config.padrao.diasUteis}
              onAlternar={(dia) => {
                const atuais = config.padrao.diasUteis;
                const novos = atuais.includes(dia)
                  ? atuais.filter((x) => x !== dia)
                  : [...atuais, dia].sort();
                alterar({ padrao: { ...config.padrao, diasUteis: novos } });
              }}
            />
          </div>
        </div>
        {config.padrao.diasUteis.length === 0 && (
          <Alert tone="amber" className="mt-4">
            Nenhum dia de trabalho selecionado. Sem essa informação a plataforma não calcula prazos.
          </Alert>
        )}
      </SectionCard>

      <SectionCard
        title="Parâmetros individuais"
        subtitle="Campos em branco herdam a jornada padrão. Jornada igual a zero identifica profissionais que não executam tarefas — eles deixam de ser indicados."
      >
        {usuarios.length === 0 ? (
          <EmptyState>Nenhum usuário ativo.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th className="w-32">Horas/dia</th>
                  <th className="w-32">Resposta (h)</th>
                  <th>Dias</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const p = config.pessoas[u.email];
                  const dias = p?.diasUteis ?? config.padrao.diasUteis;
                  return (
                    <tr key={u.email}>
                      <td>
                        <div className="font-medium text-gta-navy dark:text-slate-100">{u.name || u.email}</div>
                        <div className="hint">{u.email}</div>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          className="field-input !py-1.5"
                          placeholder={paraHoras(config.padrao.minutosPorDia)}
                          aria-label={`Horas por dia de ${u.name || u.email}`}
                          value={paraHoras(p?.minutosPorDia)}
                          onChange={(e) => alterarPessoa(u.email, "minutosPorDia", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          className="field-input !py-1.5"
                          placeholder={paraHoras(config.padrao.atrasoInicioMin)}
                          aria-label={`Atraso até olhar a plataforma de ${u.name || u.email}`}
                          value={paraHoras(p?.atrasoInicioMin)}
                          onChange={(e) => alterarPessoa(u.email, "atrasoInicioMin", e.target.value)}
                        />
                      </td>
                      <td>
                        <SeletorDias
                          valor={dias}
                          contexto={u.name || u.email}
                          onAlternar={(dia) => alternarDiaPessoa(u.email, dia)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Catálogo de demandas"
        subtitle="Cada categoria reúne os tipos de demanda que a equipe executa, com a duração média de cada um. É essa duração que a plataforma usa para calcular o prazo quando a tarefa não tem estimativa própria."
      >
        {semDuracao.length > 0 && (
          <Alert
            tone="amber"
            className="mb-4"
            titulo={semDuracao.length === 1 ? "Duração pendente." : "Durações pendentes."}
          >
            {semDuracao.length === config.tipos.length
              ? "Nenhum tipo de demanda tem duração cadastrada. Enquanto isso, toda tarefa sem estimativa própria utilizará a duração padrão definida ao final desta seção."
              : `${semDuracao.length} de ${config.tipos.length} tipos ainda ${semDuracao.length === 1 ? "utiliza" : "utilizam"} a duração padrão.`}
          </Alert>
        )}

        <div className="space-y-6">
          {categorias.map((categoria) => {
            const daCategoria = config.tipos.filter(
              (t) => chaveCategoria(t.categoria) === chaveCategoria(categoria),
            );
            return (
              <div key={categoria}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gta-navy dark:text-slate-100">
                    {categoria}
                  </h3>
                  <span className="hint">
                    {daCategoria.length} tipo{daCategoria.length === 1 ? "" : "s"}
                  </span>
                </div>

                {daCategoria.length === 0 ? (
                  <p className="hint mb-2">Nenhum tipo cadastrado nesta categoria.</p>
                ) : (
                  <div className="overflow-x-auto">
                    {/* `data-table` e não `table-compacta`: as duas conviviam
                        nesta mesma página com cabeçalhos diferentes (um com
                        fundo e MAIÚSCULAS, outro sem), e lado a lado isso lê
                        como descuido. */}
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tipo de demanda</th>
                          <th className="w-36">Duração (h)</th>
                          <th className="w-28" />
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {daCategoria.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <input
                                className="field-input !py-1.5"
                                aria-label="Nome do tipo de demanda"
                                placeholder="Ex.: Projeto de subestação"
                                value={t.nome}
                                onChange={(e) => alterarTipo(t.id, { nome: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                className="field-input !py-1.5"
                                placeholder={paraHoras(config.estimativaPadraoMin)}
                                aria-label={`Duração média de ${t.nome || "novo tipo"}`}
                                value={paraHoras(t.minutos || undefined)}
                                onChange={(e) => alterarTipo(t.id, { minutos: paraMinutos(e.target.value) ?? 0 })}
                              />
                            </td>
                            <td>{!(t.minutos > 0) && <Badge tone="amber">Sem duração</Badge>}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => removerTipo(t.id)}
                                aria-label={`Remover ${t.nome || "tipo sem nome"}`}
                                className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button type="button" className="btn-ghost mt-1" onClick={() => adicionarTipo(categoria)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Adicionar tipo em {categoria}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div>
            <label className="field-label" htmlFor="cap-nova-categoria">Nova categoria</label>
            <input
              id="cap-nova-categoria"
              className="field-input"
              placeholder="Ex.: Manutenção"
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarCategoria();
                }
              }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={adicionarCategoria}
            disabled={!novaCategoria.trim() || categorias.some((c) => chaveCategoria(c) === chaveCategoria(novaCategoria))}
          >
            Adicionar categoria
          </button>
        </div>

        <div className="mt-4 max-w-xs">
          <label className="field-label" htmlFor="cap-padrao">Duração padrão (tipos sem cadastro)</label>
          <input
            id="cap-padrao"
            type="number"
            min={0}
            step={0.5}
            className="field-input"
            value={paraHoras(config.estimativaPadraoMin)}
            onChange={(e) => alterar({ estimativaPadraoMin: paraMinutos(e.target.value) ?? 0 })}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Feriados e pontos facultativos"
        subtitle="Dias sem expediente. Excluídos do cálculo de prazos."
      >
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label" htmlFor="cap-feriado">Adicionar dia</label>
            <input
              id="cap-feriado"
              type="date"
              className="field-input"
              value={novoFeriado}
              onChange={(e) => setNovoFeriado(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={!novoFeriado || config.feriados.includes(novoFeriado)}
            onClick={() => {
              alterar({ feriados: [...config.feriados, novoFeriado].sort() });
              setNovoFeriado("");
            }}
          >
            Adicionar
          </button>
        </div>
        {config.feriados.length === 0 ? (
          <p className="hint mt-4">Nenhum feriado cadastrado.</p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {config.feriados.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => alterar({ feriados: config.feriados.filter((x) => x !== f) })}
                  className="badge badge-slate hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                  aria-label={`Remover feriado ${f}`}
                >
                  {f.split("-").reverse().join("/")} ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* A carga da equipe ficava no topo de Tarefas e foi movida para cá: é
          informação de gestão, e o lugar dela é junto dos parâmetros que a
          determinam, não no caminho de quem só quer registrar uma tarefa. */}
      <CargaEquipe tarefas={tarefas} />

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
        <span className="hint">Jornada padrão: {paraHoras(config.padrao.minutosPorDia)} h/dia, {padraoDias || "nenhum dia selecionado"}.</span>
      </div>
    </div>
  );
}
