"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Loading, SectionCard } from "@/components/ui";
import { SeletorTipoDemanda } from "@/components/capacidade/SeletorTipoDemanda";
import { SugestaoResponsavel } from "./SugestaoResponsavel";
import { FORM_VAZIO, comCategoria, comTipoDemanda, paraPayload, type FormState } from "./formulario";
import { horasParaMin, minParaHoras, useCapacidade } from "@/components/capacidade/comum";
import {
  CATEGORIAS_PADRAO_TAREFA,
  DEMANDANTES,
  PRIORIDADES,
  type Demandante,
  type Prioridade,
  type Task,
} from "@/lib/tasks/types";

/**
 * Abertura de tarefa em página própria.
 *
 * Vivia embutido acima da lista e chegou a 720 px no desktop e 1.428 px no
 * celular — 1,8 tela, empurrando a lista para baixo e fazendo quem preenchia
 * perder a referência de onde estava.
 *
 * As três seções seguem a ORDEM DAS DECISÕES, não uma divisão estética: a
 * classificação determina a estimativa, a estimativa determina quem tem folga,
 * e só então faz sentido escolher responsável e prazo. Numa grade plana de onze
 * campos esse encadeamento não se lê.
 */

interface Usuario {
  email: string;
  name: string;
}

export function NovaTarefaForm({ podeEditarCatalogo }: { podeEditarCatalogo: boolean }) {
  const router = useRouter();
  const { config: capacidade, setConfig } = useCapacidade();
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [tarefas, setTarefas] = useState<Task[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criadas, setCriadas] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [rt, ru] = await Promise.all([fetch("/api/tarefas"), fetch("/api/usuarios")]);
        const [dt, du] = await Promise.all([rt.json(), ru.json()]);
        setTarefas(dt.tasks ?? []);
        setUsuarios(du.usuarios ?? []);
      } catch {
        setErro("Falha ao carregar os dados da equipe. A indicação de responsável fica indisponível.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const clientes = useMemo(() => {
    const s = new Set<string>();
    tarefas.forEach((t) => t.cliente && s.add(t.cliente));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas]);

  const categorias = useMemo(() => {
    const s = new Set<string>(CATEGORIAS_PADRAO_TAREFA);
    for (const t of capacidade.tipos) if (t.categoria.trim()) s.add(t.categoria.trim());
    tarefas.forEach((t) => t.categoria && s.add(t.categoria));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tarefas, capacidade.tipos]);

  /**
   * Cadastra o tipo digitado sem sair da tela. O catálogo passa a crescer pelo
   * uso real, em vez de exigir uma ida à tela de planejamento a cada demanda
   * específica — que era o atrito relatado.
   */
  async function adicionarAoCatalogo(categoria: string, nome: string, minutos: number) {
    const id = `tipo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const atualizada = { ...capacidade, tipos: [...capacidade.tipos, { id, categoria, nome, minutos }] };
    const res = await fetch("/api/planejamento", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(atualizada),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Falha ao adicionar ao catálogo.");
    setConfig(data.config);
  }

  async function criar(continuar: boolean) {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tarefas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...paraPayload(form), status: "afazer" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar a tarefa.");

      if (!continuar) {
        // `refresh` antes de navegar: sem ele a lista volta do cache do
        // roteador e a tarefa recém-criada demora a aparecer.
        router.refresh();
        router.push("/tarefas");
        return;
      }
      // Em lote (a demanda da reunião de segunda vira várias tarefas), a
      // tarefa criada precisa entrar na conta da próxima: sem isso a segunda
      // tarefa seria indicada como se a primeira não existisse.
      setTarefas((prev) => [...prev, data.task]);
      setCriadas((prev) => [...prev, data.task.titulo]);
      setForm((f) => ({ ...FORM_VAZIO, cliente: f.cliente, categoria: f.categoria, demandante: f.demandante }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar a tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Loading />;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        criar(false);
      }}
    >
      {erro && <Alert tone="red">{erro}</Alert>}
      {criadas.length > 0 && (
        <Alert tone="green" titulo={`${criadas.length} ${criadas.length === 1 ? "tarefa criada" : "tarefas criadas"}.`}>
          {criadas.slice(-3).reverse().join(" · ")}
        </Alert>
      )}

      <datalist id="nova-clientes">
        {clientes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="nova-categorias">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <SectionCard title="Identificação" subtitle="O que precisa ser feito e para qual cliente.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-6">
            <label className="field-label" htmlFor="nt-titulo">Título *</label>
            <input
              id="nt-titulo"
              className="field-input"
              required
              autoFocus
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Ex.: Elaborar orçamento da usina do galpão"
            />
          </div>
          <div className="sm:col-span-6">
            <label className="field-label" htmlFor="nt-descricao">Descrição</label>
            <textarea
              id="nt-descricao"
              className="field-input min-h-[90px]"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Contexto, referências, o que já foi combinado com o cliente."
            />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="nt-cliente">Cliente</label>
            <input
              id="nt-cliente"
              className="field-input"
              list="nova-clientes"
              value={form.cliente}
              onChange={(e) => setForm({ ...form, cliente: e.target.value })}
              placeholder="Ex.: CPDF, Fazenda Rio Doce…"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="nt-demandante">Demandante</label>
            <select
              id="nt-demandante"
              className="field-input"
              value={form.demandante}
              onChange={(e) => setForm({ ...form, demandante: e.target.value as Demandante })}
            >
              {DEMANDANTES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Classificação"
        subtitle="Define quanto tempo a demanda costuma levar. É daqui que sai a estimativa."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="nt-categoria">Categoria</label>
            <input
              id="nt-categoria"
              className="field-input"
              list="nova-categorias"
              value={form.categoria}
              onChange={(e) => setForm(comCategoria(form, e.target.value))}
              placeholder="Ex.: Orçamentos"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="nt-tipo">Tipo de demanda</label>
            <SeletorTipoDemanda
              id="nt-tipo"
              categoria={form.categoria}
              valor={form.tipoDemanda}
              config={capacidade}
              estimativaMin={horasParaMin(form.estimativaHoras)}
              onEstimativaChange={(min) => setForm({ ...form, estimativaHoras: minParaHoras(min) })}
              onAdicionarAoCatalogo={podeEditarCatalogo ? adicionarAoCatalogo : undefined}
              onChange={(v) => setForm(comTipoDemanda(form, v, capacidade))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="nt-prioridade">Prioridade</label>
            <select
              id="nt-prioridade"
              className="field-input"
              value={form.prioridade}
              onChange={(e) => setForm({ ...form, prioridade: e.target.value as Prioridade })}
            >
              {PRIORIDADES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="hint mt-1">Prioridade alta passa à frente das demais na fila.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Execução"
        subtitle="Quanto tempo leva, quem tem disponibilidade e para quando fica pronta."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="nt-estimativa">Estimativa (h)</label>
            <input
              id="nt-estimativa"
              type="number"
              min={0}
              step={0.5}
              className="field-input"
              value={form.estimativaHoras}
              onChange={(e) => setForm({ ...form, estimativaHoras: e.target.value })}
              placeholder="Ex.: 4"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="field-label" htmlFor="nt-responsavel">Responsável *</label>
            <select
              id="nt-responsavel"
              className="field-input"
              required
              value={form.responsavel}
              onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
            >
              <option value="">Selecione...</option>
              {usuarios.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-6">
            <SugestaoResponsavel
              config={capacidade}
              usuarios={usuarios}
              tarefas={tarefas}
              categoria={form.categoria}
              tipoDemanda={form.tipoDemanda}
              prioridade={form.prioridade}
              estimativaMin={horasParaMin(form.estimativaHoras)}
              responsavelEscolhido={form.responsavel}
              onEscolher={(email, prazo) => setForm({ ...form, responsavel: email, prazoOperacional: prazo })}
            />
          </div>

          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="nt-prazo-com">Prazo comercial</label>
            <div className="flex gap-2">
              <input
                id="nt-prazo-com"
                type="date"
                className="field-input min-w-0 flex-1"
                value={form.prazoComercial}
                onChange={(e) => setForm({ ...form, prazoComercial: e.target.value })}
              />
              <input
                type="time"
                aria-label="Hora do prazo comercial"
                className="field-input min-w-0 flex-1"
                value={form.horaComercial}
                onChange={(e) => setForm({ ...form, horaComercial: e.target.value })}
              />
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="field-label" htmlFor="nt-prazo-op">Prazo operacional</label>
            <div className="flex gap-2">
              <input
                id="nt-prazo-op"
                type="date"
                className="field-input min-w-0 flex-1"
                value={form.prazoOperacional}
                onChange={(e) => setForm({ ...form, prazoOperacional: e.target.value })}
              />
              <input
                type="time"
                aria-label="Hora do prazo operacional"
                className="field-input min-w-0 flex-1"
                value={form.horaOperacional}
                onChange={(e) => setForm({ ...form, horaOperacional: e.target.value })}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? "Salvando…" : "Criar tarefa"}
        </button>
        {/* A demanda chega em bloco na reunião de segunda. Sem este botão,
            cada tarefa custaria uma ida e volta à lista. */}
        <button type="button" className="btn-secondary" disabled={salvando} onClick={() => criar(true)}>
          Criar e abrir outra
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/tarefas")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
