"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Kpi, KpiGrid, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { comporProposta, equipeFormaPreco } from "@/lib/custo-equipe/composicao";
import { lerHoras, sugerirCustoInterno } from "@/lib/custo-equipe/sugestao";
import { tipoSugeridoDoServico } from "@/lib/custo-equipe/servico-demanda";
import { custoDaEquipe } from "@/lib/mao-de-obra/motor";
import { acharTipo } from "@/lib/capacidade/motor";
import type { ConfigCapacidade } from "@/lib/capacidade/types";
import type { LinhaEquipe } from "@/lib/mao-de-obra/types";

/**
 * Quem da GTA vai executar este trabalho, e quanto isso custa.
 *
 * ## Por que hook + cartão, e não um componente só
 *
 * Nos serviços de Fator K o custo da equipe entra na base ANTES do markup —
 * então o configurador precisa do número para chamar o próprio engine, e o
 * cartão precisa do preço que o engine devolveu. Um componente único que
 * guardasse tudo criaria uma volta: preço depende do custo, cartão depende do
 * preço.
 *
 * O hook guarda o estado e entrega o custo; o configurador calcula o preço com
 * ele e devolve os números para o cartão desenhar. Sem ciclo.
 *
 * ## Some inteiro sem `financeiro.ver`
 *
 * A rota `/api/custo-equipe` responde 403, e o hook devolve `visivel: false`.
 * Nenhum R$/h chega ao navegador de quem não pode ver — não é CSS escondendo
 * valor que já veio.
 */

/** O que a proposta guarda para reabrir igual. */
export interface EquipeSalva {
  tipoId: string;
  linhas: { email: string; horas: string }[];
}

interface LinhaTexto {
  email: string;
  /** Texto, não número: "1,5" precisa sobreviver enquanto está sendo digitado. */
  horas: string;
}

export interface EstadoEquipe {
  visivel: boolean;
  carregando: boolean;
  capacidade: ConfigCapacidade | null;
  usuarios: { email: string; name: string }[];
  custos: Record<string, number>;
  linhas: LinhaTexto[];
  setLinhas: (l: LinhaTexto[]) => void;
  tipoId: string;
  escolherTipo: (id: string) => void;
  /** O que somar na base de custo do engine, em REAIS. Zero quando invisível. */
  custoEquipe: number;
  /** As linhas já em forma de domínio (horas numéricas). */
  linhasDominio: LinhaEquipe[];
  avisoTipo: string | null;
  servicoKey: string;
  /** Para guardar na proposta — ver `restaurar`. */
  serializar: () => EquipeSalva;
  /**
   * Repõe o que foi guardado ao reabrir uma proposta.
   *
   * Sem isto, reabrir uma proposta de Fator K perderia quem executa, e o preço
   * SUGERIDO cairia para o valor sem equipe. O valor gravado continuaria na
   * tela (é campo do formulário), mas qualquer mexida recalcularia por baixo.
   */
  restaurar: (v: EquipeSalva | undefined) => void;
  /** Alíquota padrão da plataforma, para o serviço que não tem a sua. */
  impostoPadrao: number;
}

