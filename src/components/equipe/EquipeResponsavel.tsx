"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Kpi, KpiGrid, Loading } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { Combobox } from "@/components/Combobox";
import { comporProposta, equipeFormaPreco } from "@/lib/custo-equipe/composicao";
import { lerHoras, sugerirCustoInterno } from "@/lib/custo-equipe/sugestao";
import { tipoSugeridoDoServico, type Escopo } from "@/lib/custo-equipe/servico-demanda";
import { custoDaEquipe } from "@/lib/mao-de-obra/motor";
import { acharTipo } from "@/lib/capacidade/motor";
import type { ConfigCapacidade } from "@/lib/capacidade/types";
import type { LinhaEquipe } from "@/lib/mao-de-obra/types";

/**
 * Quem da GTA gasta hora nesta proposta, e quanto isso custa.
 *
 * São DOIS apontamentos, porque são dois custos de naturezas diferentes:
 *
 * - **Equipe responsável** — quem vai executar o projeto vendido.
 * - **Custo de elaboração** — o tempo gasto para MONTAR esta proposta. Existe
 *   mesmo quando o cliente não fecha, e era o custo invisível da casa: toda
 *   proposta consome horas de gente, e ninguém contava.
 *
 * O mesmo hook serve aos dois; muda o `escopo`, que decide de qual categoria do
 * catálogo vêm as horas sugeridas.
 *
 * ## Por que hook + cartão, e não um componente só
 *
 * Nos serviços de Fator K o custo entra na base ANTES do markup — então o
 * configurador precisa do número para chamar o próprio engine, e o
 * detalhamento precisa do preço que o engine devolveu. Um componente único que
 * guardasse tudo criaria uma volta: preço depende do custo, cartão depende do
 * preço.
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
  /**
   * Tipo escrito à mão, válido SÓ nesta proposta.
   *
   * Trabalho que não tem equivalente no catálogo é rotina — e antes disso
   * existir a tela dizia "não há tipo equivalente" e parava ali, deixando a
   * pessoa sem saída a não ser escolher um tipo errado. O avulso não entra no
   * catálogo de propósito: cadastrar um tipo é decisão de planejamento, não
   * efeito colateral de escrever numa proposta.
   */
  tipoLivre?: string;
  linhas: { email: string; horas: string }[];
}

