"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileText, Maximize2, Minus, PenTool, Plus, Sheet } from "lucide-react";
import { SectionCard, Segmented } from "@/components/ui";
import type { ResultadoQuadros } from "@/lib/engenharia/quadro/motor";
import { svgImpedancias, svgPaineis } from "@/lib/engenharia/quadro/diagramas";
import { fmtNum } from "@/lib/engenharia/formato";
import { Dialogo } from "../comum";

function Visor({ svg, largura, altura }: { svg: string; largura: number; altura: number }) {
  const [zoom, setZoom] = useState(1);
  const caixa = useRef<HTMLDivElement>(null);
  const arraste = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const ajustar = () => {
    const w = caixa.current?.clientWidth ?? largura;
    setZoom(Math.min(1.5, Math.max(0.3, (w - 16) / largura)));
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <button type="button" className="icon-btn icon-btn-neutro" aria-label="Diminuir" onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-14 text-center font-mono text-xs">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-btn icon-btn-neutro" aria-label="Aumentar" onClick={() => setZoom((z) => Math.min(3, z + 0.15))}>
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn icon-btn-neutro" aria-label="Ajustar à largura" onClick={ajustar}>
          <Maximize2 className="h-4 w-4" />
        </button>
        <span className="ml-2 hint">Arraste para mover.</span>
      </div>
      <div
        ref={caixa}
        className="h-[560px] cursor-grab overflow-auto rounded-lg border border-slate-200 bg-white active:cursor-grabbing dark:border-slate-700"
        onMouseDown={(e) => {
          const el = caixa.current!;
          arraste.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
        }}
        onMouseMove={(e) => {
          const a = arraste.current;
          if (!a || !caixa.current) return;
          caixa.current.scrollLeft = a.l - (e.clientX - a.x);
          caixa.current.scrollTop = a.t - (e.clientY - a.y);
        }}
        onMouseUp={() => (arraste.current = null)}
        onMouseLeave={() => (arraste.current = null)}
      >
        {/* SVG gerado pela própria plataforma (textos escapados). */}
        <div style={{ width: largura * zoom, height: altura * zoom }} dangerouslySetInnerHTML={{ __html: svg.replace(/<svg ([^>]*?)width="[\d.]+" height="[\d.]+"/, `<svg $1width="${largura * zoom}" height="${altura * zoom}"`) }} />
      </div>
    </div>
  );
}