export function useEquipeResponsavel(opcoes: { servicoKey: string; criadoPor?: string }): EstadoEquipe {
  const { servicoKey, criadoPor } = opcoes;
  const [visivel, setVisivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [capacidade, setCapacidade] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<{ email: string; name: string }[]>([]);
  const [custos, setCustos] = useState<Record<string, number>>({});
  const [linhas, setLinhas] = useState<LinhaTexto[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [avisoTipo, setAvisoTipo] = useState<string | null>(null);
  const [impostoPadrao, setImpostoPadrao] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [rCusto, rCap, rUsr, rMo] = await Promise.all([
          fetch("/api/custo-equipe"),
          fetch("/api/planejamento"),
          fetch("/api/usuarios"),
          fetch("/api/mao-de-obra"),
        ]);
        // O 403 aqui é a permissão falando, e é o único sinal que importa:
        // sem ele o bloco não existe.
        if (!rCusto.ok) return;
        const [dCusto, dCap, dUsr, dMo] = await Promise.all([rCusto.json(), rCap.json(), rUsr.json(), rMo.json()]);
        if (!vivo) return;
        /* Serviço sem alíquota própria (projeto BT, os simples) usa a da
           plataforma. Mostrar "Imposto (0%)" seria pior que não mostrar. */
        if (rMo.ok && dMo.config?.impostoPadrao != null) setImpostoPadrao(dMo.config.impostoPadrao);

        const mapa: Record<string, number> = {};
        for (const [email, p] of Object.entries(dCusto.config?.pessoas ?? {})) {
          mapa[email] = (p as { custoHora: number }).custoHora ?? 0;
        }
        setCustos(mapa);
        setUsuarios(dUsr.usuarios ?? []);
        if (rCap.ok) setCapacidade(dCap.config);
        setVisivel(true);
      } catch {
        /* sem bloco; o configurador segue funcionando como antes */
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /*
   * Semente: o tipo que o serviço costuma consumir, com as horas do catálogo
   * na pessoa que está gerando. Só depois que a configuração chega — antes
   * disso não há catálogo de onde tirar hora nenhuma.
   */
  useEffect(() => {
    if (!capacidade || !visivel || linhas.length > 0) return;
    const sugerido = tipoSugeridoDoServico(servicoKey);
    if (!sugerido) {
      // Serviço sem tipo natural: linha vazia e a pessoa escolhe. Ver o
      // comentário em servico-demanda.ts sobre por que não chutamos.
      setLinhas([{ email: criadoPor ?? "", horas: "" }]);
      setAvisoTipo("Este serviço não tem um tipo de demanda equivalente no catálogo. Escolha o que representa o trabalho, ou informe as horas à mão.");
      return;
    }
    const tipo = acharTipo(capacidade, sugerido.categoria, sugerido.nome);
    if (!tipo) {
      setLinhas([{ email: criadoPor ?? "", horas: "" }]);
      return;
    }
    aplicar(tipo.id, capacidade);
  }, [capacidade, visivel]); // eslint-disable-line react-hooks/exhaustive-deps

  function aplicar(id: string, cfg: ConfigCapacidade) {
    setTipoId(id);
    if (!id) {
      setLinhas([{ email: criadoPor ?? "", horas: "" }]);
      setAvisoTipo(null);
      return;
    }
    const s = sugerirCustoInterno({ config: cfg, tipoId: id, responsavel: criadoPor ?? "" });
    setAvisoTipo(
      s.origem === "sem_duracao"
        ? "Este tipo ainda não tem duração cadastrada em Planejamento e capacidade. Informe as horas à mão, ou cadastre a duração para as próximas propostas."
        : null,
    );
    setLinhas(s.linhas.map((l) => ({ email: l.email, horas: l.horas > 0 ? String(l.horas).replace(".", ",") : "" })));
  }

  const linhasDominio = useMemo(
    () => linhas.filter((l) => l.email && lerHoras(l.horas) > 0).map((l) => ({ email: l.email, horas: lerHoras(l.horas) })),
    [linhas],
  );

  const custoEquipe = useMemo(
    () => (visivel ? custoDaEquipe(linhasDominio, custos).custoCent / 100 : 0),
    [visivel, linhasDominio, custos],
  );

  return {
    visivel,
    carregando,
    capacidade,
    usuarios,
    custos,
    linhas,
    setLinhas,
    tipoId,
    escolherTipo: (id) => capacidade && aplicar(id, capacidade),
    custoEquipe,
    linhasDominio,
    avisoTipo,
    servicoKey,
    impostoPadrao,
    serializar: () => ({ tipoId, linhas }),
    restaurar: (v) => {
      if (!v || !Array.isArray(v.linhas)) return;
      setTipoId(v.tipoId ?? "");
      // Sem passar por `aplicar`: o catálogo pode ter mudado de duração desde
      // que a proposta foi salva, e a proposta vale pelas horas que ELA
      // guardou, não pelas de hoje.
      setLinhas(v.linhas.map((l) => ({ email: String(l.email ?? ""), horas: String(l.horas ?? "") })));
    },
  };
}

const moeda = (cent: number) => (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function EquipeResponsavelCard({
  estado,
  precoCent,
  precoSemEquipeCent,
  custoConfiguradorCent,
  imposto,
}: {
  estado: EstadoEquipe;
  precoCent: number;
  precoSemEquipeCent: number;
  custoConfiguradorCent: number;
  /** Ausente = o serviço não tem alíquota própria; cai na da plataforma. */
  imposto?: number;
}) {
  if (!estado.visivel) return null;
  const aliq = imposto ?? estado.impostoPadrao;
  if (estado.carregando) {
    return (
      <div className="section-card">
        <Loading>Carregando o custo da equipe…</Loading>
      </div>
    );
  }

  const c = comporProposta({
    linhas: estado.linhasDominio,
    custos: estado.custos,
    precoCent,
    precoSemEquipeCent,
    custoConfiguradorCent,
    imposto: aliq,
  });

  const formaPreco = equipeFormaPreco(estado.servicoKey);
  const nomeDe = (email: string) => estado.usuarios.find((u) => u.email === email)?.name || email;
  const semCusto = estado.linhasDominio.filter((l) => !(estado.custos[l.email] > 0)).map((l) => nomeDe(l.email));

  function alterar(i: number, patch: Partial<LinhaTexto>) {
    estado.setLinhas(estado.linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="section-card">
      <h2 className="section-title">Equipe responsável</h2>
      <p className="hint mt-1">
        {formaPreco
          ? "As horas da GTA entram no custo antes do Fator K — escolher quem executa muda o preço."
          : "As horas da GTA neste trabalho. O preço vem da tabela do serviço e não muda; isto mede se ele vale a pena."}{" "}
        Nada disto vai para a proposta do cliente.
      </p>

      {estado.avisoTipo && <Alert tone="amber" className="mt-4">{estado.avisoTipo}</Alert>}
      {semCusto.length > 0 && (
        <Alert tone="amber" className="mt-4">
          {semCusto.length === 1 ? `${semCusto[0]} está` : `${semCusto.join(", ")} estão`} sem custo por
          hora cadastrado. O custo abaixo sai por baixo do real.
        </Alert>
      )}
      {c.prejuizo && (
        <Alert tone="red" className="mt-4" titulo="O preço não cobre o custo">
          Depois do imposto e do custo da equipe, sobra {moeda(c.lucroCent)}. Dá para gerar a proposta
          assim; só não dá para dizer que ela vale a pena.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo label="Tipo de demanda" hint={<p className="hint mt-1">Preenche as horas pelo catálogo</p>}>
          <select
            className="field-input"
            value={estado.tipoId}
            onChange={(e) => estado.escolherTipo(e.target.value)}
          >
            <option value="">Escolher…</option>
            {(estado.capacidade?.tipos ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.categoria} · {t.nome}
                {t.minutos > 0 ? ` (${String(t.minutos / 60).replace(".", ",")} h)` : " — sem duração"}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="mt-4 space-y-2">
        {estado.linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <Campo className="sm:col-span-7" label={i === 0 ? "Quem executa" : ""}>
              <select className="field-input" value={l.email} onChange={(e) => alterar(i, { email: e.target.value })}>
                <option value="">Escolher…</option>
                {estado.usuarios.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name || u.email}
                    {estado.custos[u.email] > 0 ? "" : " — sem R$/h"}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo className="sm:col-span-4" label={i === 0 ? "Horas" : ""} hint={i === 0 ? <p className="hint mt-1">Aceita &quot;44 x 4,8&quot;</p> : undefined}>
              <input
                className="field-input tabular-nums"
                inputMode="decimal"
                value={l.horas}
                placeholder="0"
                aria-label={`Horas de ${nomeDe(l.email) || `linha ${i + 1}`}`}
                onChange={(e) => alterar(i, { horas: e.target.value })}
              />
            </Campo>
            <div className="flex items-end sm:col-span-1">
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remover linha ${i + 1}`}
                onClick={() =>
                  estado.setLinhas(
                    estado.linhas.length > 1 ? estado.linhas.filter((_, j) => j !== i) : [{ email: "", horas: "" }],
                  )
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-ghost mt-2"
        onClick={() => estado.setLinhas([...estado.linhas, { email: "", horas: "" }])}
      >
        <Plus className="h-4 w-4" aria-hidden /> Acrescentar pessoa
      </button>

      {/* O detalhamento que o dono pediu: cada parcela nomeada, não só o total. */}
      <div className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-gta-navy dark:text-slate-100">Detalhamento</h3>
          {c.acrescimoCent !== 0 && <Badge tone="indigo">preço {c.acrescimoCent > 0 ? "+" : "−"}{moeda(Math.abs(c.acrescimoCent))}</Badge>}
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <tbody>
              {estado.linhasDominio.map((l) => (
                <tr key={l.email}>
                  <td>
                    {nomeDe(l.email)}
                    <span className="hint">
                      {" "}
                      · {String(l.horas).replace(".", ",")} h ×{" "}
                      {(estado.custos[l.email] ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/h
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{moeda(Math.round(l.horas * (estado.custos[l.email] ?? 0) * 100))}</td>
                </tr>
              ))}
              <tr>
                <td className="font-medium">Custo da equipe GTA</td>
                <td className="text-right font-medium tabular-nums">{moeda(c.custoEquipeCent)}</td>
              </tr>
              {c.custoConfiguradorCent > 0 && (
                <tr>
                  <td>Materiais e instalação</td>
                  <td className="text-right tabular-nums">{moeda(c.custoConfiguradorCent)}</td>
                </tr>
              )}
              <tr>
                <td>Imposto ({pct(aliq)})</td>
                <td className="text-right tabular-nums">{moeda(c.impostoCent)}</td>
              </tr>
              <tr>
                <td>Lucro</td>
                <td className="text-right tabular-nums">{moeda(c.lucroCent)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <KpiGrid className="mt-4">
          <Kpi label="Custo total" value={moeda(c.custoTotalCent)} />
          <Kpi label="Preço ao cliente" value={moeda(c.precoCent)} destaque />
          <Kpi
            label="Margem líquida"
            value={pct(c.margem)}
            tone={c.margem < 0 ? "red" : c.margem < 0.15 ? "amber" : "green"}
          />
        </KpiGrid>
      </div>
    </div>
  );
}
