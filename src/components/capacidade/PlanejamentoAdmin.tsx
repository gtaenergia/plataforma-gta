"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Alert, Badge, EmptyState, Loading, SectionCard } from "@/components/ui";
import { CATEGORIAS_PADRAO_TAREFA } from "@/lib/tasks/types";
import { CONFIG_CAPACIDADE_PADRAO, type ConfigCapacidade, type TipoDemanda } from "@/lib/capacidade/types";
import { chaveCategoria } from "@/lib/capacidade/motor";
import { CargaEquipe } from "./CargaEquipe";
import { SeletorDias } from "./SeletorDias";
import { CustoEquipeTabela, useCustoEquipe } from "@/components/custo-equipe/CustoEquipeAdmin";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";

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

/**
 * Minutos → texto em horas para o input. `0` é um valor legítimo, não vazio.
 *
 * Sai com VÍRGULA porque o campo é de texto. Enquanto era `type="number"` o
 * separador tinha de ser ponto, e era só metade do problema — ver o comentário
 * de `textos`.
 */
function paraHoras(min: number | undefined): string {
  if (min === undefined) return "";
  const h = min / 60;
  const txt = Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0+$/, "");
  return txt.replace(".", ",");
}

/** Texto em horas → minutos. Vazio devolve `undefined` = "herda o padrão". */
function paraMinutos(txt: string): number | undefined {
  const t = txt.trim().replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 60);
}

/**
 * Escreve a jornada de cada pessoa explicitamente, a partir do que hoje ela
 * herda do padrão da equipe.
 *
 * A tela deixou de ter "jornada padrão" — a jornada é de cada um. Sem isto o
 * padrão continuaria decidindo prazo por trás, invisível, para quem nunca foi
 * ajustado; e o campo ficaria impossível de editar, porque apagar para
 * redigitar faria o valor herdado reaparecer no lugar.
 *
 * Só mexe no que está na tela: `config.padrao` continua no modelo como a
 * jornada de quem entrar na equipe depois e ainda não foi cadastrado.
 */
function materializarJornadas(config: ConfigCapacidade, usuarios: Usuario[]): ConfigCapacidade {
  const pessoas = { ...config.pessoas };
  for (const u of usuarios) {
    const atual = pessoas[u.email] ?? {};
    pessoas[u.email] = {
      minutosPorDia: atual.minutosPorDia ?? config.padrao.minutosPorDia,
      atrasoInicioMin: atual.atrasoInicioMin ?? config.padrao.atrasoInicioMin,
      diasUteis: atual.diasUteis ?? config.padrao.diasUteis,
    };
  }
  return { ...config, pessoas };
}

