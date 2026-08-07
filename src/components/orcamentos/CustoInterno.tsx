"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { lerHoras, sugerirCustoInterno } from "@/lib/custo-equipe/sugestao";
import type { ConfigCapacidade } from "@/lib/capacidade/types";
import type { Orcamento } from "@/lib/orcamentos/types";

/**
 * Custo administrativo do orçamento: as horas da PRÓPRIA equipe.
 *
 * Mora aqui, e não em cada configurador, porque o áudio diz o lugar: "na hora
 * que a gente for precificar qualquer coisa, e aí isso é na aba de orçamentos,
 * todo o custo nosso administrativo da GTA tem que entrar na jogada". Uma
 * implementação serve aos treze serviços.
 *
 * As horas vêm sugeridas do catálogo de demandas — que já existe e já guarda
 * quanto tempo cada trabalho consome. Sugestão, nunca imposição: o catálogo dá
 * a média e o trabalho de hoje pode ser o dobro.
 */

const moeda = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

interface Linha {
  email: string;
  horas: string;
}

export function CustoInterno({
  orcamento,
  onAtualizado,
}: {
  orcamento: Orcamento;
  onAtualizado: (o: Orcamento) => void;
}) {
  const [capacidade, setCapacidade] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<{ email: string; name: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [rc, ru] = await Promise.all([fetch("/api/planejamento"), fetch("/api/usuarios")]);
        const [dc, du] = await Promise.all([rc.json(), ru.json()]);
        if (rc.ok) setCapacidade(dc.config);
        if (ru.ok) setUsuarios(du.usuarios ?? []);
      } catch {
        /* a tela abre vazia e o aviso abaixo explica */
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const custoAdm = orcamento.ficha?.custoAdministrativo ?? 0;
  const custoTer = orcamento.ficha?.custoTerceirizado ?? 0;
  const preco = orcamento.valor ?? 0;
  const impostoPct = orcamento.ficha?.impostosPct ?? 0;
  const custoTotal = custoAdm + custoTer;
  const imposto = preco * impostoPct;
  const lucro = preco - custoTotal - imposto;

  const tiposComDuracao = useMemo(
    () => (capacidade?.tipos ?? []).filter((t) => t.minutos > 0).length,
    [capacidade],
  );

  function aplicarSugestao(id: string) {
    setTipoId(id);
    setAviso(null);
    if (!capacidade || !id) return;
    const s = sugerirCustoInterno({
      config: capacidade,
      tipoId: id,
      responsavel: orcamento.criadoPor,
    });
    if (s.origem === "sem_duracao") {
      setAviso(
        "Este tipo de demanda ainda não tem duração cadastrada em Planejamento e capacidade. Informe as horas à mão, ou cadastre a duração para os próximos.",
      );
    }
    setLinhas(s.linhas.map((l) => ({ email: l.email, horas: l.horas > 0 ? String(l.horas).replace(".", ",") : "" })));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/orcamentos/${orcamento.id}/custo-interno`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhas: linhas
            .filter((l) => l.email && lerHoras(l.horas) > 0)
            .map((l) => ({ email: l.email, horas: lerHoras(l.horas) })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Falha ao salvar.");
      onAtualizado(d.orcamento);
      setAviso(d.incompleta ? "Alguma pessoa usada está sem custo por hora cadastrado." : null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <div className="section-card"><Loading /></div>;

  const nomeDe = (email: string) => usuarios.find((u) => u.email === email)?.name || email;

  return (
    <div className="section-card">
      <h2 className="section-title">Custo administrativo</h2>
      <p className="hint mt-1">
        Horas da própria equipe neste trabalho. Não vai para a proposta do cliente e não altera o
        preço — serve para medir se ele vale a pena.
      </p>

      {erro && <Alert tone="red" className="mt-4">{erro}</Alert>}
      {aviso && <Alert tone="amber" className="mt-4">{aviso}</Alert>}

      {tiposComDuracao === 0 && (
        <Alert tone="indigo" className="mt-4" titulo="O catálogo de demandas está sem durações">
          Nenhum tipo tem quantas horas consome. Preenchendo isso em Planejamento e capacidade, as
          horas passam a vir sugeridas aqui.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Tipo de demanda" hint={<p className="hint mt-1">Preenche as horas pelo catálogo</p>}>
          <select className="field-input" value={tipoId} onChange={(e) => aplicarSugestao(e.target.value)}>
            <option value="">Escolher…</option>
            {(capacidade?.tipos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.categoria} — {t.nome}
                {t.minutos > 0 ? ` (${(t.minutos / 60).toLocaleString("pt-BR")} h)` : " (sem duração)"}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="mt-4 space-y-3">
        {linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <Campo className="sm:col-span-6" label={i === 0 ? "Quem" : ""}>
              <select
                className="field-input"
                value={l.email}
                onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
              >
                <option value="">Selecione…</option>
                {usuarios.map((u) => (
                  <option key={u.email} value={u.email}>{u.name || u.email}</option>
                ))}
              </select>
            </Campo>
            <Campo
              className="sm:col-span-5"
              label={i === 0 ? "Horas" : ""}
              hint={i === 0 ? <p className="hint mt-1">Total de horas. Para dias × horas por dia, escreva 44 x 4,8</p> : undefined}
            >
              <input
                className="field-input tabular-nums"
                inputMode="text"
                value={l.horas}
                placeholder="0"
                onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))}
              />
            </Campo>
            <div className="flex items-end sm:col-span-1">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                aria-label={`Remover ${nomeDe(l.email) || `linha ${i + 1}`}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-secondary mt-3"
        onClick={() => setLinhas((ls) => [...ls, { email: orcamento.criadoPor, horas: "" }])}
      >
        <Plus className="h-4 w-4" aria-hidden /> Acrescentar pessoa
      </button>

      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-slate-600 dark:text-slate-400">Preço</dt>
          <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(preco)}</dd>
          <dt className="text-slate-600 dark:text-slate-400">Custo terceirizado</dt>
          <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(custoTer)}</dd>
          <dt className="text-slate-600 dark:text-slate-400">Custo interno</dt>
          <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(custoAdm)}</dd>
          <dt className="text-slate-600 dark:text-slate-400">Imposto</dt>
          <dd className="tabular-nums text-slate-700 dark:text-slate-300">{moeda(imposto)}</dd>
          <dt className="text-slate-600 dark:text-slate-400">Lucro</dt>
          <dd className="font-medium tabular-nums">
            <span className={lucro < 0 ? "text-red-700 dark:text-red-400" : "text-gta-navy dark:text-slate-100"}>
              {moeda(lucro)}
            </span>
            {preco > 0 && <span className="ml-2 hint">{pct(lucro / preco)}</span>}
          </dd>
        </dl>

        {preco > 0 && lucro < 0 && (
          <Alert tone="red" className="mt-4" titulo="Este trabalho dá prejuízo">
            O custo somado ao imposto passa do preço. É exatamente a conta que o dono quis ver: o
            custo com gente interna precisa valer a pena perto do faturamento.
          </Alert>
        )}
        {custoTotal === 0 && <Badge tone="amber">custo ainda não informado</Badge>}
      </div>

      <div className="mt-4">
        <button type="button" className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar custo interno"}
        </button>
      </div>
    </div>
  );
}
