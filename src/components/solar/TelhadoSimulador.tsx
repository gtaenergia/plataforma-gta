"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Kpi, KpiGrid, SectionCard } from "@/components/ui";
import { dimensaoDoPainel, simularTelhado, textoParaProposta, type Arranjo, type TelhadoInput, type TelhadoResultado } from "@/services/solar/telhado";

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

/** Dimensões lógicas do desenho (o canvas é escalado pelo devicePixelRatio). */
const W = 1100;
const H = 830;
/** Respiro mínimo entre o rótulo de uma chamada e a borda da imagem. */
const MARGEM_ROTULO = 8;
/** Distância entre o fim da linha de indicação e o começo do texto. */
const FOLGA_ROTULO = 5;

/**
 * Linha de indicação para cota pequena demais para caber no desenho.
 *
 * Recebe o caminho inteiro porque a chamada NÃO pode cruzar a geometria que
 * não está indicando — um traço por cima dos módulos lê como se o módulo
 * estivesse partido. As folgas são canais vazios entre módulos, então o
 * primeiro trecho corre dentro do próprio vão até sair do arranjo.
 */
function chamada(
  ctx: CanvasRenderingContext2D,
  caminho: { x: number; y: number }[],
  texto: string,
  alinhamento: CanvasTextAlign = "left",
) {
  const inicio = caminho[0];
  ctx.font = "600 12px system-ui, sans-serif";

  /*
   * O fim do caminho é onde o RÓTULO começa, e ele era posicionado a partir da
   * borda do telhado. Num telhado largo isso jogava o texto para fora da
   * imagem: com 20 m de água o "folga entre módulos 20 mm" era cortado no meio.
   * Aqui o ponto final recua o quanto for preciso para o texto caber — quem
   * manda é a largura medida do texto, não uma distância fixa que só funciona
   * em alguns telhados.
   */
  const larguraTexto = ctx.measureText(texto).width;
  const alvo = caminho[caminho.length - 1];
  const fim = {
    ...alvo,
    x:
      alinhamento === "right"
        ? Math.max(alvo.x, MARGEM_ROTULO + larguraTexto + FOLGA_ROTULO)
        : Math.min(alvo.x, W - MARGEM_ROTULO - larguraTexto - FOLGA_ROTULO),
  };
  caminho = [...caminho.slice(0, -1), fim];

  ctx.strokeStyle = COR.cota;
  ctx.fillStyle = COR.cota;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(inicio.x, inicio.y);
  for (const p of caminho.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  // Ponto pequeno de propósito: o vão que ele indica tem cerca de 1 px nesta
  // escala, e um marcador maior invade os módulos vizinhos.
  ctx.beginPath();
  ctx.arc(inicio.x, inicio.y, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = alinhamento;
  ctx.textBaseline = "middle";
  ctx.fillText(texto, fim.x + (alinhamento === "right" ? -FOLGA_ROTULO : FOLGA_ROTULO), fim.y);
}

/** Quadro técnico: as cotas que não cabem no desenho ficam tabeladas aqui. */
function quadro(ctx: CanvasRenderingContext2D, x: number, y: number, larg: number, linhas: [string, string][]) {
  const alturaLinha = 22;
  const alt = linhas.length * alturaLinha + 30;

  ctx.strokeStyle = COR.telhadoBorda;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, larg, alt);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(x, y, larg, 26);
  ctx.strokeRect(x, y, larg, 26);

  ctx.fillStyle = COR.texto;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("ESPECIFICAÇÕES", x + 12, y + 13);

  linhas.forEach(([rotulo, valor], idx) => {
    const ly = y + 26 + idx * alturaLinha + alturaLinha / 2;
    ctx.font = "400 12px system-ui, sans-serif";
    ctx.fillStyle = COR.textoFraco;
    ctx.textAlign = "left";
    ctx.fillText(rotulo, x + 12, ly);
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillStyle = COR.texto;
    ctx.textAlign = "right";
    ctx.fillText(valor, x + larg - 12, ly);
    if (idx > 0) {
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(x + 1, ly - alturaLinha / 2);
      ctx.lineTo(x + larg - 1, ly - alturaLinha / 2);
      ctx.stroke();
    }
  });
  return alt;
}

interface DesenhoInput {
  potenciaPainelW: number;
  larguraM: number;
  comprimentoM: number;
  recuoMm: number;
  folgaModulosMm: number;
  folgaFileirasMm: number;
  painelCompMm: number;
  painelLargMm: number;
}

function desenhar(canvas: HTMLCanvasElement, r: TelhadoResultado, arranjo: Arranjo | null, i: DesenhoInput) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);

  if (i.larguraM <= 0 || i.comprimentoM <= 0) return;

  const mE = 96, mD = 96, mT = 100;
  const yFim = 520;
  const dispW = W - mE - mD;
  const dispH = yFim - mT;
  const escala = Math.min(dispW / i.larguraM, dispH / i.comprimentoM);
  const telW = i.larguraM * escala;
  const telH = i.comprimentoM * escala;
  const x0 = mE + (dispW - telW) / 2;
  const y0 = mT + (dispH - telH) / 2;

  // Cabeçalho
  ctx.fillStyle = COR.texto;
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Ocupação do telhado — vista superior", mE, 34);
  ctx.font = "400 13px system-ui, sans-serif";
  ctx.fillStyle = COR.textoFraco;
  ctx.fillText(
    arranjo
      ? `${arranjo.total} módulos · ${arranjo.colunas} por fileira × ${arranjo.fileiras} fileiras · orientação ${arranjo.orientacao}`
      : "Nenhum módulo comportado com estas medidas",
    mE,
    56,
  );

  // Telhado e área útil
  ctx.fillStyle = COR.telhado;
  ctx.fillRect(x0, y0, telW, telH);
  ctx.strokeStyle = COR.telhadoBorda;
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, telW, telH);

  const rec = (i.recuoMm / 1000) * escala;
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

  // Módulos
  let px0 = 0, py0 = 0, pw = 0, ph = 0, gx = 0, gy = 0;
  if (arranjo && arranjo.total > 0) {
    pw = arranjo.painelLarguraM * escala;
    ph = arranjo.painelComprimentoM * escala;
    gx = arranjo.colunas > 1 ? (arranjo.ocupaLarguraM * escala - arranjo.colunas * pw) / (arranjo.colunas - 1) : 0;
    gy = arranjo.fileiras > 1 ? (arranjo.ocupaComprimentoM * escala - arranjo.fileiras * ph) / (arranjo.fileiras - 1) : 0;
    px0 = x0 + rec + (uW - arranjo.ocupaLarguraM * escala) / 2;
    py0 = y0 + rec + (uH - arranjo.ocupaComprimentoM * escala) / 2;

    ctx.fillStyle = COR.painel;
    ctx.strokeStyle = COR.painelBorda;
    ctx.lineWidth = 1;
    for (let f = 0; f < arranjo.fileiras; f++) {
      for (let c = 0; c < arranjo.colunas; c++) {
        ctx.fillRect(px0 + c * (pw + gx), py0 + f * (ph + gy), pw, ph);
        ctx.strokeRect(px0 + c * (pw + gx), py0 + f * (ph + gy), pw, ph);
      }
    }
  }

  // Cotas principais
  cota(ctx, { x: x0, y: y0 + telH + 36 }, { x: x0 + telW, y: y0 + telH + 36 }, `${nf(i.larguraM)} m`, true);
  cota(ctx, { x: x0 - 36, y: y0 }, { x: x0 - 36, y: y0 + telH }, `${nf(i.comprimentoM)} m`, false);
  if (uW > 0) {
    cota(ctx, { x: x0 + rec, y: y0 + rec - 15 }, { x: x0 + rec + uW, y: y0 + rec - 15 }, `útil ${nf(r.utilLarguraM)} m`, true);
    cota(ctx, { x: x0 + telW + 34, y: y0 + rec }, { x: x0 + telW + 34, y: y0 + rec + uH }, `útil ${nf(r.utilComprimentoM)} m`, false);
  }

  // Recuo — cota curta no canto superior esquerdo
  if (rec > 3) {
    cota(ctx, { x: x0, y: y0 + rec / 2 }, { x: x0 + rec, y: y0 + rec / 2 }, `${nf(i.recuoMm, 0)}`, true);
  }

  // Chamadas para as folgas: pequenas demais na escala do telhado, então
  // apontam para o vão real e o valor vai fora do desenho.
  if (arranjo && arranjo.colunas > 1) {
    // Vão vertical entre a 1ª e a 2ª coluna: sobe DENTRO do vão até sair do
    // arranjo, e só então dobra para o rótulo.
    const xVao = px0 + pw + gx / 2;
    const yVao = py0 + ph / 2;
    chamada(
      ctx,
      [{ x: xVao, y: yVao }, { x: xVao, y: y0 - 12 }, { x: x0 + telW + 40, y: y0 - 30 }],
      `folga entre módulos ${nf(i.folgaModulosMm, 0)} mm`,
    );
  }
  if (arranjo && arranjo.fileiras > 1) {
    // Vão horizontal entre a 1ª e a 2ª fileira: sai pela esquerda, pelo vão.
    const xVao = px0 + pw / 2;
    const yVao = py0 + ph + gy / 2;
    chamada(
      ctx,
      [{ x: xVao, y: yVao }, { x: x0 - 12, y: yVao }, { x: x0 - 20, y: y0 + telH + 62 }],
      `folga entre fileiras ${nf(i.folgaFileirasMm, 0)} mm`,
    );
  }

  // Quadro técnico
  const linhas: [string, string][] = [
    ["Módulo (C × L)", `${nf(i.painelCompMm, 0)} × ${nf(i.painelLargMm, 0)} mm`],
    ["Orientação", arranjo ? arranjo.orientacao.charAt(0).toUpperCase() + arranjo.orientacao.slice(1) : "—"],
    ["Disposição", arranjo ? `${arranjo.colunas} por fileira × ${arranjo.fileiras} fileiras` : "—"],
    ["Folga entre módulos", `${nf(i.folgaModulosMm, 0)} mm`],
    ["Folga entre fileiras", `${nf(i.folgaFileirasMm, 0)} mm`],
    ["Recuo das bordas", `${nf(i.recuoMm, 0)} mm`],
  ];
  const linhas2: [string, string][] = [
    ["Água do telhado", `${nf(i.larguraM)} × ${nf(i.comprimentoM)} m`],
    ["Área do telhado", `${nf(r.areaTelhadoM2, 2)} m²`],
    ["Área útil", `${nf(r.areaUtilM2, 2)} m²`],
    ["Ocupação", `${nf(i.larguraM * i.comprimentoM > 0 ? ((arranjo?.total ?? 0) * (i.painelCompMm / 1000) * (i.painelLargMm / 1000) * 100) / r.areaTelhadoM2 : 0, 1)} %`],
    ["Total de módulos", `${arranjo?.total ?? 0}`],
    ["Potência do arranjo", arranjo ? `${nf((arranjo.total * i.potenciaPainelW) / 1000, 2)} kWp` : "—"],
  ];
  const yQ = 606;
  const largQ = (W - mE - mD - 24) / 2;
  quadro(ctx, mE, yQ, largQ, linhas);
  quadro(ctx, mE + largQ + 24, yQ, largQ, linhas2);

  // Legenda
  const ly = yQ - 18;
  ctx.font = "400 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.painel;
  ctx.fillRect(mE, ly - 9, 14, 10);
  ctx.fillStyle = COR.textoFraco;
  ctx.fillText("módulo fotovoltaico", mE + 20, ly);
  ctx.save();
  ctx.setLineDash([7, 5]);
  ctx.strokeStyle = COR.util;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mE + 158, ly - 4);
  ctx.lineTo(mE + 174, ly - 4);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COR.textoFraco;
  ctx.fillText("limite da área útil", mE + 180, ly);
  ctx.textAlign = "right";
  ctx.fillText("Cotas em metros, salvo indicação em mm", W - mD, ly);
}

