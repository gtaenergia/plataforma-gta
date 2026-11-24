"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Alert } from "@/components/ui";
import type { DadosProjeto } from "@/lib/engenharia/tipos";
import {
  condutoresPadrao,
  novoQuadro,
  protecaoPadrao,
  quadroVazio,
  type Circuito,
  type ConfigQuadro,
  type DadosQuadro,
  type Geral,
  type Quadro,
} from "@/lib/engenharia/quadro/tipos";
import { balancearFases, calcularQuadros } from "@/lib/engenharia/quadro/motor";
import { pendenciasQuadro, type EtapaQuadro } from "@/lib/engenharia/quadro/pendencias";
import { svgImpedancias, svgPaineis } from "@/lib/engenharia/quadro/diagramas";
import { gerarDxf } from "@/lib/engenharia/quadro/dxf";
import { fmtDataHora } from "@/lib/engenharia/formato";
import { AvisoResponsabilidade, CabecalhoProjeto, Dialogo, irParaCampo, SeloSalvo, Stepper, toast, Toasts, type EtapaDef } from "../comum";
import { useFerramenta } from "../useFerramenta";
import { EtapaConfig } from "./EtapaConfig";
import { EtapaCircuitos } from "./EtapaCircuitos";
import { EtapaChoques } from "./EtapaChoques";
import { EtapaResultadosQuadro } from "./EtapaResultadosQuadro";
import { FichaCircuito } from "./FichaCircuito";

const ROTULOS: Record<EtapaQuadro, string> = { config: "Configuração", circuitos: "Quadro de cargas", choques: "Proteção contra choques", resultados: "Resultados" };
const ORDEM: EtapaQuadro[] = ["config", "circuitos", "choques", "resultados"];

function normalizar(d: DadosQuadro | null): DadosQuadro {
  const base = quadroVazio();
  if (!d || !d.quadros?.length) return base;
  const quadros = d.quadros.map((q, i) => {
    const nq = novoQuadro(i + 1);
    return {
      ...nq,
      ...q,
      geral: { ...nq.geral, ...q.geral, protecao: { ...protecaoPadrao(), ...q.geral?.protecao }, cond: { ...nq.geral.cond, ...q.geral?.cond } },
      circuitos: (q.circuitos ?? []).map((c) => ({ ...c, protecao: { ...protecaoPadrao(), ...c.protecao }, cond: { ...condutoresPadrao(), ...c.cond } })),
    };
  });
  return {
    config: { ...base.config, ...d.config, trafo: { ...base.config.trafo, ...d.config?.trafo }, caboOrigem: { ...base.config.caboOrigem, ...d.config?.caboOrigem } },
    quadros,
    ativo: quadros.some((q) => q.id === d.ativo) ? d.ativo : quadros[0].id,
  };
}

