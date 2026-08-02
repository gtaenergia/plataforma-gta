"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import { dimensaoDoPainel, simularTelhado, type Arranjo, type TelhadoResultado } from "@/services/solar/telhado";

/**
 * Quantos painéis cabem na água do telhado — com desenho em corte superior e
 * exportação em PNG para anexar à proposta ou mandar para o cliente.
 *
 * O desenho é feito em <canvas> puro: nenhuma dependência nova (o projeto já
 * tirou o `xlsx` para não arriscar o build) e o PNG sai do próprio navegador,
 * sem custo de servidor.
 */

const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Paleta do desenho — fixa e clara, porque o PNG vai para papel e para o cliente. */
const COR = {
  fundo: "#ffffff",
  telhado: "#f1f5f9",
  telhadoBorda: "#1a2f4a",
  util: "#f26522",
  painel: "#5b4fcf",
  painelBorda: "#ffffff",
  cota: "#475569",
  texto: "#1a2f4a",
  textoFraco: "#64748b",
};

interface Medidas {
  larguraM: string;
  comprimentoM: string;
  painelCompMm: string;
  painelLargMm: string;
  espacoPaineisMm: string;
  espacoFileirasMm: string;
  recuoMm: string;
}

const num = (s: string) => {
  const v = Number(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

// ------------------------------------------------------------------ desenho

/** Seta de cota. */
function seta(ctx: CanvasRenderingContext2D, x: number, y: number, dir: -1 | 1, horizontal: boolean) {
  const t = 5;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * t, y - t / 1.6);
    ctx.lineTo(x + dir * t, y + t / 1.6);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - t / 1.6, y + dir * t);
    ctx.lineTo(x + t / 1.6, y + dir * t);
  }
  ctx.closePath();
  ctx.fill();
}

/** Linha de cota com texto no meio. */
function cota(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  texto: string,
  horizontal: boolean,
) {
  ctx.strokeStyle = COR.cota;
  ctx.fillStyle = COR.cota;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  seta(ctx, a.x, a.y, 1, horizontal);
  seta(ctx, b.x, b.y, -1, horizontal);

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const larg = ctx.measureText(texto).width + 10;

  ctx.save();
  ctx.translate(mx, my);
  if (!horizontal) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(-larg / 2, -9, larg, 18);
  ctx.fillStyle = COR.cota;
  ctx.fillText(texto, 0, 0);
  ctx.restore();
}