export function PlanejamentoAdmin() {
  const [config, setConfig] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [tarefas, setTarefas] = useState<TarefaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  /**
   * Edição pendente nesta tela — inclui o bloco de custo-hora, que é outro
   * destino mas a mesma página para quem usa.
   */
  const [sujo, setSujo] = useState(false);
  const custo = useCustoEquipe();
  const temPendencia = sujo || custo.sujo;
  useAvisoNaoSalvo(temPendencia);
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
        const usuariosAtivos: Usuario[] = du.usuarios ?? [];
        setConfig(materializarJornadas(dc.config, usuariosAtivos));
        setUsuarios(usuariosAtivos);
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
    setSujo(true);
  }

  /**
   * O TEXTO digitado em cada campo de hora, separado do número.
   *
   * Os campos eram `type="number"` controlados pelo número, e a combinação
   * mentia: o navegador descarta a vírgula (o valor continua "1"), o React
   * reescreve o campo, e o dígito seguinte entra na frente do que já estava.
   * Medido: quem digitava `1,5` terminava com **51** horas — 34 vezes o
   * pretendido, sem aviso nenhum, num número que vira prazo de cliente e custo
   * administrativo.
   *
   * Agora é campo de texto com `inputMode="decimal"`, o texto fica no estado e
   * o número acompanha — o mesmo padrão do configurador de serviços.
   */
  const [textos, setTextos] = useState<Record<string, string>>({});

  function digitar(chave: string, valor: string) {
    setTextos((t) => ({ ...t, [chave]: valor }));
  }

  function alterarPessoa(email: string, campo: "minutosPorDia" | "atrasoInicioMin", valor: string) {
    if (!config) return;
    // Campo vazio vira 0, e não "apaga o ajuste": sem jornada padrão na tela,
    // apagar não teria de onde herdar — e zero horas já é o jeito de dizer que
    // a pessoa não executa tarefas.
    const min = paraMinutos(valor) ?? 0;
    const pessoas = { ...config.pessoas, [email]: { ...(config.pessoas[email] ?? {}), [campo]: min } };
    alterar({ pessoas });
  }

  function alternarDiaPessoa(email: string, dia: number) {
    if (!config) return;
    const atual = { ...(config.pessoas[email] ?? {}) };
    const base = atual.diasUteis ?? config.padrao.diasUteis;
    const novos = base.includes(dia) ? base.filter((d) => d !== dia) : [...base, dia].sort();
    // Sempre explícito: os dias são de cada pessoa, não uma herança que pode
    // mudar sozinha quando outra coisa mudar.
    const pessoas = { ...config.pessoas, [email]: { ...atual, diasUteis: novos } };
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

  async function salvarPlanejamento(): Promise<string | null> {
    if (!config) return null;
    // Linha em branco é rascunho abandonado, não dado: o schema rejeitaria o
    // objeto inteiro por causa dela e o administrador não saberia por quê.
    const limpa = { ...config, tipos: config.tipos.filter((t) => t.nome.trim() !== "") };
    try {
      const res = await fetch("/api/planejamento", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limpa),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setConfig(data.config);
      setSujo(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erro ao salvar o planejamento.";
    }
  }

  /**
   * Um botão, duas gravações.
   *
   * A tela tinha dois "Salvar" — um para a jornada e o catálogo, outro para o
   * custo-hora — porque são chaves e rotas diferentes. A razão é boa e continua
   * valendo; o que não fazia sentido era terceirizar essa distinção para quem
   * usa, que precisava adivinhar qual botão gravava o que mexeu.
   *
   * `allSettled` e não `all`: se uma falhar, a outra ainda grava, e a mensagem
   * diz QUAL falhou. Com `all`, uma rejeição abortaria a leitura do resultado
   * da outra e a tela mentiria sobre o que foi gravado.
   */
  async function salvarTudo() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const [rPlan, rCusto] = await Promise.allSettled([salvarPlanejamento(), custo.salvar()]);
      const falhas: string[] = [];
      if (rPlan.status === "rejected") falhas.push("Planejamento: falha inesperada.");
      else if (rPlan.value) falhas.push(rPlan.value);
      if (rCusto.status === "rejected") falhas.push("Custo da equipe: falha inesperada.");
      else if (rCusto.value) falhas.push(`Custo da equipe: ${rCusto.value}`);

      if (falhas.length) setErro(falhas.join(" · "));
      else setOk(true);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Loading />;
  if (!config) return <Alert tone="red">{erro ?? "Não foi possível carregar."}</Alert>;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}
      {ok && (
        <Alert tone="green">
          Parâmetros salvos. As indicações de responsável já consideram os novos valores.
        </Alert>
      )}

      <SectionCard
        title="Jornada da equipe"
        subtitle="A jornada de cada profissional. Zero horas identifica quem não executa tarefas — essa pessoa deixa de ser indicada."
      >
        {usuarios.length === 0 ? (
          <EmptyState>Nenhum usuário ativo.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th className="w-36">Horas por dia</th>
                  <th className="w-36">Horas até iniciar</th>
                  <th>Dias de trabalho</th>
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
                          inputMode="decimal"
                          className="field-input !py-1.5 tabular-nums"
                          aria-label={`Horas por dia de ${u.name || u.email}`}
                          value={
                            textos[`p:${u.email}:dia`] ??
                            paraHoras(p?.minutosPorDia ?? config.padrao.minutosPorDia)
                          }
                          onChange={(e) => {
                            digitar(`p:${u.email}:dia`, e.target.value);
                            alterarPessoa(u.email, "minutosPorDia", e.target.value);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          inputMode="decimal"
                          className="field-input !py-1.5 tabular-nums"
                          aria-label={`Horas até iniciar de ${u.name || u.email}`}
                          value={
                            textos[`p:${u.email}:atraso`] ??
                            paraHoras(p?.atrasoInicioMin ?? config.padrao.atrasoInicioMin)
                          }
                          onChange={(e) => {
                            digitar(`p:${u.email}:atraso`, e.target.value);
                            alterarPessoa(u.email, "atrasoInicioMin", e.target.value);
                          }}
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

      {/* Mesma lista de gente, dado de outra natureza: o bloco carrega de
          `/api/custo-equipe` e some sozinho para quem não tem `financeiro.ver`. */}
      <CustoEquipeTabela estado={custo} usuarios={usuarios} />

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

        {/* Categorias recolhidas: expandidas, as três tabelas somavam 1.813px —
            mais da metade da página. Quem edita mexe numa categoria por vez, e
            o resumo no cabeçalho já diz onde falta duração. `<details>` dá o
            comportamento e o acesso por teclado sem estado próprio. */}
        <div className="space-y-2">
          {categorias.map((categoria) => {
            const daCategoria = config.tipos.filter(
              (t) => chaveCategoria(t.categoria) === chaveCategoria(categoria),
            );
            const pendentes = daCategoria.filter((t) => !(t.minutos > 0)).length;
            return (
              <details key={categoria} className="group rounded-lg border border-slate-200 dark:border-slate-700">
                <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-90" aria-hidden />
                    <span className="font-medium text-gta-navy dark:text-slate-100">{categoria}</span>
                  </span>
                  <span className="hint">
                    {daCategoria.length} tipo{daCategoria.length === 1 ? "" : "s"}
                    {pendentes > 0 && ` · ${pendentes} sem duração`}
                  </span>
                </summary>

                <div className="border-t border-slate-200 p-3 dark:border-slate-700">
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
                          <th className="w-36">Duração em horas</th>
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
                                inputMode="decimal"
                                className="field-input !py-1.5 tabular-nums"
                                placeholder={paraHoras(config.estimativaPadraoMin)}
                                aria-label={`Duração média de ${t.nome || "novo tipo"}`}
                                value={textos[`t:${t.id}`] ?? paraHoras(t.minutos || undefined)}
                                onChange={(e) => {
                                  digitar(`t:${t.id}`, e.target.value);
                                  alterarTipo(t.id, { minutos: paraMinutos(e.target.value) ?? 0 });
                                }}
                              />
                            </td>
                            {/* Sem pílula "Sem duração": o campo vazio mostrando
                                o valor padrão como sugestão já diz isso, e no
                                catálogo recém-criado seriam vinte pílulas âmbar
                                de uma vez. A contagem fica no cabeçalho da
                                categoria e no aviso da seção. */}
                            <td>
                              <button
                                type="button"
                                onClick={() => removerTipo(t.id)}
                                aria-label={`Remover ${t.nome || "tipo sem nome"}`}
                                className="icon-btn"
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
                  Adicionar tipo
                </button>
                </div>
              </details>
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
          <label className="field-label" htmlFor="cap-padrao">Duração em horas, para o tipo ainda sem cadastro</label>
          <input
            id="cap-padrao"
            inputMode="decimal"
            className="field-input tabular-nums"
            value={textos["padrao"] ?? paraHoras(config.estimativaPadraoMin)}
            onChange={(e) => {
              digitar("padrao", e.target.value);
              alterar({ estimativaPadraoMin: paraMinutos(e.target.value) ?? 0 });
            }}
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
          /* Ficha removível, não `badge`: pílula de status é rótulo que se lê,
             esta aqui é um controle que se clica — e o "✕" como texto não
             acompanhava o tamanho do ícone usado no resto da plataforma. */
          <ul className="mt-4 flex flex-wrap gap-2">
            {config.feriados.map((f) => (
              <li key={f}>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 py-1 pl-2.5 pr-1 text-sm text-slate-700 dark:border-slate-600 dark:text-slate-300">
                  <span className="tabular-nums">{f.split("-").reverse().join("/")}</span>
                  <button
                    type="button"
                    onClick={() => alterar({ feriados: config.feriados.filter((x) => x !== f) })}
                    className="remover-ficha"
                    aria-label={`Remover o feriado ${f.split("-").reverse().join("/")}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* A carga da equipe ficava no topo de Tarefas e foi movida para cá: é
          informação de gestão, e o lugar dela é junto dos parâmetros que a
          determinam, não no caminho de quem só quer registrar uma tarefa. */}
      <CargaEquipe tarefas={tarefas} />

      {/* O selo é o aviso que importa: o `beforeunload` e a confirmação no
          clique são rede, e a rede só é acionada por quem já estava caindo. */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={salvarTudo} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar parâmetros"}
        </button>
        {temPendencia && !salvando && <Badge tone="amber" dot>Alterações não salvas</Badge>}
        {custo.visivel && (
          <span className="hint">Salva a jornada, o catálogo e o custo por hora de uma vez.</span>
        )}
      </div>
    </div>
  );
}
