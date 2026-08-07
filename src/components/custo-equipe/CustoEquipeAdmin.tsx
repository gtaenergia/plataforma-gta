"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, SectionCard } from "@/components/ui";
import { precisaRevisao, type ConfigCustoEquipe } from "@/lib/custo-equipe/types";

/**
 * Custo-hora da equipe interna, dentro da tela de Planejamento.
 *
 * Mora junto da jornada porque é a mesma lista de gente, e quem cadastra uma
 * normalmente cadastra a outra. Mas o DADO vem de outra chave e outra rota:
 * `/api/planejamento` é aberta a qualquer autenticado, e custo-hora dividido
 * por horas é salário.
 *
 * O bloco simplesmente NÃO EXISTE para quem não tem `financeiro.ver` — a rota
 * responde 403 e o componente não renderiza nada. Nenhum valor chega ao
 * navegador para ser escondido por CSS.
 *
 * ## Hook + tabela, e por que deixou de ter botão próprio
 *
 * A gravação continua separada — são dois destinos, e uma escrita não pode
 * depender do sucesso da outra. Mas isso é razão de ARQUITETURA, e virou dois
 * botões de "Salvar" na mesma tela, que é uma pergunta que ninguém deveria
 * precisar responder: "qual dos dois salva o que eu mexi?".
 *
 * Agora a tela tem um botão só. Ele dispara as duas gravações em paralelo e
 * relata cada uma — a independência continua inteira, e some da cara de quem
 * usa. Ver `salvarTudo` em PlanejamentoAdmin.
 */

function paraTexto(v: number): string {
  return v > 0 ? String(v).replace(".", ",") : "";
}

/** Texto inicial de cada campo, a partir do que veio do servidor. */
function semearTextos(config: ConfigCustoEquipe): Record<string, string> {
  const t: Record<string, string> = {};
  for (const [email, p] of Object.entries(config.pessoas ?? {})) t[email] = paraTexto(p.custoHora);
  return t;
}
function paraNumero(txt: string): number {
  const n = Number(txt.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export interface EstadoCustoEquipe {
  /** Falso quando a rota respondeu 403 — o bloco inteiro deixa de existir. */
  visivel: boolean;
  config: ConfigCustoEquipe | null;
  /**
   * O TEXTO digitado em cada campo, separado do número.
   *
   * O campo era controlado direto pelo número, e a vírgula não sobrevivia: ao
   * digitar "30," o valor virava 30, voltava formatado como "30", e a vírgula
   * sumia no mesmo instante. É o padrão que o resto da plataforma já usa.
   */
  textos: Record<string, string>;
  alterar: (email: string, valor: string) => void;
  /** Há edição pendente de gravação. */
  sujo: boolean;
  /** Grava. Devolve erro em texto, ou null quando deu certo. */
  salvar: () => Promise<string | null>;
  erroCarga: string | null;
}

export function useCustoEquipe(): EstadoCustoEquipe {
  const [config, setConfig] = useState<ConfigCustoEquipe | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [sujo, setSujo] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/custo-equipe");
        if (r.status === 403 || r.status === 401) return; // some da tela, sem alarde
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar.");
        setConfig(d.config);
        setTextos(semearTextos(d.config));
        setVisivel(true);
      } catch (e) {
        setErroCarga(e instanceof Error ? e.message : "Erro ao carregar o custo da equipe.");
      }
    })();
  }, []);

  function alterar(email: string, valor: string) {
    setSujo(true);
    // O que fica na tela é exatamente o que foi digitado; o número acompanha.
    setTextos((t) => ({ ...t, [email]: valor }));
    setConfig((c) =>
      c
        ? { pessoas: { ...c.pessoas, [email]: { ...c.pessoas[email], custoHora: paraNumero(valor) } } }
        : c,
    );
  }

  async function salvar(): Promise<string | null> {
    if (!visivel || !config) return null; // nada a gravar: o bloco não existe
    try {
      const r = await fetch("/api/custo-equipe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar.");
      setConfig(d.config);
      setSujo(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Erro ao salvar os custos.";
    }
  }

  return { visivel, config, textos, alterar, sujo, salvar, erroCarga };
}

export function CustoEquipeTabela({
  estado,
  usuarios,
}: {
  estado: EstadoCustoEquipe;
  usuarios: { email: string; name: string }[];
}) {
  if (!estado.visivel || !estado.config) return null;
  const config = estado.config;

  const agora = Date.now();
  const semCusto = usuarios.filter((u) => !(config.pessoas[u.email]?.custoHora > 0)).length;
  const antigos = usuarios.filter((u) => {
    const p = config.pessoas[u.email];
    return p && precisaRevisao(p, agora);
  }).length;

  return (
    <SectionCard
      title="Custo por hora da equipe"
      subtitle="Quanto custa para a GTA cada hora trabalhada. Alimenta o custo administrativo dos orçamentos e não aparece para quem não tem permissão financeira."
    >
      {estado.erroCarga && <Alert tone="red" className="mb-4">{estado.erroCarga}</Alert>}

      {semCusto > 0 && (
        <Alert tone="amber" className="mb-4">
          {semCusto === 1 ? "Uma pessoa está" : `${semCusto} pessoas estão`} sem custo cadastrado. O
          orçamento que usar as horas dela sai por baixo do custo real.
        </Alert>
      )}
      {antigos > 0 && (
        <Alert tone="indigo" className="mb-4">
          {antigos === 1 ? "Um valor não é revisado" : `${antigos} valores não são revisados`} há mais
          de seis meses. Salário muda, e um custo antigo não dá erro — só produz preço errado.
        </Alert>
      )}

      {usuarios.length === 0 ? (
        <EmptyState>Nenhum usuário ativo.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th className="w-44">Custo por hora</th>
                <th className="w-40">Última revisão</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const p = config.pessoas[u.email];
                return (
                  <tr key={u.email}>
                    <td>
                      <div className="font-medium text-gta-navy dark:text-slate-100">{u.name || u.email}</div>
                      <div className="hint">{u.email}</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="hint shrink-0">R$</span>
                        <input
                          className="field-input !py-1.5 tabular-nums"
                          inputMode="decimal"
                          aria-label={`Custo por hora de ${u.name || u.email}`}
                          value={estado.textos[u.email] ?? paraTexto(p?.custoHora ?? 0)}
                          placeholder="0,00"
                          onChange={(e) => estado.alterar(u.email, e.target.value)}
                        />
                      </div>
                    </td>
                    <td>
                      {!p || p.custoHora <= 0 ? (
                        <Badge tone="amber">sem custo</Badge>
                      ) : precisaRevisao(p, agora) ? (
                        <Badge tone="indigo">revisar</Badge>
                      ) : (
                        <span className="hint tabular-nums">
                          {p.atualizadoEm ? new Date(p.atualizadoEm).toLocaleDateString("pt-BR") : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