export function QuadroCargas({ projetoId, dados, inicial, salvoEm }: { projetoId: string; dados: DadosProjeto; inicial: DadosQuadro | null; salvoEm: string }) {
  const f = useFerramenta<DadosQuadro>({ projetoId, chave: "quadro", inicial: normalizar(inicial), salvoEm });
  const { setValor } = f;
  const d = f.valor;
  const [etapa, setEtapa] = useState<EtapaQuadro>("config");
  const [ficha, setFicha] = useState<string | "geral" | null>(null);
  const [verPend, setVerPend] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  const res = useMemo(() => calcularQuadros(d), [d]);
  const pend = useMemo(() => pendenciasQuadro(d), [d]);
  const ativo = d.quadros.find((q) => q.id === d.ativo) ?? d.quadros[0];
  const resAtivo = res.quadros.find((q) => q.id === ativo.id)!;

  const setConfig = useCallback((p: Partial<ConfigQuadro>) => setValor((v) => ({ ...v, config: { ...v.config, ...p } })), [setValor]);
  const setQuadros = useCallback((fn: (q: Quadro[]) => Quadro[]) => setValor((v) => ({ ...v, quadros: fn(v.quadros) })), [setValor]);
  const setAtivo = useCallback((id: string) => setValor((v) => ({ ...v, ativo: id })), [setValor]);
  const setCircuito = (id: string, p: Partial<Circuito>) =>
    setQuadros((qs) => qs.map((q) => (q.id === ativo.id ? { ...q, circuitos: q.circuitos.map((c) => (c.id === id ? { ...c, ...p } : c)) } : q)));
  const setGeral = (p: Partial<Geral>) => setQuadros((qs) => qs.map((q) => (q.id === ativo.id ? { ...q, geral: { ...q.geral, ...p } } : q)));

  const st = (e: EtapaQuadro) => (pend.some((p) => p.etapa === e) ? "pendente" : "completa");
  const choquesPend = res.quadros.some((q) => q.resumo.choque.semDados > 0 || q.resumo.choque.falha > 0);
  const etapas: EtapaDef<EtapaQuadro>[] = [
    { id: "config", rotulo: ROTULOS.config, status: st("config") },
    { id: "circuitos", rotulo: ROTULOS.circuitos, status: st("circuitos") },
    { id: "choques", rotulo: ROTULOS.choques, status: choquesPend ? "pendente" : "completa" },
    { id: "resultados", rotulo: ROTULOS.resultados, status: "resultado", bloqueada: pend.length > 0 },
  ];
  const ir = (e: EtapaQuadro) => {
    if (e === "resultados" && pend.length) return setVerPend(true);
    setEtapa(e);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const idx = ORDEM.indexOf(etapa);

  function abrirCircuito(quadroId: string, circId: string | "geral") {
    if (quadroId !== d.ativo) setAtivo(quadroId);
    setFicha(circId);
  }

  function balancear() {
    const mapa = balancearFases(ativo, d.config.tensao);
    setQuadros((qs) => qs.map((q) => (q.id === ativo.id ? { ...q, circuitos: q.circuitos.map((c) => ({ ...c, fase: mapa[c.id] ?? c.fase })) } : q)));
    toast("Fases redistribuídas entre A, B e C.");
  }

  async function exportarExcel() {
    setGerando("excel");
    try {
      const r = await fetch("/api/engenharia/quadro/planilha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quadro: d, projeto: dados.nome }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao gerar a planilha.");
      const { baixarBlob, nomeArquivo } = await import("@/lib/engenharia/laudos/baixar");
      baixarBlob(await r.blob(), nomeArquivo(`Quadro de Cargas - ${dados.nome}`, "xlsx"));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao gerar a planilha.", "erro");
    } finally {
      setGerando(null);
    }
  }

  async function memorial(formato: "pdf" | "docx", quadroId: string | null) {
    setGerando(`memorial-${formato}`);
    try {
      const m = await import("@/lib/engenharia/laudos/baixar");
      await m.baixarMemorialQuadro(dados, d, quadroId, formato);
    } catch (e) {
      console.error(e);
      toast("Não foi possível gerar o memorial.", "erro");
    } finally {
      setGerando(null);
    }
  }

  async function diagramaPdf(tipo: "paineis" | "impedancias") {
    setGerando(`diag-${tipo}`);
    try {
      const g = tipo === "paineis" ? svgPaineis(res) : svgImpedancias(res);
      const m = await import("@/lib/engenharia/laudos/baixar");
      await m.baixarDiagramaPdf(dados, tipo === "paineis" ? "Diagrama de Painéis" : "Diagrama de Impedâncias", g.svg, g.largura, g.altura);
    } catch (e) {
      console.error(e);
      toast("Não foi possível gerar o PDF do diagrama.", "erro");
    } finally {
      setGerando(null);
    }
  }

  async function baixarDxf(op: { dps: boolean; vazios: boolean; balanceamento: boolean }) {
    const texto = gerarDxf(res, `${dados.nome} - Diagrama unifilar`, op);
    const { baixarBlob, nomeArquivo } = await import("@/lib/engenharia/laudos/baixar");
    baixarBlob(new Blob([texto], { type: "application/dxf" }), nomeArquivo(`Unifilar - ${dados.nome}`, "dxf"));
  }

  const circFicha = ficha && ficha !== "geral" ? ativo.circuitos.find((c) => c.id === ficha) ?? null : null;
  const resFicha = ficha === "geral" ? resAtivo.geral : circFicha ? resAtivo.circuitos.find((c) => c.id === circFicha.id) ?? null : null;

  return (
    <div>
      <CabecalhoProjeto projetoId={projetoId} dados={dados} ferramenta="Quadro de Cargas — NBR 5410" estado={<SeloSalvo estado={f.estado} salvoEm={f.salvoEm} onSalvar={f.salvar} />} />

      {f.rascunho && (
        <Alert tone="amber" className="mt-4" titulo="Há um rascunho não salvo.">
          Alterações de {fmtDataHora(f.rascunho.em)} ficaram só neste navegador.{" "}
          <button type="button" className="btn-link" onClick={f.recuperar}>
            Recuperar
          </button>{" "}
          ·{" "}
          <button type="button" className="btn-link" onClick={f.descartar}>
            Descartar
          </button>
        </Alert>
      )}

      <div className="mt-6">
        <Stepper etapas={etapas} atual={etapa} onIr={ir} />
      </div>

      <div className="mt-6">
        {etapa === "config" && <EtapaConfig cfg={d.config} set={setConfig} origem={res.origem} />}
        {etapa === "circuitos" && (
          <EtapaCircuitos
            quadros={d.quadros}
            ativo={ativo}
            setAtivo={setAtivo}
            setQuadros={setQuadros}
            resultado={resAtivo}
            onAbrir={(id) => setFicha(id)}
            onExportar={exportarExcel}
            onBalancear={balancear}
          />
        )}
        {etapa === "choques" && <EtapaChoques cfg={d.config} res={res} onAbrir={abrirCircuito} />}
        {etapa === "resultados" && (
          <EtapaResultadosQuadro
            res={res}
            quadros={d.quadros.map((q) => ({ id: q.id, nome: q.nome }))}
            gerando={gerando}
            onMemorial={memorial}
            onExcel={exportarExcel}
            onDxf={baixarDxf}
            onDiagramaPdf={diagramaPdf}
          />
        )}
      </div>

      <div className="mt-8 flex justify-between">
        <button type="button" className="btn-secondary" disabled={idx === 0} onClick={() => ir(ORDEM[idx - 1])}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        {idx < ORDEM.length - 1 && (
          <button type="button" className="btn-primary" onClick={() => ir(ORDEM[idx + 1])}>
            Avançar <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <AvisoResponsabilidade />

      {ficha && resFicha && (
        <FichaCircuito
          quadro={ativo}
          circuito={circFicha}
          geral={ficha === "geral" ? ativo.geral : null}
          r={resFicha}
          onCircuito={(p) => circFicha && setCircuito(circFicha.id, p)}
          onGeral={setGeral}
          onFechar={() => setFicha(null)}
        />
      )}

      <Dialogo aberto={verPend} titulo={`Faltam ${pend.length} ${pend.length === 1 ? "dado" : "dados"} para os resultados`} onFechar={() => setVerPend(false)}>
        <ul className="space-y-1.5">
          {pend.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                className="btn-link text-left"
                onClick={() => {
                  setVerPend(false);
                  if (p.quadroId && p.quadroId !== d.ativo) setAtivo(p.quadroId);
                  setEtapa(p.etapa);
                  if (p.circuitoId === "geral") setFicha("geral");
                  irParaCampo(p.campo);
                }}
              >
                <span className="badge badge-slate mr-2">{ROTULOS[p.etapa]}</span>
                {p.texto}
              </button>
            </li>
          ))}
        </ul>
      </Dialogo>
      <Toasts />
    </div>
  );
}
