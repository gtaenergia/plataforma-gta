"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Kpi, KpiGrid } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { ClienteInput } from "@/components/clientes/ClienteInput";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { lerHoras } from "@/lib/custo-equipe/sugestao";
import { aplicarMarkup, calcularComposicao, markupDe } from "@/lib/mao-de-obra/motor";
import {
  custoMateriaisCent,
  repartirPreco,
  resumoEquipe,
  TIPO_MATERIAL_LABEL,
  TIPOS_MATERIAL,
  type LinhaMaterial,
  type TipoMaterial,
} from "@/lib/mao-de-obra/proposta";
import type { Funcao } from "@/lib/mao-de-obra/types";

/**
 * Proposta de Fornecimento de Mão de Obra.
 *
 * A MESMA conta da calculadora (/mao-de-obra): funções × horas × R$/h, imposto
 * e margem como percentuais do preço. As diferenças são as que o pedido nomeia:
 * aqui a saída é uma PROPOSTA no molde padrão da plataforma (não uma planilha),
 * e o custo ganha a segunda perna — materiais, ferramentas e equipamentos.
 *
 * O corte de `financeiro.ver` vem pronto da API (/api/mao-de-obra): sem a
 * permissão chegam só os NOMES das funções — dá para montar equipe, materiais
 * e digitar o valor final, mas custo, taxas e preço sugerido não aparecem
 * (nem trafegam).
 */

const nf = (v: number, d = 2) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (v: number) => "R$ " + nf(v, 2);
const moeda = (cent: number) => brl(cent / 100);
const parseBR = (s: string) => {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};
const HOJE = new Date().toISOString().slice(0, 10);

interface LinhaEquipeForm {
  funcaoId: string;
  pessoas: string;
  horas: string;
}
interface LinhaMaterialForm {
  tipo: TipoMaterial;
  descricao: string;
  quantidade: string;
  unidade: string;
  valorUnitario: string;
}

const LINHA_EQUIPE_VAZIA: LinhaEquipeForm = { funcaoId: "", pessoas: "1", horas: "" };
const LINHA_MATERIAL_VAZIA: LinhaMaterialForm = { tipo: "material", descricao: "", quantidade: "1", unidade: "un", valorUnitario: "" };

const OBJETO_PADRAO =
  "Fornecimento de mão de obra especializada para execução de serviços elétricos, incluindo materiais, ferramentas e equipamentos relacionados nesta proposta.";
const OBS_PADRAO = [
  "Mão de obra com encargos, EPIs e supervisão técnica inclusos.",
  "Materiais e ferramentas conforme relação desta proposta; itens adicionais serão orçados à parte.",
  "Despesas de deslocamento, alimentação e estadia da equipe inclusas no valor proposto.",
];
const PRAZO_PADRAO = "A combinar, conforme programação da obra";
const TITULO_DOC = "PROPOSTA TÉCNICA E COMERCIAL — FORNECIMENTO DE MÃO DE OBRA";