function desenhar(
  canvas: HTMLCanvasElement,
  r: TelhadoResultado,
  arranjo: Arranjo | null,
  larguraM: number,
  comprimentoM: number,
  recuoM: number,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 1000;
  const H = 660;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);

  if (larguraM <= 0 || comprimentoM <= 0) return;

  // Área de desenho, deixando fora as cotas e o cabeçalho.
  const mE = 78, mD = 40, mT = 76, mB = 74;
  const dispW = W - mE - mD;
  const dispH = H - mT - mB;
  const escala = Math.min(dispW / larguraM, dispH / comprimentoM);
  const telW = larguraM * escala;
  const telH = comprimentoM * escala;
  const x0 = mE + (dispW - telW) / 2;
  const y0 = mT + (dispH - telH) / 2;

  // Cabeçalho
  ctx.fillStyle = COR.texto;
  ctx.font = "700 19px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Ocupação do telhado — vista superior", mE, 32);
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.fillStyle = COR.textoFraco;
  const resumo = arranjo
    ? `${arranjo.total} módulos · ${arranjo.colunas} por fileira × ${arranjo.fileiras} fileiras · ${arranjo.orientacao}`
    : "Nenhum módulo cabe com estas medidas";
  ctx.fillText(resumo, mE, 52);

  // Telhado
  ctx.fillStyle = COR.telhado;
  ctx.fillRect(x0, y0, telW, telH);
  ctx.strokeStyle = COR.telhadoBorda;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, telW, telH);

  // Área útil (depois do recuo)
  const rec = recuoM * escala;
  const uW = r.utilLarguraM * escala;
  const uH = r.utilComprimentoM * escala;
  if (uW > 0 && uH > 0) {
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = COR.util;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + rec, y0 + rec, uW, uH);
    ctx.restore();
  }

  // Módulos, centralizados na área útil
  if (arranjo && arranjo.total > 0) {
    const pw = arranjo.painelLarguraM * escala;
    const ph = arranjo.painelComprimentoM * escala;
    const gx = arranjo.colunas > 1 ? (arranjo.ocupaLarguraM * escala - arranjo.colunas * pw) / (arranjo.colunas - 1) : 0;
    const gy = arranjo.fileiras > 1 ? (arranjo.ocupaComprimentoM * escala - arranjo.fileiras * ph) / (arranjo.fileiras - 1) : 0;
    const ix = x0 + rec + (uW - arranjo.ocupaLarguraM * escala) / 2;
    const iy = y0 + rec + (uH - arranjo.ocupaComprimentoM * escala) / 2;

    ctx.fillStyle = COR.painel;
    ctx.strokeStyle = COR.painelBorda;
    ctx.lineWidth = 1;
    for (let f = 0; f < arranjo.fileiras; f++) {
      for (let c = 0; c < arranjo.colunas; c++) {
        const px = ix + c * (pw + gx);
        const py = iy + f * (ph + gy);
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeRect(px, py, pw, ph);
      }
    }
  }

  // Cotas: largura embaixo, comprimento à esquerda
  cota(ctx, { x: x0, y: y0 + telH + 34 }, { x: x0 + telW, y: y0 + telH + 34 }, `${nf(larguraM)} m`, true);
  cota(ctx, { x: x0 - 34, y: y0 }, { x: x0 - 34, y: y0 + telH }, `${nf(comprimentoM)} m`, false);

  // Cota da área útil, por dentro
  if (uW > 0) {
    cota(ctx, { x: x0 + rec, y: y0 + rec - 14 }, { x: x0 + rec + uW, y: y0 + rec - 14 }, `útil ${nf(r.utilLarguraM)} m`, true);
  }

  // Legenda
  const ly = H - 26;
  ctx.font = "400 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = COR.painel;
  ctx.fillRect(mE, ly - 9, 14, 10);
  ctx.fillStyle = COR.textoFraco;
  ctx.fillText("módulo", mE + 20, ly);
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = COR.util;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mE + 84, ly - 4);
  ctx.lineTo(mE + 100, ly - 4);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COR.textoFraco;
  ctx.fillText(`área útil (recuo de ${nf(recuoM * 1000, 0)} mm)`, mE + 106, ly);
}

// ------------------------------------------------------------------ tela

