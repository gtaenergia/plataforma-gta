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
 * Gravação própria, separada da jornada, pelo mesmo motivo: são dois destinos
 * distintos, e um salvamento único faria uma escrita depender do sucesso da
 * outra.
 */

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function paraTexto(v: number): string {
  return v > 0 ? String(v).replace(".", ",") : "";
}
function paraNumero(txt: string): number {
  const n = Number(txt.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function CustoEquipeAdmin({ usuarios }: { usuarios: { email: string; name: string }[] }) {
  const [config, setConfig] = useState<ConfigCustoEquipe | null>(null);
  const [permitido, setPermitido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/custo-equipe");
        if (r.status === 403 || r.status === 401) return; // some da tela, sem alarde
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Falha ao carregar.");
        setConfig(d.config);
        setPermitido(true);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar o custo da equipe.");
      }
    })();
  }, []);

  if (!permitido || !config) return null;

  const agora = Date.now();
  const semCusto = usuarios.filter((u) => !(config.pessoas[u.email]?.custoHora > 0)).length;
  const antigos = usuarios.filter((u) => {
    const p = config.pessoas[u.email];
    return p && precisaRevisao(p, agora);
  }).length;

  function alterar(email: string, valor: string) {
    setOk(false);
    setConfig((c) =>
      c
        ? {
            pessoas: {
              ...c.pessoas,
              [email]: { ...c.pessoas[email], custoHora: paraNumero(valor) },
            },
          }
        : c,
    );
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setErro(null);
    setOk(false);
    try {
      const r = await fetch("/api/custo-equipe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
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

  return (
    <SectionCard
      title="Custo por hora da equipe"
      subtitle="Quanto custa para a GTA cada hora trabalhada. Alimenta o custo administrativo dos orçamentos e não aparece para quem não tem permissão financeira."
    >
      {erro && <Alert tone="red" className="mb-4">{erro}</Alert>}
      {ok && <Alert tone="green" className="mb-4">Custos salvos.</Alert>}

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
                          value={paraTexto(p?.custoHora ?? 0)}
                          placeholder="0,00"
                          onChange={(e) => alterar(u.email, e.target.value)}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar custos"}
        </button>
        <span className="hint">
          Botão próprio: estes valores são gravados separados da jornada, em outro destino.
        </span>
      </div>

      <p className="hint mt-3">
        Exemplo: {moeda(30.3)} por hora × 44 h de acompanhamento = {moeda(30.3 * 44)} de custo
        administrativo no orçamento.
      </p>
    </SectionCard>
  );
}
