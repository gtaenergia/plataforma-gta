"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Loading, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { markupDe } from "@/lib/mao-de-obra/motor";
import { CONFIG_MAO_DE_OBRA_PADRAO, type ConfigMaoDeObra, type Funcao } from "@/lib/mao-de-obra/types";

/**
 * Catálogo de mão de obra terceirizada.
 *
 * Um formulário só, um PUT com o objeto inteiro — mesmo desenho de
 * /admin/planejamento. Salvar campo a campo exigiria mesclagem no servidor e
 * abriria a porta para dois administradores se sobrescreverem sem perceber.
 *
 * A tela fala em PORCENTAGEM (7,02); o que trafega e fica salvo é fração
 * (0,0702). A conversão acontece só aqui.
 */

/** Fração → texto em %. `0` é valor legítimo, não vazio. */
function paraPct(fracao: number): string {
  const v = fracao * 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** Texto em % → fração. Aceita vírgula, que é como se digita em português. */
function paraFracao(txt: string): number {
  const n = Number(txt.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : 0;
}

function paraReais(v: number): string {
  return v === 0 ? "" : String(v).replace(".", ",");
}

function paraNumero(txt: string): number {
  const n = Number(txt.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MaoDeObraAdmin() {
  const [config, setConfig] = useState<ConfigMaoDeObra | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/mao-de-obra");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar o catálogo.");
        setConfig(d.config ?? CONFIG_MAO_DE_OBRA_PADRAO);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const soma = (config?.impostoPadrao ?? 0) + (config?.margemPadrao ?? 0);
  const semSolucao = soma >= 1;
  const markup = useMemo(
    () => markupDe(config?.impostoPadrao ?? 0, config?.margemPadrao ?? 0),
    [config?.impostoPadrao, config?.margemPadrao],
  );
  const semCusto = config?.funcoes.filter((f) => f.custoHora <= 0).length ?? 0;

  function alterarFuncao(id: string, campo: keyof Funcao, valor: string) {
    setOk(false);
    setConfig((c) =>
      c
        ? {
            ...c,
            funcoes: c.funcoes.map((f) =>
              f.id === id ? { ...f, [campo]: campo === "custoHora" ? paraNumero(valor) : valor } : f,
            ),
          }
        : c,
    );
  }

  function acrescentar() {
    setOk(false);
    setConfig((c) =>
      c
        ? {
            ...c,
            // `crypto.randomUUID` para o id NUNCA colidir com o de uma função
            // apagada — uma linha de orçamento antiga apontaria para o custo
            // errado se o id fosse reaproveitado.
            funcoes: [...c.funcoes, { id: crypto.randomUUID(), nome: "", custoHora: 0 }],
          }
        : c,
    );
  }

  function remover(id: string) {
    setOk(false);
    setConfig((c) => (c ? { ...c, funcoes: c.funcoes.filter((f) => f.id !== id) } : c));
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const limpo: ConfigMaoDeObra = {
        ...config,
        // Linha em branco é rascunho de quem clicou em "Acrescentar" e desistiu.
        funcoes: config.funcoes.filter((f) => f.nome.trim() !== ""),
      };
      const r = await fetch("/api/mao-de-obra", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar.");
      setConfig(d.config);
      setOk(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <Loading />;
  if (!config) return <Alert tone="red">{erro ?? "Não foi possível carregar o catálogo."}</Alert>;

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}
      {ok && <Alert tone="green">Catálogo salvo.</Alert>}

      <SectionCard
        title="Funções e custo por hora"
        subtitle="O que a GTA paga a quem executa. É a base do preço de qualquer serviço orçado por hora."
      >
        {semCusto > 0 && (
          <Alert tone="amber" className="mb-4">
            {semCusto === 1
              ? "Uma função ainda está sem custo por hora."
              : `${semCusto} funções ainda estão sem custo por hora.`}{" "}
            Enquanto ficarem em zero, o orçamento que as usar sai por baixo do custo real.
          </Alert>
        )}

        <div className="overflow-x-auto">
          <table className="data-table min-w-[32rem]">
            <thead>
              <tr>
                <th>Função</th>
                <th className="w-40">Custo por hora</th>
                <th className="w-16 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {config.funcoes.map((f) => (
                <tr key={f.id}>
                  <td>
                    <label className="sr-only" htmlFor={`nome-${f.id}`}>
                      Nome da função
                    </label>
                    <input
                      id={`nome-${f.id}`}
                      className="field-input"
                      value={f.nome}
                      placeholder="Ex.: Eletricista"
                      onChange={(e) => alterarFuncao(f.id, "nome", e.target.value)}
                    />
                  </td>
                  <td>
                    <label className="sr-only" htmlFor={`custo-${f.id}`}>
                      Custo por hora de {f.nome || "função sem nome"}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="hint shrink-0">R$</span>
                      <input
                        id={`custo-${f.id}`}
                        className="field-input tabular-nums"
                        inputMode="decimal"
                        value={paraReais(f.custoHora)}
                        placeholder="0,00"
                        onChange={(e) => alterarFuncao(f.id, "custoHora", e.target.value)}
                      />
                      {f.custoHora <= 0 && <Badge tone="amber">sem custo</Badge>}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => remover(f.id)}
                      aria-label={`Remover ${f.nome || "função sem nome"}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" className="btn-secondary mt-3" onClick={acrescentar}>
          <Plus className="h-4 w-4" aria-hidden /> Acrescentar função
        </button>
      </SectionCard>

      <SectionCard
        title="Imposto e margem padrão"
        subtitle="Valores com que cada orçamento nasce. Dá para ajustar caso a caso sem mexer aqui — e o que foi usado fica gravado naquele orçamento."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo label="Imposto (%)">
            <input
              className="field-input tabular-nums"
              inputMode="decimal"
              value={paraPct(config.impostoPadrao)}
              onChange={(e) => {
                setOk(false);
                setConfig({ ...config, impostoPadrao: paraFracao(e.target.value) });
              }}
            />
          </Campo>
          <Campo label="Margem de contribuição (%)">
            <input
              className="field-input tabular-nums"
              inputMode="decimal"
              value={paraPct(config.margemPadrao)}
              onChange={(e) => {
                setOk(false);
                setConfig({ ...config, margemPadrao: paraFracao(e.target.value) });
              }}
            />
          </Campo>
          <div>
            <span className="field-label">Markup resultante</span>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gta-navy dark:text-slate-100">
              {semSolucao ? "—" : markup.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
            </p>
            <p className="hint mt-0.5">
              {semSolucao ? "Sem preço possível" : `Custo de ${moeda(1000)} vira ${moeda(1000 * markup)}`}
            </p>
          </div>
        </div>

        {semSolucao && (
          <Alert tone="red" className="mt-4" titulo="Imposto e margem somam 100% ou mais">
            Não existe preço que satisfaça essa combinação: os dois são percentuais do preço final, e
            juntos não sobraria nada para o custo. Reduza um dos dois.
          </Alert>
        )}

        <p className="hint mt-4">
          Os dois são percentuais do <strong>preço</strong>, não do custo. É o que faz a conta fechar:
          preço = custo ÷ (1 − imposto − margem).
        </p>
      </SectionCard>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando || semSolucao}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {semSolucao && <span className="hint">Corrija o imposto ou a margem para salvar.</span>}
      </div>
    </div>
  );
}