export function TelhadoSimulador({ potenciaPainel, nPaineisNecessarios }: {
  potenciaPainel: number;
  /** Quantos o dimensionamento pediu — para confrontar com o que cabe. */
  nPaineisNecessarios: number;
}) {
  const padrao = dimensaoDoPainel(potenciaPainel);
  const [m, setM] = useState<Medidas>({
    larguraM: "",
    comprimentoM: "",
    painelCompMm: String(padrao.comprimentoMm),
    painelLargMm: String(padrao.larguraMm),
    espacoPaineisMm: "20",
    espacoFileirasMm: "20",
    recuoMm: "300",
  });
  const [orientacaoManual, setOrientacaoManual] = useState<"auto" | "retrato" | "paisagem">("auto");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const set = <K extends keyof Medidas>(k: K, v: string) => setM((x) => ({ ...x, [k]: v }));

  // Trocar a potência do painel reajusta as medidas — a menos que já tenham
  // sido editadas à mão, caso em que sobrescrever apagaria o que foi digitado.
  const tocado = useRef(false);
  useEffect(() => {
    if (tocado.current) return;
    const d = dimensaoDoPainel(potenciaPainel);
    setM((x) => ({ ...x, painelCompMm: String(d.comprimentoMm), painelLargMm: String(d.larguraMm) }));
  }, [potenciaPainel]);

  const larguraM = num(m.larguraM);
  const comprimentoM = num(m.comprimentoM);
  const recuoM = num(m.recuoMm) / 1000;

  const resultado = useMemo(
    () =>
      simularTelhado({
        larguraM,
        comprimentoM,
        painel: { comprimentoMm: num(m.painelCompMm), larguraMm: num(m.painelLargMm) },
        espacoEntrePaineisMm: num(m.espacoPaineisMm),
        espacoEntreFileirasMm: num(m.espacoFileirasMm),
        recuoBordaMm: num(m.recuoMm),
      }),
    [larguraM, comprimentoM, m.painelCompMm, m.painelLargMm, m.espacoPaineisMm, m.espacoFileirasMm, m.recuoMm],
  );

  const arranjo =
    orientacaoManual === "auto"
      ? resultado.melhor
      : resultado.arranjos.find((a) => a.orientacao === orientacaoManual) ?? null;

  useEffect(() => {
    if (canvasRef.current) desenhar(canvasRef.current, resultado, arranjo, larguraM, comprimentoM, recuoM);
  }, [resultado, arranjo, larguraM, comprimentoM, recuoM]);

  function baixarPng() {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `telhado-${nf(larguraM)}x${nf(comprimentoM)}m-${arranjo?.total ?? 0}-modulos.png`.replace(/,/g, "");
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const temMedidas = larguraM > 0 && comprimentoM > 0;
  const cabem = arranjo?.total ?? 0;
  const falta = nPaineisNecessarios - cabem;
  const campo = "field-input";

  return (
    <SectionCard
      title="Cabe no telhado?"
      subtitle="Medidas de UMA água. Telhado recortado: simule uma água de cada vez e some."
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        <div>
          <label className="field-label" htmlFor="tel-larg">Largura da água (m)</label>
          <input id="tel-larg" className={campo} inputMode="decimal" placeholder="Ex.: 10" value={m.larguraM} onChange={(e) => set("larguraM", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-comp">Comprimento (m)</label>
          <input id="tel-comp" className={campo} inputMode="decimal" placeholder="Ex.: 8" value={m.comprimentoM} onChange={(e) => set("comprimentoM", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-recuo">Recuo das bordas (mm)</label>
          <input id="tel-recuo" className={campo} inputMode="numeric" value={m.recuoMm} onChange={(e) => set("recuoMm", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-orient">Orientação</label>
          <select id="tel-orient" className={campo} value={orientacaoManual} onChange={(e) => setOrientacaoManual(e.target.value as typeof orientacaoManual)}>
            <option value="auto">A que couber mais</option>
            <option value="retrato">Retrato</option>
            <option value="paisagem">Paisagem</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="tel-pc">Módulo — comprimento (mm)</label>
          <input id="tel-pc" className={campo} inputMode="numeric" value={m.painelCompMm} onChange={(e) => { tocado.current = true; set("painelCompMm", e.target.value); }} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-pl">Módulo — largura (mm)</label>
          <input id="tel-pl" className={campo} inputMode="numeric" value={m.painelLargMm} onChange={(e) => { tocado.current = true; set("painelLargMm", e.target.value); }} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-ep">Folga entre módulos (mm)</label>
          <input id="tel-ep" className={campo} inputMode="numeric" value={m.espacoPaineisMm} onChange={(e) => set("espacoPaineisMm", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="tel-ef">Folga entre fileiras (mm)</label>
          <input id="tel-ef" className={campo} inputMode="numeric" value={m.espacoFileirasMm} onChange={(e) => set("espacoFileirasMm", e.target.value)} />
        </div>
      </div>

      {!temMedidas ? (
        <p className="mt-4 subtitle">Informe a largura e o comprimento da água para ver quantos módulos cabem.</p>
      ) : (
        <>
          <KpiGrid className="mt-5">
            <Kpi label="Cabem" value={`${cabem} módulos`} destaque />
            <Kpi label="Dimensionamento pede" value={`${nPaineisNecessarios} módulos`} />
            <Kpi
              label={falta > 0 ? "Faltam" : "Sobra para"
              }
              value={falta > 0 ? `${falta} módulos` : `${-falta} módulos`}
              tone={falta > 0 ? "red" : "green"}
            />
            <Kpi label="Área útil" value={`${nf(resultado.areaUtilM2, 1)} m²`} />
          </KpiGrid>

          {falta > 0 && nPaineisNecessarios > 0 && (
            <Alert tone="amber" titulo="O telhado não comporta o sistema dimensionado." className="mt-4">
              Cabem {cabem} dos {nPaineisNecessarios} módulos necessários. Use outra água do telhado, reduza o
              recuo se a norma local permitir, ou considere um módulo de maior potência para gerar o mesmo com
              menos peças.
            </Alert>
          )}

          {resultado.melhor && orientacaoManual === "auto" && (
            <p className="hint mt-3">
              {resultado.arranjos.map((a) => `${a.orientacao}: ${a.total}`).join(" · ")} — o desenho usa a que couber mais.
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700">
            <canvas ref={canvasRef} className="block" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" onClick={baixarPng} disabled={!temMedidas}>
              Baixar PNG
            </button>
            <span className="hint">
              Estimativa geométrica: não considera chaminé, caixa d&apos;água, platibanda nem sombreamento.
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
