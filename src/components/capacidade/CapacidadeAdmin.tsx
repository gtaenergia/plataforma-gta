"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, EmptyState, Loading, SectionCard } from "@/components/ui";
import { CATEGORIAS_PADRAO_TAREFA } from "@/lib/tasks/types";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade } from "@/lib/capacidade/types";
import { chaveCategoria } from "@/lib/capacidade/motor";

/**
 * Cadastro da capacidade da equipe.
 *
 * Um formulário só, um PUT com o objeto inteiro — mesmo desenho de
 * /admin/parametros. Salvar campo a campo exigiria mesclagem no servidor e
 * abriria a porta para dois administradores se sobrescreverem sem perceber.
 *
 * A tela fala em HORAS; o que trafega e o que fica salvo são MINUTOS. A
 * conversão acontece só aqui.
 */

const DIAS = [
  { v: 0, label: "D" },
  { v: 1, label: "S" },
  { v: 2, label: "T" },
  { v: 3, label: "Q" },
  { v: 4, label: "Q" },
  { v: 5, label: "S" },
  { v: 6, label: "S" },
];
const DIA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

interface Usuario {
  email: string;
  name: string;
}

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

export function CapacidadeAdmin() {
  const [config, setConfig] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [categoriasEmUso, setCategoriasEmUso] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [novoFeriado, setNovoFeriado] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [rc, ru, rt] = await Promise.all([
          fetch("/api/capacidade"),
          fetch("/api/usuarios"),
          fetch("/api/tarefas"),
        ]);
        const [dc, du, dt] = await Promise.all([rc.json(), ru.json(), rt.json()]);
        if (!rc.ok) throw new Error(dc.error ?? "Falha ao carregar a configuração.");
        setConfig(dc.config);
        setUsuarios(du.usuarios ?? []);

        // As categorias já usadas em alguma tarefa, mais as padrão. Sem isso o
        // admin teria que adivinhar quais nomes existem e digitá-los de novo,
        // com o risco de errar e criar uma estimativa que nunca casa.
        const usadas = new Set<string>(CATEGORIAS_PADRAO_TAREFA);
        for (const t of dt.tasks ?? []) if (t.categoria?.trim()) usadas.add(t.categoria.trim());
        setCategoriasEmUso([...usadas].sort((a, b) => a.localeCompare(b, "pt-BR")));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
        setConfig(CONFIG_CAPACIDADE_PADRAO);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  /** Categorias em uso que ainda não têm estimativa cadastrada. */
  const semEstimativa = useMemo(() => {
    if (!config) return [];
    return categoriasEmUso.filter((c) => !(config.estimativas[chaveCategoria(c)] > 0));
  }, [categoriasEmUso, config]);

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

  function alterarEstimativa(categoria: string, valor: string) {
    if (!config) return;
    const min = paraMinutos(valor);
    const estimativas = { ...config.estimativas };
    if (min === undefined || min === 0) delete estimativas[chaveCategoria(categoria)];
    else estimativas[chaveCategoria(categoria)] = min;
    alterar({ estimativas });
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const res = await fetch("/api/capacidade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
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
      {ok && <Alert tone="green">Parâmetros salvos. As indicações de responsável já consideram os novos valores.</Alert>}

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
            <div className="flex gap-1">
              {DIAS.map((d, i) => {
                const ativo = config.padrao.diasUteis.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    aria-pressed={ativo}
                    aria-label={DIA_NOME[d.v]}
                    onClick={() => {
                      const novos = ativo
                        ? config.padrao.diasUteis.filter((x) => x !== d.v)
                        : [...config.padrao.diasUteis, d.v].sort();
                      alterar({ padrao: { ...config.padrao, diasUteis: novos } });
                    }}
                    className={`h-10 w-10 rounded-md border text-sm font-medium transition ${
                      ativo
                        ? "border-gta-indigo bg-gta-indigo text-white"
                        : "border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                    }`}
                  >
                    {DIAS[i].label}
                  </button>
                );
              })}
            </div>
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
                        <div className="flex gap-1">
                          {DIAS.map((d, i) => (
                            <button
                              key={d.v}
                              type="button"
                              aria-pressed={dias.includes(d.v)}
                              aria-label={`${DIA_NOME[d.v]} de ${u.name || u.email}`}
                              onClick={() => alternarDiaPessoa(u.email, d.v)}
                              className={`h-8 w-8 rounded border text-xs transition ${
                                dias.includes(d.v)
                                  ? "border-gta-indigo bg-gta-indigo text-white"
                                  : "border-slate-300 text-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                              }`}
                            >
                              {DIAS[i].label}
                            </button>
                          ))}
                        </div>
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
        title="Duração média por categoria"
        subtitle="Aplicada quando a tarefa não tem estimativa própria. Permite calcular o prazo de entrega já na abertura."
      >
        {semEstimativa.length > 0 && (
          <Alert
            tone="amber"
            className="mb-4"
            titulo={semEstimativa.length === 1 ? "Estimativa pendente." : "Estimativas pendentes."}
          >
            {semEstimativa.length === categoriasEmUso.length
              ? "Nenhuma categoria tem duração cadastrada. Toda tarefa sem estimativa própria utilizará o valor padrão definido abaixo."
              : `${semEstimativa.length} de ${categoriasEmUso.length} categorias ${semEstimativa.length === 1 ? "utiliza" : "utilizam"} o valor padrão: ${semEstimativa.join(", ")}.`}
          </Alert>
        )}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="w-40">Duração média (h)</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {categoriasEmUso.map((c) => {
                const min = config.estimativas[chaveCategoria(c)];
                return (
                  <tr key={c}>
                    <td className="font-medium text-gta-navy dark:text-slate-100">{c}</td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="field-input !py-1.5"
                        placeholder={paraHoras(config.estimativaPadraoMin)}
                        aria-label={`Duração média de ${c}`}
                        value={paraHoras(min)}
                        onChange={(e) => alterarEstimativa(c, e.target.value)}
                      />
                    </td>
                    <td>{!(min > 0) && <Badge tone="amber">sem estimativa</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 max-w-xs">
          <label className="field-label" htmlFor="cap-padrao">Duração padrão (categorias sem cadastro)</label>
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

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
        <span className="hint">Jornada padrão: {paraHoras(config.padrao.minutosPorDia)} h/dia, {padraoDias || "nenhum dia selecionado"}.</span>
      </div>
    </div>
  );
}
