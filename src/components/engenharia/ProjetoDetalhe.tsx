"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CloudLightning, LayoutGrid, Trash2 } from "lucide-react";
import { Badge, SectionCard } from "@/components/ui";
import type { ProjetoEng } from "@/lib/engenharia/tipos";
import { calcularRisco } from "@/lib/engenharia/risco/motor";
import { pendenciasRisco } from "@/lib/engenharia/risco/pendencias";
import { soEntrada } from "@/lib/engenharia/risco/tipos";
import { calcularQuadros } from "@/lib/engenharia/quadro/motor";
import { fmtDataHora } from "@/lib/engenharia/formato";
import { useAvisoNaoSalvo } from "@/components/useAvisoNaoSalvo";
import { Dialogo, toast, Toasts } from "./comum";
import { FormProjeto } from "./FormProjeto";

export function ProjetoDetalhe({ projeto }: { projeto: ProjetoEng }) {
  const router = useRouter();
  const [dados, setDados] = useState(projeto.dados);
  const [salvos, setSalvos] = useState(JSON.stringify(projeto.dados));
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const sujo = JSON.stringify(dados) !== salvos;
  useAvisoNaoSalvo(sujo);

  const risco = useMemo(() => {
    if (!projeto.risco) return null;
    const pend = pendenciasRisco(projeto.risco);
    if (pend.length) return { tom: "amber" as const, texto: `${pend.length} ${pend.length === 1 ? "pendência" : "pendências"}` };
    const r = calcularRisco(soEntrada(projeto.risco));
    return r.toleravel ? { tom: "green" as const, texto: "Riscos dentro do tolerável" } : { tom: "red" as const, texto: "Proteção necessária" };
  }, [projeto.risco]);

  const quadro = useMemo(() => {
    if (!projeto.quadro) return null;
    const r = calcularQuadros(projeto.quadro);
    const circ = r.quadros.reduce((s, q) => s + q.circuitos.length, 0);
    const falhas = r.quadros.reduce((s, q) => s + q.resumo.falhas, 0);
    return {
      tom: falhas ? ("red" as const) : ("green" as const),
      texto: `${r.quadros.length} ${r.quadros.length === 1 ? "quadro" : "quadros"} · ${circ} circuitos${falhas ? ` · ${falhas} com critério não atendido` : ""}`,
    };
  }, [projeto.quadro]);

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch(`/api/engenharia/projetos/${projeto.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dados }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao salvar.");
      setSalvos(JSON.stringify(dados));
      toast("Dados do projeto salvos.");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    const res = await fetch(`/api/engenharia/projetos/${projeto.id}`, { method: "DELETE" });
    if (!res.ok) return toast("Não foi possível excluir.", "erro");
    router.push("/engenharia");
  }

  return (
    <div>
      <Link href="/engenharia" className="btn-ghost -ml-2.5 mb-1">
        <ArrowLeft className="h-4 w-4" /> Projetos de engenharia
      </Link>
      <h1 className="page-title">{projeto.dados.nome || "Projeto"}</h1>
      <p className="mt-1 subtitle">
        Criado por {projeto.criadoPor} · atualizado em {fmtDataHora(projeto.atualizadoEm)}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <FerramentaCard
          href={`/engenharia/${projeto.id}/risco`}
          icone={<CloudLightning className="h-6 w-6" />}
          titulo="Análise de Risco"
          norma="ABNT NBR 5419-2:2026"
          descricao="Risco de descargas atmosféricas (R1, R3, R4 e frequência de danos), com requisitos de SPDA e DPS e laudo em PDF/Word."
          status={risco}
        />
        <FerramentaCard
          href={`/engenharia/${projeto.id}/quadro`}
          icone={<LayoutGrid className="h-6 w-6" />}
          titulo="Quadro de Cargas"
          norma="ABNT NBR 5410:2004"
          descricao="Circuitos, demanda, disjuntores, cabos, queda de tensão, curto-circuito e proteção contra choques, com memorial de cálculo."
          status={quadro}
        />
      </div>

      <SectionCard
        className="mt-6"
        title="Dados do projeto e responsável técnico"
        actions={
          <button type="button" className="btn-primary" onClick={salvar} disabled={!sujo || salvando}>
            {salvando ? "Salvando…" : sujo ? "Salvar dados" : "Salvo"}
          </button>
        }
      >
        <FormProjeto dados={dados} onChange={setDados} />
      </SectionCard>

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-danger" onClick={() => setExcluir(true)}>
          <Trash2 className="h-4 w-4" /> Excluir projeto
        </button>
      </div>

      <Dialogo aberto={excluir} titulo="Excluir projeto?" onFechar={() => setExcluir(false)}>
        <p className="text-sm">
          A análise de risco e os quadros de cargas de <strong>{projeto.dados.nome}</strong> serão apagados de vez. Laudos já baixados não são afetados.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setExcluir(false)}>
            Cancelar
          </button>
          <button type="button" className="btn-danger" onClick={confirmarExclusao}>
            Excluir
          </button>
        </div>
      </Dialogo>
      <Toasts />
    </div>
  );
}

function FerramentaCard({
  href,
  icone,
  titulo,
  norma,
  descricao,
  status,
}: {
  href: string;
  icone: React.ReactNode;
  titulo: string;
  norma: string;
  descricao: string;
  status: { tom: "green" | "amber" | "red"; texto: string } | null;
}) {
  return (
    <Link href={href} className="group card flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-gta-indigo hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex rounded-lg bg-gta-indigo/10 p-2.5 text-gta-indigo dark:bg-gta-indigo/20 dark:text-indigo-300">{icone}</span>
        {status ? <Badge tone={status.tom} dot>{status.texto}</Badge> : <Badge tone="slate">Não iniciada</Badge>}
      </div>
      <div className="mt-3 font-semibold text-gta-navy group-hover:text-gta-indigo dark:text-slate-100">{titulo}</div>
      <div className="hint">{norma}</div>
      <p className="mt-2 flex-1 subtitle">{descricao}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gta-indigo dark:text-indigo-300">
        {status ? "Abrir" : "Começar"} <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
