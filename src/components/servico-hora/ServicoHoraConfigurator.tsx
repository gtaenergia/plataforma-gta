"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ClienteInput } from "@/components/clientes/ClienteInput";
import { CondicoesPagamento, montarFormaPagamento, COND_PADRAO, type CondPag } from "@/components/CondicoesPagamento";
import { Alert, Badge, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";

/**
 * Serviço cobrado por hora de mão de obra terceirizada.
 *
 * O preço vem do SERVIDOR, não daqui. Quem não tem `financeiro.ver` nunca
 * recebe o R$/h das funções — então calcular no navegador só funcionaria para
 * uma parte das pessoas. Com o cálculo lá, o caminho é um só e o que a
 * resposta omite é o próprio controle de acesso.
 *
 * A proposta que chega ao cliente leva o serviço e o preço. A composição de
 * custo fica na plataforma.
 */

const HOJE = new Date().toISOString().slice(0, 10);
const moeda = (cent: number) => (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface FuncaoLista {
  id: string;
  nome: string;
}

interface Linha {
  funcaoId: string;
  pessoas: string;
  horas: string;
}

interface LinhaComposta {
  funcaoId: string;
  nome: string;
  horasTotais: number;
  custoCent: number;
  incompleta: boolean;
}

interface Composicao {
  custoCent: number;
  impostoCent: number;
  lucroCent: number;
  markup: number;
  imposto: number;
  margem: number;
  linhas: LinhaComposta[];
}

const numero = (txt: string) => {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function ServicoHoraConfigurator({ propostaId }: { propostaId?: string }) {
  const [funcoes, setFuncoes] = useState<FuncaoLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(propostaId);
  const [cond, setCond] = useState<CondPag>(COND_PADRAO);

  const [form, setForm] = useState({
    clienteNome: "",
    cidadeUf: "",
    localAtividade: "",
    referenciaSeq: "1",
    dataEmissao: HOJE,
    validadeDias: "20",
    titulo: "",
    objeto: "",
    prazoExecucao: "A combinar",
    observacoesExtra: "",
  });
  const [linhas, setLinhas] = useState<Linha[]>([{ funcaoId: "", pessoas: "1", horas: "" }]);

  // Vazio = usa o padrão do catálogo. O servidor decide, não a tela.
  const [imposto, setImposto] = useState("");
  const [margem, setMargem] = useState("");

  const [precoCent, setPrecoCent] = useState(0);
  const [composicao, setComposicao] = useState<Composicao | null>(null);
  const [incompleta, setIncompleta] = useState(false);
  const [impedimento, setImpedimento] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/mao-de-obra");
        const d = await r.json();
        if (r.ok) setFuncoes(d.config?.funcoes ?? []);
      } catch {
        /* o catálogo vazio já se explica na tela */
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (propostaId) {
      fetch(`/api/propostas/${propostaId}`)
        .then((r) => r.json())
        .then((d) => {
          const dados = d.proposta?.dados as Record<string, unknown> | undefined;
          if (!dados) return;
          // Copia campo a campo, e só o que é texto: o `dados` é jsonb livre, e
          // um espalhamento cego traria `linhas` e `cond` para dentro do form,
          // onde eles não existem.
          setForm((f) => {
            const next = { ...f };
            for (const k of Object.keys(f) as (keyof typeof f)[]) {
              if (typeof dados[k] === "string") next[k] = dados[k] as string;
            }
            return next;
          });
          if (Array.isArray(dados.linhas)) setLinhas(dados.linhas as Linha[]);
          if (dados.cond && typeof dados.cond === "object") setCond(dados.cond as CondPag);
          if (typeof dados.imposto === "string") setImposto(dados.imposto);
          if (typeof dados.margem === "string") setMargem(dados.margem);
        })
        .catch(() => {});
    } else {
      fetch("/api/propostas/proximo?serviceKey=servico-hora")
        .then((r) => r.json())
        .then((d) => {
          if (d.seq) setForm((f) => ({ ...f, referenciaSeq: String(d.seq) }));
        })
        .catch(() => {});
    }
  }, [propostaId]);

  const recalcular = useCallback(async () => {
    const uteis = linhas.filter((l) => l.funcaoId && numero(l.horas) > 0);
    if (uteis.length === 0) {
      setPrecoCent(0);
      setComposicao(null);
      setIncompleta(false);
      setImpedimento(null);
      return;
    }
    try {
      const r = await fetch("/api/mao-de-obra/preco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhas: uteis.map((l) => ({
            funcaoId: l.funcaoId,
            pessoas: numero(l.pessoas),
            horas: numero(l.horas),
          })),
          ...(imposto.trim() ? { imposto: numero(imposto) / 100 } : {}),
          ...(margem.trim() ? { margem: numero(margem) / 100 } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao calcular o preço.");
      setPrecoCent(d.precoCent ?? 0);
      setComposicao(d.composicao ?? null);
      setIncompleta(!!d.incompleta);
      setImpedimento(d.impedimento ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao calcular.");
    }
  }, [linhas, imposto, margem]);

  // Espera a digitação parar. Sem isto, cada tecla vira uma ida ao servidor.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void recalcular(), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [recalcular]);

  function alterarLinha(i: number, campo: keyof Linha, valor: string) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  const dadosDaProposta = () => ({ ...form, linhas, cond, imposto, margem });

  async function salvar(silencioso = false) {
    if (!form.clienteNome) {
      setErro("Informe o nome do cliente para salvar.");
      return null;
    }
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        serviceKey: "servico-hora",
        cliente: form.clienteNome,
        status: precoCent > 0 ? "precificada" : "rascunho",
        dados: dadosDaProposta(),
      };
      const res = savedId
        ? await fetch(`/api/propostas/${savedId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/propostas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      const id = data.proposta?.id ?? savedId;
      setSavedId(id);
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
    if (!form.clienteNome) return setErro("Informe o nome do cliente.");
    if (!form.cidadeUf) return setErro("Informe a Cidade/UF.");
    if (!form.titulo.trim()) return setErro("Informe o título do serviço.");
    if (precoCent <= 0) return setErro("Acrescente ao menos uma linha de mão de obra com horas.");

    setGerando(true);
    setErro(null);
    try {
      let id = savedId;
      if (!id) {
        id = (await salvar(true)) ?? undefined;
        if (!id) return;
      }
      const valor = precoCent / 100;
      const formData = {
        clienteNome: form.clienteNome,
        cidadeUf: form.cidadeUf,
        localAtividade: form.localAtividade,
        referenciaSeq: form.referenciaSeq,
        dataEmissao: form.dataEmissao,
        validadeDias: form.validadeDias,
        formaPagamento: montarFormaPagamento(cond, valor),
        titulo: form.titulo,
        objeto: form.objeto,
        prazoExecucao: form.prazoExecucao,
        // UM item: o serviço e o preço. A composição de custo NÃO vai para o
        // documento — o cliente veria quanto a GTA paga e quanto ganha.
        itens: [{ descricao: form.titulo, valor: nf(valor), condicao: "" }],
        observacoes: form.observacoesExtra.split("\n").filter((l) => l.trim()),
      };
      const res = await fetch("/api/gerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey: "servico-hora", formData, propostaId: id }),
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
      a.download = m ? decodeURIComponent(m[1]) : "servico-hora.docx";
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg("Documento gerado e baixado. Registrado no histórico.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setGerando(false);
    }
  }

  if (carregando) return <Loading />;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}
      {statusMsg && <Alert tone="green">{statusMsg}</Alert>}

      {funcoes.length === 0 && (
        <Alert tone="amber" titulo="Nenhuma função cadastrada">
          O catálogo de mão de obra está vazio. Um administrador precisa cadastrar as funções e o
          custo por hora antes de este serviço conseguir montar um preço.
        </Alert>
      )}

      <section className="section-card">
        <h2 className="section-title">Cliente e local</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Nome do cliente *">
            <ClienteInput
              className="field-input"
              value={form.clienteNome}
              onNome={(v) => set("clienteNome", v)}
              onCidadeUf={(v) => set("cidadeUf", v)}
            />
          </Campo>
          <Campo className="sm:col-span-3" label="Cidade/UF *">
            <input className="field-input" value={form.cidadeUf} onChange={(e) => set("cidadeUf", e.target.value)} placeholder="Ex.: Goiânia/GO" />
          </Campo>
          <Campo className="sm:col-span-3" label="Local / obra">
            <input className="field-input" value={form.localAtividade} onChange={(e) => set("localAtividade", e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-1" label="Validade (dias)">
            <input type="number" className="field-input" value={form.validadeDias} onChange={(e) => set("validadeDias", e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-2" label="Emissão">
            <input type="date" className="field-input" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} />
          </Campo>
        </div>
        <p className="mt-2 hint">A referência é gerada automaticamente ao salvar.</p>
      </section>

      <section className="section-card">
        <h2 className="section-title">O serviço</h2>
        <p className="hint mt-1">
          Descreva com as próprias palavras. É aqui que entra o que não tem configurador próprio —
          uma manutenção, um smart meter, o que aparecer.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-6" label="Título *">
            <input className="field-input" value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Instalação de smart meter" />
          </Campo>
          <Campo className="sm:col-span-6" label="Objeto / característica">
            <textarea className="field-input min-h-[5rem]" value={form.objeto} onChange={(e) => set("objeto", e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-3" label="Prazo de execução">
            <input className="field-input" value={form.prazoExecucao} onChange={(e) => set("prazoExecucao", e.target.value)} />
          </Campo>
        </div>
      </section>

      <section className="section-card">
        <h2 className="section-title">Mão de obra</h2>
        <p className="hint mt-1">Quantas pessoas de cada função, e por quantas horas.</p>

        <div className="mt-4 space-y-3">
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <Campo className="sm:col-span-5" label={i === 0 ? "Função" : ""}>
                <select className="field-input" value={l.funcaoId} onChange={(e) => alterarLinha(i, "funcaoId", e.target.value)}>
                  <option value="">Selecione…</option>
                  {funcoes.map((f) => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo className="sm:col-span-3" label={i === 0 ? "Pessoas" : ""}>
                <input className="field-input tabular-nums" inputMode="numeric" value={l.pessoas} onChange={(e) => alterarLinha(i, "pessoas", e.target.value)} />
              </Campo>
              <Campo className="sm:col-span-3" label={i === 0 ? "Horas cada" : ""}>
                <input className="field-input tabular-nums" inputMode="decimal" value={l.horas} onChange={(e) => alterarLinha(i, "horas", e.target.value)} placeholder="0" />
              </Campo>
              <div className={`flex items-end sm:col-span-1 ${i === 0 ? "sm:pb-0" : ""}`}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                  aria-label={`Remover linha ${i + 1}`}
                  disabled={linhas.length === 1}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary mt-3" onClick={() => setLinhas((ls) => [...ls, { funcaoId: "", pessoas: "1", horas: "" }])}>
          <Plus className="h-4 w-4" aria-hidden /> Acrescentar linha
        </button>

        {incompleta && (
          <Alert tone="amber" className="mt-4">
            Alguma função usada está sem custo por hora cadastrado. O preço abaixo sai por baixo do
            custo real até um administrador preencher.
          </Alert>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Preço</h2>

        {impedimento === "divisor_invalido" ? (
          <Alert tone="red" className="mt-4" titulo="Imposto e margem somam 100% ou mais">
            Não existe preço para essa combinação. Ajuste os percentuais abaixo.
          </Alert>
        ) : (
          <p className="mt-3 text-3xl font-semibold tabular-nums text-gta-navy dark:text-slate-100">
            {moeda(precoCent)}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Campo label="Imposto (%)" hint={<p className="hint mt-1">Vazio = padrão</p>}>
            <input className="field-input tabular-nums" inputMode="decimal" value={imposto} onChange={(e) => setImposto(e.target.value)} placeholder="padrão" />
          </Campo>
          <Campo label="Margem (%)" hint={<p className="hint mt-1">Vazio = padrão</p>}>
            <input className="field-input tabular-nums" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} placeholder="padrão" />
          </Campo>
        </div>

        {composicao && (
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-gta-navy dark:text-slate-100">Composição</h3>
              <Badge tone="indigo">markup {composicao.markup.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table mt-3 min-w-[28rem]">
                <thead>
                  <tr>
                    <th>Função</th>
                    <th className="text-right">Horas</th>
                    <th className="text-right">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {composicao.linhas.map((l, i) => (
                    <tr key={i}>
                      <td>
                        {l.nome || <span className="hint">função removida</span>}
                        {l.incompleta && <Badge tone="amber" className="ml-2">sem custo</Badge>}
                      </td>
                      <td className="text-right tabular-nums">{l.horasTotais.toLocaleString("pt-BR")}</td>
                      <td className="text-right tabular-nums">{moeda(l.custoCent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-slate-600 dark:text-slate-400">Custo</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.custoCent)}</dd>
              <dt className="text-slate-600 dark:text-slate-400">Imposto</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.impostoCent)}</dd>
              <dt className="text-slate-600 dark:text-slate-400">Lucro</dt>
              <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(composicao.lucroCent)}</dd>
              <dt className="text-slate-600 dark:text-slate-400">Preço</dt>
              <dd className="font-medium tabular-nums text-gta-navy dark:text-slate-100">{moeda(precoCent)}</dd>
            </dl>
            <p className="hint mt-3">
              Esta composição fica na plataforma. A proposta enviada ao cliente mostra o serviço e o
              preço.
            </p>
          </div>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">Condições de pagamento</h2>
        <CondicoesPagamento total={precoCent / 100} value={cond} onChange={setCond} />
      </section>

      <section className="section-card">
        <h2 className="section-title">Observações</h2>
        <Campo label="Uma por linha">
          <textarea className="field-input min-h-[6rem]" value={form.observacoesExtra} onChange={(e) => set("observacoesExtra", e.target.value)} />
        </Campo>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar rascunho"}
        </button>
        <button type="button" className="btn-primary" onClick={gerar} disabled={gerando || precoCent <= 0}>
          {gerando ? "Gerando…" : "Gerar proposta"}
        </button>
      </div>
    </div>
  );
}