// ------------------------------------------------------------------ tela

export function TelhadoSimulador({ potenciaPainel, nPaineisNecessarios, onTextoProposta }: {
  potenciaPainel: number;
  /** Quantos o dimensionamento pediu — para confrontar com o que cabe. */
  nPaineisNecessarios: number;
  /** Parágrafo para a proposta, ou "" quando o usuário não marcou incluir. */
  onTextoProposta?: (texto: string) => void;
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
  const [incluirNaProposta, setIncluirNaProposta] = useState(false);
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

  const entrada = useMemo<TelhadoInput>(
    () => ({
      larguraM,
      comprimentoM,
      painel: { comprimentoMm: num(m.painelCompMm), larguraMm: num(m.painelLargMm) },
      espacoEntrePaineisMm: num(m.espacoPaineisMm),
      espacoEntreFileirasMm: num(m.espacoFileirasMm),
      recuoBordaMm: num(m.recuoMm),
    }),
    [larguraM, comprimentoM, m.painelCompMm, m.painelLargMm, m.espacoPaineisMm, m.espacoFileirasMm, m.recuoMm],
  );

  const resultado = useMemo(() => simularTelhado(entrada), [entrada]);

  const arranjo =
    orientacaoManual === "auto"
      ? resultado.melhor
      : resultado.arranjos.find((a) => a.orientacao === orientacaoManual) ?? null;

  useEffect(() => {
    if (!canvasRef.current) return;
    desenhar(canvasRef.current, resultado, arranjo, {
      potenciaPainelW: potenciaPainel,
      larguraM,
      comprimentoM,
      recuoMm: num(m.recuoMm),
      folgaModulosMm: num(m.espacoPaineisMm),
      folgaFileirasMm: num(m.espacoFileirasMm),
      painelCompMm: num(m.painelCompMm),
      painelLargMm: num(m.painelLargMm),
    });
  }, [resultado, arranjo, potenciaPainel, larguraM, comprimentoM, m.recuoMm, m.espacoPaineisMm, m.espacoFileirasMm, m.painelCompMm, m.painelLargMm]);

  // Reporta o parágrafo ao configurador. String vazia = não entra na proposta,
  // e é o que também sai quando a simulação deixa de ser válida (medidas
  // apagadas), para o texto não ficar preso de um estado anterior.
  useEffect(() => {
    if (!onTextoProposta) return;
    const valido = incluirNaProposta && arranjo && arranjo.total > 0 && larguraM > 0 && comprimentoM > 0;
    onTextoProposta(valido ? textoParaProposta(entrada, resultado, arranjo, potenciaPainel, nPaineisNecessarios) : "");
  }, [onTextoProposta, incluirNaProposta, arranjo, entrada, resultado, potenciaPainel, nPaineisNecessarios, larguraM, comprimentoM]);

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
      title="Ocupação do telhado"
      subtitle="Medidas de uma água por vez. Em telhado recortado, simule cada água separadamente e some os resultados."
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
            <option value="auto">Maior capacidade</option>
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
        <p className="mt-4 subtitle">Informe a largura e o comprimento da água para calcular a capacidade.</p>
      ) : (
        <>
          <KpiGrid className="mt-5">
            <Kpi label="Capacidade da água" value={`${cabem} módulos`} destaque />
            <Kpi label="Requerido pelo consumo" value={`${nPaineisNecessarios} módulos`} />
            <Kpi
              label={falta > 0 ? "Déficit" : "Excedente"}
              value={`${Math.abs(falta)} módulos`}
              tone={falta > 0 ? "red" : "green"}
            />
            <Kpi label="Área útil" value={`${nf(resultado.areaUtilM2, 1)} m²`} />
          </KpiGrid>

          {falta > 0 && nPaineisNecessarios > 0 && (
            <Alert tone="amber" titulo="A água não comporta o sistema dimensionado." className="mt-4">
              Comporta {cabem} dos {nPaineisNecessarios} módulos requeridos. Use outra água do telhado, reduza o
              recuo se a norma local permitir, ou considere um módulo de maior potência para gerar o mesmo com
              menos peças.
            </Alert>
          )}

          {resultado.melhor && orientacaoManual === "auto" && (
            <p className="hint mt-3">
              {resultado.arranjos.map((a) => `${a.orientacao}: ${a.total}`).join(" · ")} — o desenho adota a de maior capacidade.
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700">
            <canvas ref={canvasRef} className="block" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" onClick={baixarPng} disabled={!temMedidas}>
              Baixar PNG
            </button>
            <span className="hint">
              Estimativa geométrica: não considera chaminé, caixa d&apos;água, platibanda nem sombreamento.
            </span>
          </div>

          <label className="toque mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-gta-indigo dark:text-indigo-300 focus:ring-gta-indigo dark:border-slate-600 dark:bg-slate-700"
              checked={incluirNaProposta}
              onChange={(e) => setIncluirNaProposta(e.target.checked)}
              disabled={!arranjo || arranjo.total === 0}
            />
            <span>
              <span className="font-semibold text-gta-navy dark:text-slate-100">Incluir esta simulação na proposta</span>
              <span className="mt-0.5 block subtitle">
                Acrescenta um parágrafo com a área útil, a disposição dos módulos e as folgas à observação
                técnica do .docx. Sem marcar, a simulação fica só aqui.
              </span>
            </span>
          </label>

          {incluirNaProposta && arranjo && arranjo.total > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="hint mb-1.5">Texto que entrará na proposta</p>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {textoParaProposta(entrada, resultado, arranjo, potenciaPainel, nPaineisNecessarios)}
              </p>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