export function MaoDeObraConfigurator({ propostaId, criadoPor }: { propostaId?: string; criadoPor?: string }) {
  void criadoPor; // assinatura padrão dos configuradores; a autoria vem da sessão no servidor
  const router = useRouter();

  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [podeVerFinanceiro, setPodeVerFinanceiro] = useState(false);
  const [estado, setEstado] = useState<"carregando" | "erro" | "pronto">("carregando");
  const [falha, setFalha] = useState("");

  // Identificação (mesmos campos dos demais configuradores)
  const [clienteNome, setClienteNome] = useState("");
  const [cidadeUf, setCidadeUf] = useState("");
  const [localAtividade, setLocalAtividade] = useState("");
  const [referenciaSeq, setReferenciaSeq] = useState("1");
  const [dataEmissao, setDataEmissao] = useState(HOJE);
  const [validadeDias, setValidadeDias] = useState("20");

  // As duas pernas do custo
  const [linhas, setLinhas] = useState<LinhaEquipeForm[]>([{ ...LINHA_EQUIPE_VAZIA }]);
  const [materiais, setMateriais] = useState<LinhaMaterialForm[]>([]);

  // Taxas (só com financeiro.ver) e valor final
  const [imposto, setImposto] = useState("");
  const [margem, setMargem] = useState("");
  const [valorServico, setValorServico] = useState("");
  const precoTocado = useRef(false);

  // Textos e condições
  const [objeto, setObjeto] = useState(OBJETO_PADRAO);
  const [observacoesExtra, setObservacoesExtra] = useState(OBS_PADRAO.join("\n"));
  const [prazoExecucao, setPrazoExecucao] = useState(PRAZO_PADRAO);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);

  const [erro, setErro] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);

  const edicao = useEdicaoPendente();
  const editar = <T,>(setter: (v: T) => void) => (v: T) => {
    edicao.marcarEditado();
    setter(v);
  };
  const setLinha = (i: number, patch: Partial<LinhaEquipeForm>) =>
    editar(setLinhas)(linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setMaterial = (i: number, patch: Partial<LinhaMaterialForm>) =>
    editar(setMateriais)(materiais.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/mao-de-obra");
        const tipo = r.headers.get("content-type") ?? "";
        if (!tipo.includes("application/json")) {
          setFalha("Sua sessão expirou. Entre novamente.");
          return setEstado("erro");
        }
        const d = await r.json();
        if (!r.ok || !d.config) {
          setFalha(d.error ?? "Não foi possível carregar o catálogo de mão de obra.");
          return setEstado("erro");
        }
        setFuncoes(d.config.funcoes ?? []);
        setPodeVerFinanceiro(!!d.podeVerFinanceiro);
        if (d.podeVerFinanceiro) {
          setImposto(String((d.config.impostoPadrao ?? 0) * 100).replace(".", ","));
          setMargem(String((d.config.margemPadrao ?? 0) * 100).replace(".", ","));
        }
        setEstado("pronto");
      } catch (e) {
        setFalha(e instanceof Error ? e.message : "Falha ao carregar.");
        setEstado("erro");
      }
    })();
  }, []);

  // Retomar proposta salva, ou buscar a próxima referência
  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`)
        .then((r) => r.json())
        .then((d) => {
          const dados = d.proposta?.dados as Record<string, unknown> | undefined;
          if (!dados) return;
          if (typeof dados.clienteNome === "string") setClienteNome(dados.clienteNome);
          if (typeof dados.cidadeUf === "string") setCidadeUf(dados.cidadeUf);
          if (typeof dados.localAtividade === "string") setLocalAtividade(dados.localAtividade);
          if (typeof dados.referenciaSeq === "string") setReferenciaSeq(dados.referenciaSeq);
          if (typeof dados.dataEmissao === "string") setDataEmissao(dados.dataEmissao);
          if (typeof dados.validadeDias === "string") setValidadeDias(dados.validadeDias);
          if (Array.isArray(dados.linhas)) setLinhas(dados.linhas as LinhaEquipeForm[]);
          if (Array.isArray(dados.materiais)) setMateriais(dados.materiais as LinhaMaterialForm[]);
          if (typeof dados.imposto === "string") setImposto(dados.imposto);
          if (typeof dados.margem === "string") setMargem(dados.margem);
          if (typeof dados.valorServico === "string" && dados.valorServico) {
            setValorServico(dados.valorServico);
            precoTocado.current = true;
          }
          if (typeof dados.objeto === "string") setObjeto(dados.objeto);
          if (typeof dados.observacoesExtra === "string") setObservacoesExtra(dados.observacoesExtra);
          if (typeof dados.prazoExecucao === "string") setPrazoExecucao(dados.prazoExecucao);
          if (dados.cond && typeof dados.cond === "object") setCond(dados.cond as CondPag);
        })
        .catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=mao-de-obra")
        .then((r) => r.json())
        .then((d) => {
          if (d.seq) setReferenciaSeq(String(d.seq));
        })
        .catch(() => {});
    }
  }, [propostaId]);

  const taxas = useMemo(() => ({ imposto: pctParaFracao(imposto), margem: pctParaFracao(margem) }), [imposto, margem]);

  const composicao = useMemo(
    () =>
      calcularComposicao(
        linhas
          .filter((l) => l.funcaoId && lerHoras(l.horas) > 0)
          .map((l) => ({ funcaoId: l.funcaoId, pessoas: lerHoras(l.pessoas), horas: lerHoras(l.horas) })),
        { funcoes },
        taxas,
      ),
    [linhas, funcoes, taxas],
  );

  const materiaisNum: LinhaMaterial[] = useMemo(
    () =>
      materiais
        .filter((m) => m.descricao.trim())
        .map((m) => ({
          tipo: m.tipo,
          descricao: m.descricao.trim(),
          quantidade: lerHoras(m.quantidade) || 0,
          unidade: m.unidade.trim() || "un",
          valorUnitario: parseBR(m.valorUnitario),
        })),
    [materiais],
  );
  const custoMatCent = useMemo(() => custoMateriaisCent(materiaisNum), [materiaisNum]);

  /** Preço sugerido: markup sobre a SOMA das duas pernas — a conta da calculadora. */
  const sugestao = useMemo(
    () => aplicarMarkup(composicao.custoCent + custoMatCent, taxas),
    [composicao.custoCent, custoMatCent, taxas],
  );
  const precoSugerido = podeVerFinanceiro && !sugestao.impedimento ? sugestao.precoCent / 100 : 0;

  useEffect(() => {
    if (!precoTocado.current && precoSugerido > 0) setValorServico(nf(precoSugerido, 2));
  }, [precoSugerido]);

  const valorFinal = parseBR(valorServico);
  const semSolucao = podeVerFinanceiro && sugestao.impedimento === "divisor_invalido";

  function montarItens() {
    const resumo = resumoEquipe(composicao.linhas);
    const descricaoMo = `Fornecimento de mão de obra especializada${resumo ? ` — ${resumo}` : ""}`;
    const valorCent = Math.round(valorFinal * 100);

    // Duas linhas só quando a proporção é conhecida (custo das duas pernas à
    // vista); sem financeiro.ver não há como repartir sem inventar.
    if (podeVerFinanceiro && custoMatCent > 0 && composicao.custoCent > 0) {
      const partes = repartirPreco(valorCent, composicao.custoCent, custoMatCent);
      return [
        { descricao: descricaoMo, valor: nf(partes.maoDeObraCent / 100, 2), condicao: "" },
        {
          descricao: `Materiais, ferramentas e equipamentos (${materiaisNum.length} ${materiaisNum.length === 1 ? "item" : "itens"} conforme relação)`,
          valor: nf(partes.materiaisCent / 100, 2),
          condicao: "",
        },
      ];
    }
    const inclui = materiaisNum.length > 0 ? ", incluindo materiais, ferramentas e equipamentos conforme relação" : "";
    return [{ descricao: `${descricaoMo}${inclui}`, valor: nf(valorFinal, 2), condicao: "" }];
  }

  function montarObservacoes() {
    const obs = observacoesExtra.split("\n").filter((l) => l.trim());
    if (materiaisNum.length > 0) {
      const relacao = materiaisNum
        .map((m) => `${m.descricao} (${m.quantidade.toLocaleString("pt-BR")} ${m.unidade})`)
        .join("; ");
      obs.push(`Relação de materiais e ferramentas inclusos: ${relacao}.`);
    }
    return obs;
  }

  async function salvar(silencioso = false) {
    if (!clienteNome) {
      setErro("Informe o nome do cliente para salvar.");
      return null;
    }
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        serviceKey: "mao-de-obra",
        cliente: clienteNome,
        status: valorFinal > 0 ? "precificada" : "rascunho",
        dados: {
          clienteNome, cidadeUf, localAtividade, referenciaSeq, dataEmissao, validadeDias,
          linhas, materiais, imposto, margem, valorServico, objeto, observacoesExtra, prazoExecucao, cond,
        },
      };
      const res = savedId
        ? await fetch(`/api/propostas/${savedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/propostas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const id = data.proposta?.id ?? savedId;
      setSavedId(id);
      edicao.marcarSalvo();
      if (!silencioso) setStatusMsg("Proposta salva.");
      return id;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      return null;
    } finally {
      setSalvando(false);
    }
  }

  async function gerar() {
    if (!clienteNome) return setErro("Informe o nome do cliente.");
    if (!cidadeUf) return setErro("Informe a Cidade/UF.");
    if (valorFinal <= 0) return setErro("Informe o valor do serviço.");
    setGerando(true);
    setErro(null);
    try {
      let id = savedId;
      if (!id) {
        id = (await salvar(true)) ?? undefined;
        if (!id) return;
      }
      const formData = {
        clienteNome, cidadeUf, localAtividade, referenciaSeq, dataEmissao, validadeDias,
        formaPagamento: montarFormaPagamento(cond, valorFinal),
        titulo: TITULO_DOC,
        objeto,
        prazoExecucao,
        itens: montarItens(),
        observacoes: montarObservacoes(),
      };
      const res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: "mao-de-obra", formData, propostaId: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Falha ao gerar.");
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = disp.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m ? decodeURIComponent(m[1]) : "mao-de-obra.docx";
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  if (estado !== "pronto") {
    return (
      <section className="section-card">
        {estado === "carregando" ? <p className="hint">Carregando o catálogo de funções…</p> : <Alert tone="amber">{falha}</Alert>}
      </section>
    );
  }

  const semCusto = podeVerFinanceiro && composicao.incompleta;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      {/* Cliente e local */}
      <section className="section-card">
        <h2 className="section-title">Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Nome do cliente *">
            <ClienteInput value={clienteNome} onNome={editar(setClienteNome)} onCidadeUf={editar(setCidadeUf)} />
          </Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF *">
            <input className="field-input" value={cidadeUf} onChange={(e) => editar(setCidadeUf)(e.target.value)} placeholder="Ex.: Goiânia/GO" />
          </Campo>
          <Campo className="sm:col-span-3" label="Local / obra">
            <input className="field-input" value={localAtividade} onChange={(e) => editar(setLocalAtividade)(e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)">
            <input type="number" className="field-input" value={validadeDias} onChange={(e) => editar(setValidadeDias)(e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-2" label="Emissão">
            <input type="date" className="field-input" value={dataEmissao} onChange={(e) => editar(setDataEmissao)(e.target.value)} />
          </Campo>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      {/* Equipe terceirizada — a mesma grade da calculadora */}
      <section className="section-card">
        <h2 className="section-title">Equipe</h2>
        <p className="mt-1 subtitle">As funções e o custo por hora são os da calculadora de mão de obra — cadastrados lá, valem aqui.</p>
        <div className="mt-4 space-y-3">
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <Campo className="sm:col-span-5" label={i === 0 ? "Função" : ""}>
                <select className="field-input" value={l.funcaoId} onChange={(e) => setLinha(i, { funcaoId: e.target.value })}>
                  <option value="">Selecione…</option>
                  {funcoes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {podeVerFinanceiro ? (f.custoHora > 0 ? ` — ${brl(f.custoHora)}/h` : " (sem custo)") : ""}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo className="sm:col-span-3" label={i === 0 ? "Pessoas" : ""}>
                <input className="field-input tabular-nums" inputMode="numeric" value={l.pessoas} onChange={(e) => setLinha(i, { pessoas: e.target.value })} />
              </Campo>
              <Campo
                className="sm:col-span-3"
                label={i === 0 ? "Horas cada" : ""}
                hint={i === 0 ? <p className="hint mt-1">Horas por pessoa. Para dias × horas por dia, escreva 5 x 8</p> : undefined}
              >
                <input className="field-input tabular-nums" value={l.horas} placeholder="0" onChange={(e) => setLinha(i, { horas: e.target.value })} />
              </Campo>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => editar(setLinhas)(linhas.length > 1 ? linhas.filter((_, j) => j !== i) : [{ ...LINHA_EQUIPE_VAZIA }])}
                  aria-label={`Remover linha ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-3" onClick={() => editar(setLinhas)([...linhas, { ...LINHA_EQUIPE_VAZIA }])}>
          <Plus className="h-4 w-4" aria-hidden /> Acrescentar função
        </button>
        {semCusto && <div className="mt-3"><Badge tone="amber">alguma função está sem custo cadastrado — o preço sugerido sai por baixo</Badge></div>}
      </section>

      {/* Materiais e ferramentas — a segunda perna do custo */}
      <section className="section-card">
        <h2 className="section-title">Materiais e ferramentas</h2>
        <p className="mt-1 subtitle">Tudo que a equipe leva para a obra: material de consumo, ferramentas e equipamentos. Entra no custo antes do markup e sai como relação na proposta.</p>
        <div className="mt-4 space-y-3">
          {materiais.length === 0 && <p className="hint">Nenhum item — proposta só de mão de obra.</p>}
          {materiais.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-12">
              <Campo className="col-span-2 sm:col-span-2" label={i === 0 ? "Tipo" : ""}>
                <select className="field-input" value={m.tipo} onChange={(e) => setMaterial(i, { tipo: e.target.value as TipoMaterial })}>
                  {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{TIPO_MATERIAL_LABEL[t]}</option>)}
                </select>
              </Campo>
              <Campo className="col-span-2 sm:col-span-4" label={i === 0 ? "Descrição" : ""}>
                <input className="field-input" value={m.descricao} placeholder="Ex.: Cabo flexível 2,5 mm²" onChange={(e) => setMaterial(i, { descricao: e.target.value })} />
              </Campo>
              <Campo className="sm:col-span-2" label={i === 0 ? "Quantidade" : ""}>
                <input className="field-input tabular-nums" inputMode="decimal" value={m.quantidade} onChange={(e) => setMaterial(i, { quantidade: e.target.value })} />
              </Campo>
              <Campo className="sm:col-span-1" label={i === 0 ? "Unidade" : ""}>
                <input className="field-input" value={m.unidade} placeholder="un" onChange={(e) => setMaterial(i, { unidade: e.target.value })} />
              </Campo>
              <Campo className="sm:col-span-2" label={i === 0 ? "Valor unitário (R$)" : ""}>
                <input className="field-input tabular-nums" inputMode="decimal" value={m.valorUnitario} placeholder="0,00" onChange={(e) => setMaterial(i, { valorUnitario: e.target.value })} />
              </Campo>
              <div className="flex items-end sm:col-span-1">
                <button type="button" className="icon-btn" onClick={() => editar(setMateriais)(materiais.filter((_, j) => j !== i))} aria-label={`Remover item ${i + 1}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => editar(setMateriais)([...materiais, { ...LINHA_MATERIAL_VAZIA }])}>
            <Plus className="h-4 w-4" aria-hidden /> Acrescentar item
          </button>
          {custoMatCent > 0 && <span className="text-sm text-slate-600 dark:text-slate-300">Custo dos itens: <strong className="text-gta-navy dark:text-slate-100">{moeda(custoMatCent)}</strong></span>}
        </div>
      </section>

      {/* Preço — a conta da calculadora, com as duas pernas somadas */}
      <section className="section-card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Preço</h2>
          {precoSugerido > 0 && precoTocado.current && (
            <button
              type="button"
              className="btn-link text-xs"
              onClick={() => {
                precoTocado.current = false;
                setValorServico(nf(precoSugerido, 2));
              }}
            >
              Usar sugerido {brl(precoSugerido)}
            </button>
          )}
        </div>

        {podeVerFinanceiro ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Campo label="Imposto (%)">
                <input className="field-input tabular-nums" inputMode="decimal" value={imposto} onChange={(e) => editar(setImposto)(e.target.value)} />
              </Campo>
              <Campo label="Margem (%)">
                <input className="field-input tabular-nums" inputMode="decimal" value={margem} onChange={(e) => editar(setMargem)(e.target.value)} />
              </Campo>
              <div>
                <span className="field-label">Markup</span>
                <p className="mt-1 text-lg font-semibold tabular-nums text-gta-navy dark:text-slate-100">
                  {semSolucao ? "—" : markupDe(taxas.imposto, taxas.margem).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                </p>
              </div>
            </div>

            {semSolucao ? (
              <Alert tone="red" titulo="Imposto e margem somam 100% ou mais">
                Não existe preço para essa combinação: os dois são percentuais do preço final.
              </Alert>
            ) : (
              <KpiGrid>
                <Kpi label="Custo da equipe" value={moeda(composicao.custoCent)} />
                <Kpi label="Materiais e ferramentas" value={moeda(custoMatCent)} />
                <Kpi label="Imposto + lucro" value={moeda(sugestao.impostoCent + sugestao.lucroCent)} />
                <Kpi label="Preço sugerido" value={moeda(sugestao.precoCent)} destaque />
              </KpiGrid>
            )}
          </div>
        ) : (
          <Alert tone="indigo" className="mt-4">
            Você monta a equipe e os materiais; custo por hora, taxas e preço sugerido ficam com quem tem a permissão financeira. Informe o valor final combinado.
          </Alert>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Valor do serviço (R$) *">
            <input
              className="field-input"
              value={valorServico}
              onChange={(e) => {
                precoTocado.current = true;
                editar(setValorServico)(e.target.value);
              }}
            />
          </Campo>
          <div className="flex items-end sm:col-span-3">
            <div className="w-full rounded-md bg-gta-navy p-2 text-white shadow-sm">
              <div className="text-xs text-slate-300">Total ao cliente</div>
              <div className="mt-0.5 text-lg font-bold">{brl(valorFinal)}</div>
            </div>
          </div>
        </div>
      </section>

      <CondicoesPagamento total={valorFinal} value={cond} onChange={setCond} />

      {/* Textos */}
      <details className="section-card">
        <summary className="cursor-pointer text-sm font-semibold text-gta-navy dark:text-slate-100">Textos da proposta (opcional)</summary>
        <div className="mt-4 space-y-3">
          <Campo label="Objeto">
            <textarea className="field-input min-h-[70px]" value={objeto} onChange={(e) => editar(setObjeto)(e.target.value)} />
          </Campo>
          <Campo label="Condições gerais (uma por linha)" hint={<p className="hint mt-1">A relação de materiais entra sozinha como última condição.</p>}>
            <textarea className="field-input min-h-[90px]" value={observacoesExtra} onChange={(e) => editar(setObservacoesExtra)(e.target.value)} />
          </Campo>
          <Campo label="Prazo de execução">
            <input className="field-input" value={prazoExecucao} onChange={(e) => editar(setPrazoExecucao)(e.target.value)} />
          </Campo>
        </div>
      </details>

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => salvar(false)} disabled={salvando}>
          {salvando ? "Salvando…" : savedId ? "Salvar alterações" : "Salvar proposta"}
        </button>
        <button className="btn-primary" onClick={gerar} disabled={gerando || valorFinal <= 0}>
          {gerando ? "Gerando…" : "Gerar .docx"}
        </button>
        <button className="btn-link" onClick={() => router.push("/propostas")}>Ver propostas</button>
        {statusMsg && <span className="text-sm text-green-600 dark:text-green-400">{statusMsg}</span>}
      </div>
    </div>
  );
}

function pctParaFracao(txt: string): number {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : 0;
}
