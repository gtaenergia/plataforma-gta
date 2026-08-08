"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { SugestaoResponsavel } from "@/components/tasks/SugestaoResponsavel";
import { useCapacidade } from "@/components/capacidade/comum";
import { acharTipo, tiposDaCategoria } from "@/lib/capacidade/motor";
import { tipoSugeridoDoServico } from "@/lib/custo-equipe/servico-demanda";
import type { TarefaCapacidade } from "@/lib/capacidade/motor";
import type { Negociacao, ProdutoCrm } from "@/lib/crm/types";
import { dataCurta } from "./util";

/**
 * "Pedir proposta": o comercial abre a negociação, mas quem monta a proposta é
 * a engenharia. Este bloco cria a tarefa em OPERAÇÕES já preenchida — e é o
 * `negociacaoId` dela que traz o valor de volta quando a proposta ficar pronta.
 *
 * O serviço vem do produto vinculado à negociação (Configurações → Produtos),
 * e dele sai o tipo de demanda — que é o que dá a duração ao motor de
 * capacidade e, por consequência, a indicação de quem pega e para quando.
 */

const CATEGORIA = "Orçamentos";

interface UsuarioOpcao {
  email: string;
  name: string;
}

interface TarefaVinculada {
  id: string;
  titulo: string;
  status: string;
  responsavel: string;
  prazoOperacional: string;
}

export function PedirProposta({ negociacao, produtos, usuarios, aberta, onPedido }: {
  negociacao: Negociacao;
  produtos: ProdutoCrm[];
  usuarios: UsuarioOpcao[];
  aberta: boolean;
  onPedido: () => void;
}) {
  const { config } = useCapacidade();
  const [tarefas, setTarefas] = useState<TarefaCapacidade[]>([]);
  const [vinculadas, setVinculadas] = useState<TarefaVinculada[]>([]);
  const [abrindo, setAbrindo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [serviceKey, setServiceKey] = useState("");
  const [tipoDemanda, setTipoDemanda] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [prazo, setPrazo] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    fetch("/api/tarefas")
      .then((r) => r.json())
      .then((d) => {
        const lista = (d.tasks ?? d.tarefas ?? []) as (TarefaCapacidade & TarefaVinculada & { negociacaoId?: string })[];
        setTarefas(lista);
        setVinculadas(lista.filter((t) => t.negociacaoId === negociacao.id));
      })
      .catch(() => {
        /* a fila é insumo da sugestão; sem ela o bloco ainda cria a tarefa */
      });
  }, [negociacao.id]);

  /** O serviço sugerido: o do primeiro produto da negociação que aponte para um. */
  const servicoDoProduto = useMemo(() => {
    for (const p of negociacao.produtos) {
      const cat = produtos.find((x) => x.id === p.produtoId);
      if (cat?.serviceKey) return cat.serviceKey;
    }
    return "";
  }, [negociacao.produtos, produtos]);

  /** Serviços disponíveis: os que algum produto do catálogo aponta. */
  const servicos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of produtos) if (p.serviceKey) mapa.set(p.serviceKey, p.nome);
    return Array.from(mapa, ([key, nome]) => ({ key, nome }));
  }, [produtos]);

  function abrir() {
    setErro(null);
    const chave = servicoDoProduto || servicos[0]?.key || "";
    setServiceKey(chave);
    setTipoDemanda(chave ? (tipoSugeridoDoServico(chave, "orcamento")?.nome ?? "") : "");
    setResponsavel("");
    setPrazo("");
    setObservacao("");
    setAbrindo(true);
  }

  const estimativaMin = useMemo(() => {
    const t = tipoDemanda ? acharTipo(config, CATEGORIA, tipoDemanda) : undefined;
    return t?.minutos ?? 0;
  }, [config, tipoDemanda]);

  const tiposDisponiveis = useMemo(() => tiposDaCategoria(config, CATEGORIA), [config]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!responsavel) { setErro("Escolha quem vai montar a proposta."); return; }
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/crm/negociacoes/${negociacao.id}/pedir-proposta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey, tipoDemanda, responsavel, prazo, estimativaMin, observacao }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao pedir a proposta.");
      setAbrindo(false);
      setVinculadas((prev) => [...prev, d.tarefa as TarefaVinculada]);
      onPedido();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao pedir a proposta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <SectionCard
      title="Proposta"
      subtitle="Quem monta a proposta é a engenharia. O pedido vira tarefa em Operações, e o valor volta para cá quando ela ficar pronta."
      actions={
        aberta && !abrindo ? (
          <button className="btn-primary !py-1.5 text-sm" onClick={abrir}>Pedir proposta</button>
        ) : null
      }
    >
      {erro && <Alert tone="red" className="mb-3">{erro}</Alert>}

      {vinculadas.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-700">
          {vinculadas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/tarefas/${t.id}`} className="min-w-0 text-sm text-gta-navy hover:underline dark:text-slate-100">
                {t.titulo}
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                {t.prazoOperacional && <span className="hint">{dataCurta(t.prazoOperacional)}</span>}
                <Badge tone={t.status === "concluida" ? "green" : "slate"}>
                  {t.status === "concluida" ? "Concluída" : "Em Operações"}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!abrindo && vinculadas.length === 0 && (
        <p className="subtitle">
          {aberta ? "Nenhuma proposta pedida ainda." : "Nenhuma proposta foi pedida nesta negociação."}
        </p>
      )}

      {abrindo && (
        <form onSubmit={enviar} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <Campo
              className="sm:col-span-3"
              label="Serviço"
              hint={servicos.length === 0 ? <p className="hint mt-1">Nenhum produto do catálogo aponta para um serviço — configure em Configurações → Produtos.</p> : undefined}
            >
              <select
                className="field-input"
                value={serviceKey}
                onChange={(e) => {
                  setServiceKey(e.target.value);
                  setTipoDemanda(e.target.value ? (tipoSugeridoDoServico(e.target.value, "orcamento")?.nome ?? "") : "");
                }}
              >
                <option value="">—</option>
                {servicos.map((s) => <option key={s.key} value={s.key}>{s.nome}</option>)}
              </select>
            </Campo>
            <Campo className="sm:col-span-3" label="Tipo de demanda" hint={<p className="hint mt-1">Define a duração estimada e, com ela, a indicação de responsável.</p>}>
              <select className="field-input" value={tipoDemanda} onChange={(e) => setTipoDemanda(e.target.value)}>
                <option value="">—</option>
                {tiposDisponiveis.map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
              </select>
            </Campo>
            <Campo className="sm:col-span-3" label="Quem vai montar *">
              <select className="field-input" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">Escolha…</option>
                {usuarios.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
              </select>
            </Campo>
            <Campo className="sm:col-span-3" label="Prazo para a proposta">
              <input type="date" className="field-input" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
          </div>

          {/* A mesma indicação da tela de Nova tarefa: um componente só. */}
          <SugestaoResponsavel
            config={config}
            usuarios={usuarios}
            tarefas={tarefas}
            categoria={CATEGORIA}
            tipoDemanda={tipoDemanda}
            prioridade="media"
            estimativaMin={estimativaMin}
            responsavelEscolhido={responsavel}
            onEscolher={(email, prazoOperacional) => {
              setResponsavel(email);
              if (prazoOperacional) setPrazo(prazoOperacional);
            }}
          />

          <Campo label="Observação para quem vai montar">
            <textarea
              className="field-input min-h-[70px]"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="O que o cliente pediu, restrições, prazo combinado…"
            />
          </Campo>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAbrindo(false)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? "Pedindo…" : "Pedir proposta"}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}