export function EtapaResultadosQuadro({
  res,
  quadros,
  gerando,
  onMemorial,
  onExcel,
  onDxf,
  onDiagramaPdf,
}: {
  res: ResultadoQuadros;
  quadros: { id: string; nome: string }[];
  gerando: string | null;
  onMemorial: (formato: "pdf" | "docx", quadroId: string | null) => void;
  onExcel: () => void;
  onDxf: (op: { dps: boolean; vazios: boolean; balanceamento: boolean }) => void;
  onDiagramaPdf: (tipo: "paineis" | "impedancias") => void;
}) {
  const [aba, setAba] = useState<"paineis" | "impedancias" | "downloads">("paineis");
  const [alvo, setAlvo] = useState<string>("todos");
  const [dxf, setDxf] = useState(false);
  const [op, setOp] = useState({ dps: true, vazios: false, balanceamento: true });
  const paineis = useMemo(() => svgPaineis(res), [res]);
  const imped = useMemo(() => svgImpedancias(res), [res]);
  const falhas = res.quadros.reduce((s, q) => s + q.resumo.falhas, 0);

  return (
    <div className="space-y-6">
      <div className={`rounded-xl p-4 text-white ${falhas ? "bg-red-700" : "bg-green-700"}`}>
        <div className="text-lg font-bold">{falhas ? `${falhas} ${falhas === 1 ? "trecho não atende" : "trechos não atendem"} a algum critério` : "Todos os critérios atendidos"}</div>
        <div className="text-sm opacity-90">
          {res.quadros.map((q) => `${q.nome}: ${fmtNum(q.potencias.Sdem / 1000, 2)} kVA, geral ${q.geral.In} A`).join(" · ")}
        </div>
      </div>

      <Segmented
        value={aba}
        onChange={setAba}
        options={[
          { value: "paineis", label: "Diagrama de painéis" },
          { value: "impedancias", label: "Diagrama de impedâncias" },
          { value: "downloads", label: "Downloads" },
        ]}
      />

      {aba === "paineis" && (
        <SectionCard title="Diagrama de painéis" subtitle="Da origem ao disjuntor geral, ao quadro e aos circuitos. Blocos com borda vermelha não atendem a algum critério.">
          <Visor {...paineis} />
        </SectionCard>
      )}
      {aba === "impedancias" && (
        <SectionCard title="Diagrama de impedâncias" subtitle="R + jX por trecho, da fonte (Z_Q) ao fim de cada circuito: máximo (define o Icu), mínimo (disparo magnético) e Zs (choques).">
          <Visor {...imped} />
        </SectionCard>
      )}
      {aba === "downloads" && (
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Memorial de cálculo" subtitle="Capa, sumário, metodologia com equações numeradas, resultados e anexos em paisagem.">
            <label htmlFor="memorial-alvo" className="field-label">
              Quadros incluídos
            </label>
            <select id="memorial-alvo" className="field-input mb-3" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
              <option value="todos">Todos os quadros</option>
              {quadros.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={gerando != null} onClick={() => onMemorial("pdf", alvo === "todos" ? null : alvo)}>
                <Download className="h-4 w-4" /> {gerando === "memorial-pdf" ? "Gerando…" : "PDF"}
              </button>
              <button type="button" className="btn-secondary" disabled={gerando != null} onClick={() => onMemorial("docx", alvo === "todos" ? null : alvo)}>
                <FileText className="h-4 w-4" /> {gerando === "memorial-docx" ? "Gerando…" : "Word"}
              </button>
            </div>
          </SectionCard>
          <SectionCard title="Diagrama unifilar (DXF)" subtitle="Todos os quadros em cascata, para abrir no CAD.">
            <button type="button" className="btn-secondary" onClick={() => setDxf(true)}>
              <PenTool className="h-4 w-4" /> Baixar DXF
            </button>
          </SectionCard>
          <SectionCard title="Planilha (Excel)" subtitle="Quadro de circuitos com cabos, proteções e resultados — uma aba por quadro.">
            <button type="button" className="btn-secondary" disabled={gerando != null} onClick={onExcel}>
              <Sheet className="h-4 w-4" /> {gerando === "excel" ? "Gerando…" : "Baixar .xlsx"}
            </button>
          </SectionCard>
          <SectionCard title="Diagramas em PDF" subtitle="Folha A3 horizontal.">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" disabled={gerando != null} onClick={() => onDiagramaPdf("paineis")}>
                <Download className="h-4 w-4" /> Painéis
              </button>
              <button type="button" className="btn-secondary" disabled={gerando != null} onClick={() => onDiagramaPdf("impedancias")}>
                <Download className="h-4 w-4" /> Impedâncias
              </button>
            </div>
          </SectionCard>
        </div>
      )}

      <Dialogo aberto={dxf} titulo="Opções do diagrama unifilar" onFechar={() => setDxf(false)}>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={op.dps} onChange={(e) => setOp({ ...op, dps: e.target.checked })} /> Incluir DPS nos barramentos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={op.vazios} onChange={(e) => setOp({ ...op, vazios: e.target.checked })} /> Incluir circuitos vazios e reservas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={op.balanceamento} onChange={(e) => setOp({ ...op, balanceamento: e.target.checked })} /> Indicar fases e balanceamento
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setDxf(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setDxf(false);
              onDxf(op);
            }}
          >
            Baixar DXF
          </button>
        </div>
      </Dialogo>
    </div>
  );
}
