"use client";

import { useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import type { Funcao } from "@/lib/mao-de-obra/types";

/**
 * Cadastro das funções e do custo por hora.
 *
 * Mora DENTRO das telas que usam o catálogo — a calculadora e a proposta de
 * mão de obra —, e não numa tela de administração à parte: quem monta o preço
 * é quem sabe quanto custa a hora de cada função. Sem isto na proposta, a
 * pessoa via "Eletricista (sem custo)" no seletor e não tinha por onde
 * resolver.
 *
 * `padroesEmpresa` é o que vai gravado como imposto/margem PADRÃO da conta. A
 * API exige os três campos juntos, então quem chama precisa dizer o que
 * preservar: a calculadora manda as taxas da tela (comportamento dela desde
 * sempre); a proposta manda os padrões que carregou, para um ajuste pontual de
 * imposto numa proposta não virar o novo padrão da empresa em silêncio.
 */
export function CatalogoFuncoes({ funcoes, onFuncoes, padroesEmpresa, abertoInicialmente }: {
  funcoes: Funcao[];
  onFuncoes: (f: Funcao[]) => void;
  padroesEmpresa: { imposto: number; margem: number };
  abertoInicialmente?: boolean;
}) {
  const [salvando, setSalvando] = useState(false);
  const [salvou, setSalvou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Texto digitado no R$/h — ver o comentário no `onChange`. */
  const [textos, setTextos] = useState<Record<string, string>>({});
  /* O bloco guarda a edição até alguém clicar em Salvar: quem digita seis
     custos-hora e fecha a aba perde tudo em silêncio. A pendência é DAQUI, e
     não do pai, porque é aqui que o "Salvar funções" mora. */
  const edicao = useEdicaoPendente();

  /** Toda alteração local passa por aqui — marca a pendência e delega ao pai. */
  const editar = (lista: Funcao[]) => {
    edicao.marcarEditado();
    onFuncoes(lista);
  };

  const semCusto = funcoes.filter((f) => f.custoHora <= 0).length;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvou(false);
    try {
      const r = await fetch("/api/mao-de-obra", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Linha em branco é rascunho de quem clicou em acrescentar e desistiu.
          funcoes: funcoes.filter((f) => f.nome.trim() !== ""),
          impostoPadrao: padroesEmpresa.imposto,
          margemPadrao: padroesEmpresa.margem,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar.");
      onFuncoes(d.config.funcoes ?? []);
      edicao.marcarSalvo();
      setSalvou(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar as funções.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <details className="group rounded-lg border border-slate-200 dark:border-slate-700" open={abertoInicialmente ?? funcoes.length === 0}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-700/50">
        <span className="flex items-center gap-2">
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-90" aria-hidden />
          <span className="font-medium text-gta-navy dark:text-slate-100">Funções e custo por hora</span>
        </span>
        <span className="hint">
          {funcoes.length} {funcoes.length === 1 ? "função" : "funções"}
          {semCusto > 0 && ` · ${semCusto} sem custo`}
        </span>
      </summary>

      <div className="border-t border-slate-200 p-3 dark:border-slate-700">
        {erro && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Função</th>
                <th className="w-44">Custo por hora</th>
                <th className="w-16 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {funcoes.map((f) => (
                <tr key={f.id}>
                  <td>
                    <input
                      className="field-input !py-1.5"
                      value={f.nome}
                      placeholder="Ex.: Eletricista"
                      aria-label="Nome da função"
                      onChange={(e) => editar(funcoes.map((x) => (x.id === f.id ? { ...x, nome: e.target.value } : x)))}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="hint shrink-0">R$</span>
                      <input
                        className="field-input !py-1.5 tabular-nums"
                        inputMode="decimal"
                        aria-label={`Custo por hora de ${f.nome || "função sem nome"}`}
                        value={textos[f.id] ?? (f.custoHora > 0 ? String(f.custoHora).replace(".", ",") : "")}
                        placeholder="0,00"
                        onChange={(e) => {
                          // O que fica na tela é o que foi digitado; o número
                          // acompanha. Controlar o campo pelo número come a
                          // vírgula assim que ela é digitada, e o zero à direita
                          // junto.
                          const digitado = e.target.value;
                          setTextos((t) => ({ ...t, [f.id]: digitado }));
                          editar(funcoes.map((x) => (x.id === f.id ? { ...x, custoHora: paraNumero(digitado) } : x)));
                        }}
                      />
                      {f.custoHora <= 0 && <Badge tone="amber">sem custo</Badge>}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remover ${f.nome || "função sem nome"}`}
                      onClick={() => editar(funcoes.filter((x) => x.id !== f.id))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              // `randomUUID` para o id NUNCA colidir com o de uma função
              // apagada — uma proposta antiga apontaria para o custo errado.
              editar([...funcoes, { id: crypto.randomUUID(), nome: "", custoHora: 0 }])
            }
          >
            <Plus className="h-4 w-4" aria-hidden /> Acrescentar função
          </button>
          <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar funções"}
          </button>
          {salvou && <span className="hint">Salvo.</span>}
          <span className="hint">Vale para toda a plataforma — calculadora e propostas.</span>
        </div>
      </div>
    </details>
  );
}

function paraNumero(txt: string): number {
  const n = Number(String(txt ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