/** Como o tipo do catálogo aparece na lista e fica guardado. */
export function rotuloDoTipo(t: { categoria: string; nome: string }): string {
  return `${t.categoria} · ${t.nome}`;
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
  /** O rótulo no campo: do catálogo ou o avulso escrito à mão. */
  tipoEscolhido: string;
  /** Escolhe pelo rótulo; o que não estiver no catálogo vira avulso. */
  escolherPorRotulo: (rotulo: string) => void;
  /** O que somar na base de custo do engine, em REAIS. Zero quando invisível. */
  custoEquipe: number;
  linhasDominio: LinhaEquipe[];
  avisoTipo: string | null;
  servicoKey: string;
  escopo: Escopo;
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

export function useEquipeResponsavel(opcoes: {
  servicoKey: string;
  criadoPor?: string;
  /** `projeto` = quem executa; `orcamento` = quem montou a proposta. */
  escopo?: Escopo;
}): EstadoEquipe {
  const { servicoKey, criadoPor } = opcoes;
  const escopo = opcoes.escopo ?? "projeto";
  const [visivel, setVisivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [capacidade, setCapacidade] = useState<ConfigCapacidade | null>(null);
  const [usuarios, setUsuarios] = useState<{ email: string; name: string }[]>([]);
  const [custos, setCustos] = useState<Record<string, number>>({});
  const [linhas, setLinhas] = useState<LinhaTexto[]>([]);
  const [tipoId, setTipoId] = useState("");
  /** Tipo escrito à mão — vale só nesta proposta e não vai ao catálogo. */
  const [tipoLivre, setTipoLivre] = useState("");
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
   * Semente: o tipo que o serviço costuma consumir naquele escopo, com as horas
   * do catálogo na pessoa que está gerando. Só depois que a configuração chega
   * — antes disso não há catálogo de onde tirar hora nenhuma.
   */
  useEffect(() => {
    if (!capacidade || !visivel || linhas.length > 0) return;
    const sugerido = tipoSugeridoDoServico(servicoKey, escopo);
    if (!sugerido) {
      /* Sem tipo natural, a pessoa escolhe na lista ou escreve o dela. Aqui
         havia um aviso em âmbar dizendo que o catálogo não tinha equivalente —
         uma parede onde devia haver saída, porque não oferecia nenhuma. Quem o
         lia ou escolhia um tipo errado ou deixava em branco. */
      setLinhas([{ email: criadoPor ?? "", horas: "" }]);
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
    setTipoLivre("");
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

  /**
   * Escolha pelo RÓTULO, que é o que a pessoa vê e digita.
   *
   * Casa com o catálogo pelo texto; o que não casar é avulso desta proposta —
   * sem duração para sugerir, então as horas vão à mão. Não vira item do
   * catálogo: cadastrar tipo é decisão de planejamento, e um catálogo que
   * cresce a cada proposta deixa de servir para estimar prazo.
   */
  function escolherPorRotulo(rotulo: string) {
    const texto = rotulo.trim();
    if (!capacidade || !texto) {
      setTipoId("");
      setTipoLivre("");
      setAvisoTipo(null);
      if (!texto) setLinhas([{ email: criadoPor ?? "", horas: "" }]);
      return;
    }
    const doCatalogo = capacidade.tipos.find((t) => rotuloDoTipo(t) === texto);
    if (doCatalogo) {
      aplicar(doCatalogo.id, capacidade);
      return;
    }
    setTipoId("");
    setTipoLivre(texto);
    setAvisoTipo(null);
    if (linhas.length === 0) setLinhas([{ email: criadoPor ?? "", horas: "" }]);
  }

  /** O que aparece no campo: o rótulo do catálogo ou o texto avulso. */
  const tipoEscolhido = tipoLivre || (() => {
    const t = capacidade?.tipos.find((x) => x.id === tipoId);
    return t ? rotuloDoTipo(t) : "";
  })();

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
    tipoEscolhido,
    escolherPorRotulo,
    custoEquipe,
    linhasDominio,
    avisoTipo,
    servicoKey,
    escopo,
    impostoPadrao,
    serializar: () => ({ tipoId, tipoLivre, linhas }),
    restaurar: (v) => {
      if (!v || !Array.isArray(v.linhas)) return;
      setTipoId(v.tipoId ?? "");
      // Proposta salva antes de o avulso existir não traz o campo: fica vazio,
      // e o tipo continua vindo do catálogo como sempre veio.
      setTipoLivre(v.tipoLivre ?? "");
      // Sem passar por `aplicar`: o catálogo pode ter mudado de duração desde
      // que a proposta foi salva, e a proposta vale pelas horas que ELA
      // guardou, não pelas de hoje.
      setLinhas(v.linhas.map((l) => ({ email: String(l.email ?? ""), horas: String(l.horas ?? "") })));
    },
  };
}

const moeda = (cent: number) => (cent / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const TEXTO: Record<Escopo, { titulo: string; ajuda: string; rotulo: string }> = {
  projeto: {
    titulo: "Equipe responsável",
    ajuda: "Quem da GTA vai executar o trabalho vendido.",
    rotulo: "Quem executa",
  },
  orcamento: {
    titulo: "Custo de elaboração da proposta",
    ajuda:
      "O tempo gasto para montar este orçamento. Conta mesmo que o cliente não feche — é o custo que passava despercebido.",
    rotulo: "Quem elaborou",
  },
};

/** Apontamento de horas. Sem conta de preço: ela vive em `DetalhamentoPreco`. */
export function EquipeResponsavelCard({ estado }: { estado: EstadoEquipe }) {
  if (!estado.visivel) return null;
  if (estado.carregando) {
    return (
      <div className="section-card">
        <Loading>Carregando o custo da equipe…</Loading>
      </div>
    );
  }

  const t = TEXTO[estado.escopo];
  const nomeDe = (email: string) => estado.usuarios.find((u) => u.email === email)?.name || email;
  /* A duração fica fora do rótulo para o texto escolhido ser estável: ela muda
     em Planejamento, e um rótulo com "(4 h)" dentro deixaria de casar com o
     que a proposta guardou. Ela aparece na dica abaixo do campo. */
  const tiposDoCatalogo = (estado.capacidade?.tipos ?? []).map(rotuloDoTipo);
  const avulso = !!estado.tipoEscolhido && !tiposDoCatalogo.includes(estado.tipoEscolhido);
  const duracaoDoEscolhido = (() => {
    const tipo = estado.capacidade?.tipos.find((x) => x.id === estado.tipoId);
    if (!tipo || tipo.minutos <= 0) return "";
    return `${String(tipo.minutos / 60).replace(".", ",")} h`;
  })();
  const semCusto = estado.linhasDominio.filter((l) => !(estado.custos[l.email] > 0)).map((l) => nomeDe(l.email));
  const total = estado.linhasDominio.reduce((s, l) => s + Math.round(l.horas * (estado.custos[l.email] ?? 0) * 100), 0);

  function alterar(i: number, patch: Partial<LinhaTexto>) {
    estado.setLinhas(estado.linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  return (
    <div className="section-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">{t.titulo}</h2>
        {total > 0 && <Badge tone="slate">{moeda(total)}</Badge>}
      </div>
      <p className="hint mt-1">{t.ajuda} Nada disto vai para a proposta do cliente.</p>

      {estado.avisoTipo && <Alert tone="amber" className="mt-4">{estado.avisoTipo}</Alert>}
      {semCusto.length > 0 && (
        <Alert tone="amber" className="mt-4">
          {semCusto.length === 1 ? `${semCusto[0]} está` : `${semCusto.join(", ")} estão`} sem custo por
          hora cadastrado. O custo sai por baixo do real.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Aceita valor fora da lista: trabalho sem equivalente no catálogo é
            rotina, e antes disso a tela só avisava que não havia — sem oferecer
            saída. O que se escreve aqui vale só nesta proposta. */}
        <Campo
          label="Tipo de demanda"
          hint={
            <p className="hint mt-1">
              {avulso
                ? "Tipo desta proposta — informe as horas à mão. Não entra no catálogo."
                : duracaoDoEscolhido
                  ? `Catálogo: ${duracaoDoEscolhido}. As horas vieram daí e podem ser ajustadas.`
                  : "Escolha da lista e as horas vêm do catálogo, ou escreva um tipo só para esta proposta."}
            </p>
          }
        >
          <Combobox
            value={estado.tipoEscolhido}
            options={tiposDoCatalogo}
            placeholder="Escolher ou escrever…"
            rotuloNovo="Só nesta proposta: “{v}”"
            aria-label="Tipo de demanda"
            onChange={estado.escolherPorRotulo}
          />
        </Campo>
      </div>

      <div className="mt-4 space-y-2">
        {estado.linhas.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <Campo className="sm:col-span-7" label={i === 0 ? t.rotulo : ""}>
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
            <Campo
              className="sm:col-span-4"
              label={i === 0 ? "Horas" : ""}
              hint={i === 0 ? <p className="hint mt-1">Total de horas. Para dias × horas por dia, escreva 44 x 4,8</p> : undefined}
            >
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
    </div>
  );
}


/** Uma parcela de custo que o configurador já calculou. */
export interface LinhaCusto {
  rotulo: string;
  /** Em REAIS — o configurador trabalha em reais; a conversão é aqui. */
  valor: number;
}


/**
 * A conta inteira da proposta, num cartão só.
 *
 * ## O cartão não calcula custo nenhum
 *
 * Uma versão anterior derivava a conta: imposto = preço × alíquota, lucro =
 * preço − custo − imposto. No Solar isso produzia um número grosseiramente
 * errado e, pior, plausível: ignorava kit, instalação, material CA,
 * deslocamento, ART e comissão, e media a margem sobre o valor total quando o
 * Solar mede sobre os SERVIÇOS. Agora quem calcula custo é quem sabe — cada
 * configurador entrega as parcelas prontas, com nome.
 *
 * ## Faturamento em duas partes
 *
 * O que a GTA fatura e o que ela apenas REPASSA são dinheiros diferentes. No
 * solar, o kit é comprado do distribuidor e revendido: entra no total ao
 * cliente, mas não é receita da GTA e não pode entrar na margem. Somar os dois
 * num número só faria uma margem de 40% parecer de 15%.
 *
 * O total ao cliente é SOMADO aqui (base + repasses) em vez de recebido pronto:
 * assim ele não tem como discordar das parcelas listadas logo acima dele.
 */
export function DetalhamentoPreco({
  projeto,
  orcamento,
  custos,
  repasses = [],
  baseCent,
  precoSemEquipeCent,
  rotuloBase = "Serviços da GTA",
}: {
  projeto: EstadoEquipe;
  orcamento: EstadoEquipe;
  /** Parcelas de custo já calculadas pelo serviço, imposto incluído. */
  custos: LinhaCusto[];
  /** O que é comprado de terceiro e revendido sem margem (kit, equipamento). */
  repasses?: LinhaCusto[];
  /** Faturamento da GTA — a base sobre a qual a margem é medida. */
  baseCent: number;
  /** O que a base seria sem ninguém apontado, para mostrar o efeito. */
  precoSemEquipeCent: number;
  rotuloBase?: string;
}) {
  if (!projeto.visivel) return null;

  const custoDe = (l: LinhaEquipe) => Math.round(l.horas * (projeto.custos[l.email] ?? 0) * 100);
  const somaDe = (e: EstadoEquipe) => e.linhasDominio.reduce((s, l) => s + custoDe(l), 0);
  const cent = (v: number) => Math.round(v * 100);

  const repasseCent = repasses.reduce((s, r) => s + cent(r.valor), 0);
  const totalClienteCent = baseCent + repasseCent;

  const custoServicoCent = custos.reduce((s, c) => s + cent(c.valor), 0);
  const custoProjetoCent = somaDe(projeto);
  const custoOrcamentoCent = somaDe(orcamento);
  const custoTotalCent = custoServicoCent + custoProjetoCent + custoOrcamentoCent;

  const lucroCent = baseCent - custoTotalCent;
  const margem = baseCent > 0 ? lucroCent / baseCent : 0;
  const acrescimoCent = baseCent - precoSemEquipeCent;
  const incompleta = [...projeto.linhasDominio, ...orcamento.linhasDominio].some(
    (l) => !(projeto.custos[l.email] > 0),
  );

  const formaPreco = equipeFormaPreco(projeto.servicoKey);
  const nomeDe = (email: string) => projeto.usuarios.find((u) => u.email === email)?.name || email;

  /* Uma faixa de seção dentro da tabela. As parcelas de custo são POSITIVAS: a
     versão anterior prefixava cada uma com um sinal de menos, e o resultado era
     uma parede de sinais que ninguém lia. Que aquilo é custo já está dito pelo
     cabeçalho da seção. */
  const faixa = (texto: string) => (
    <tr>
      <td colSpan={2} className="!pb-1 !pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {texto}
      </td>
    </tr>
  );

  const item = (rotulo: ReactNode, valorCent: number, chave: string, recuado = false) => (
    <tr key={chave}>
      <td className={recuado ? "pl-6" : undefined}>{rotulo}</td>
      <td className="text-right tabular-nums">{moeda(valorCent)}</td>
    </tr>
  );

  const linhaPessoa = (l: LinhaEquipe, chave: string) =>
    item(
      <>
        {nomeDe(l.email)}
        <span className="hint">
          {" "}
          · {String(l.horas).replace(".", ",")} h ×{" "}
          {(projeto.custos[l.email] ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/h
        </span>
      </>,
      custoDe(l),
      chave,
      true,
    );

  return (
    <div className="section-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Detalhamento do preço</h2>
        {acrescimoCent !== 0 && (
          <Badge tone="indigo">
            {acrescimoCent > 0 ? "+" : "−"}
            {moeda(Math.abs(acrescimoCent))} pelas horas da GTA
          </Badge>
        )}
      </div>
      <p className="hint mt-1">
        {formaPreco
          ? "As horas da GTA entram no custo antes do Fator K — escolher quem trabalha muda o preço."
          : "O preço vem da tabela do serviço e não muda com as horas da GTA; elas aparecem aqui para medir se ele vale a pena."}{" "}
        Uso interno: nada desta tabela vai para o documento do cliente.
      </p>

      {lucroCent < 0 && (
        <Alert tone="red" className="mt-4" titulo="O preço não cobre o custo">
          Depois de tudo, falta {moeda(Math.abs(lucroCent))}. Dá para gerar a proposta assim; só não dá
          para dizer que ela vale a pena.
        </Alert>
      )}
      {incompleta && (
        <Alert tone="amber" className="mt-4">
          Alguém apontado está sem custo por hora cadastrado — o custo abaixo sai por baixo do real.
        </Alert>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="data-table">
          <tbody>
            {faixa("Faturamento")}
            {item(<span className="font-medium">{rotuloBase}</span>, baseCent, "base")}
            {repasses.map((r) =>
              item(
                <>
                  {r.rotulo} <span className="hint">· repasse, sem margem</span>
                </>,
                cent(r.valor),
                `rep-${r.rotulo}`,
                true,
              ),
            )}
            {repasseCent > 0 && (
              <tr>
                <td className="font-semibold">Total ao cliente</td>
                <td className="text-right font-semibold tabular-nums">{moeda(totalClienteCent)}</td>
              </tr>
            )}

            {faixa("Custos sobre os serviços da GTA")}
            {custos.map((c) => item(c.rotulo, cent(c.valor), `c-${c.rotulo}`, true))}
            {custoProjetoCent > 0 && item("Execução do projeto (horas GTA)", custoProjetoCent, "hp", true)}
            {projeto.linhasDominio.map((l) => linhaPessoa(l, `p-${l.email}`))}
            {custoOrcamentoCent > 0 && item("Elaboração da proposta (horas GTA)", custoOrcamentoCent, "ho", true)}
            {orcamento.linhasDominio.map((l) => linhaPessoa(l, `o-${l.email}`))}
            <tr>
              <td className="font-medium">Custo total</td>
              <td className="text-right font-medium tabular-nums">{moeda(custoTotalCent)}</td>
            </tr>

            {faixa("Resultado")}
            <tr>
              <td className="font-semibold">Lucro</td>
              <td className="text-right font-semibold tabular-nums">{moeda(lucroCent)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <KpiGrid className="mt-4">
        <Kpi label="Custo total" value={moeda(custoTotalCent)} />
        <Kpi label={repasseCent > 0 ? "Total ao cliente" : "Preço ao cliente"} value={moeda(totalClienteCent)} destaque />
        <Kpi
          label={repasseCent > 0 ? "Margem sobre os serviços" : "Margem líquida"}
          value={pct(margem)}
          tone={margem < 0 ? "red" : margem < 0.15 ? "amber" : "green"}
        />
      </KpiGrid>
    </div>
  );
}
