"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, Badge, EmptyState, Loading, Marca, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { TIPO_CAMPO_LABEL, TIPOS_CAMPO, type CampoPersonalizado, type TipoCampo } from "@/lib/crm/campos";
import type { Funil } from "@/lib/crm/types";
import { buscarJson, enviarJson } from "../buscar";

/**
 * Cadastro dos campos personalizados da negociação.
 *
 * O que a tela precisa deixar claro, porque é onde as pessoas erram:
 *
 * - o TIPO não muda depois de criado (trocar transformaria o gravado em lixo);
 * - campo não se exclui, se ARQUIVA — o dado já digitado continua legível;
 * - "obrigatório ao entrar em X" é o que dá disciplina ao funil, e é diferente
 *   de "obrigatório sempre".
 */
export function CamposConfig() {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [funis, setFunis] = useState<Funil[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const edicao = useEdicaoPendente();

  const [rotulo, setRotulo] = useState("");
  const [tipo, setTipo] = useState<TipoCampo>("texto");
  const [opcoesTexto, setOpcoesTexto] = useState("");
  const [obrigatorio, setObrigatorio] = useState(false);
  const [etapaId, setEtapaId] = useState("");
  const [ajuda, setAjuda] = useState("");

  useEffect(() => {
    Promise.all([
      buscarJson<{ campos: CampoPersonalizado[] }>("/api/crm/campos"),
      buscarJson<{ funis: Funil[] }>("/api/crm/funis"),
    ])
      .then(([c, f]) => {
        setCampos(c.campos ?? []);
        setFunis(f.funis ?? []);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar."))
      .finally(() => setLoading(false));
  }, []);

  /** Todas as etapas de todos os funis, com o nome do funil quando há mais de um. */
  const etapas = useMemo(
    () =>
      funis.flatMap((f) =>
        f.etapas.map((e) => ({ id: e.id, label: funis.length > 1 ? `${f.nome} · ${e.nome}` : e.nome })),
      ),
    [funis],
  );
  const nomeEtapa = (id: string) => etapas.find((e) => e.id === id)?.label ?? "etapa removida";

  const precisaOpcoes = tipo === "opcao" || tipo === "multipla";
  const opcoes = useMemo(
    () => opcoesTexto.split("\n").map((o) => o.trim()).filter(Boolean),
    [opcoesTexto],
  );

  function limpar() {
    edicao.marcarSalvo();
    setCriando(false);
    setRotulo("");
    setTipo("texto");
    setOpcoesTexto("");
    setObrigatorio(false);
    setEtapaId("");
    setAjuda("");
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!rotulo.trim()) { setErro("Informe o rótulo do campo."); return; }
    if (precisaOpcoes && opcoes.length === 0) { setErro("Informe ao menos uma opção — uma por linha."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const d = await enviarJson<{ campo: CampoPersonalizado }>("/api/crm/campos", "POST", {
        rotulo, tipo, opcoes, obrigatorio, obrigatorioNaEtapaId: etapaId, ajuda,
        ordem: campos.length,
      });
      setCampos((prev) => [...prev, d.campo]);
      limpar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar o campo.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterar(c: CampoPersonalizado, patch: Partial<CampoPersonalizado>) {
    setErro(null);
    try {
      const d = await enviarJson<{ campo: CampoPersonalizado }>(`/api/crm/campos/${c.id}`, "PATCH", patch);
      setCampos((prev) => prev.map((x) => (x.id === c.id ? d.campo : x)));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao alterar o campo.");
    }
  }

  async function arquivar(c: CampoPersonalizado) {
    const aviso = c.arquivado
      ? `Reativar “${c.rotulo}”? Ele volta a aparecer no formulário das negociações.`
      : `Arquivar “${c.rotulo}”?\n\nEle some do formulário e deixa de ser exigido. O que já foi preenchido continua guardado e visível nas negociações que o têm.`;
    if (!window.confirm(aviso)) return;
    await alterar(c, { arquivado: !c.arquivado });
  }

  if (loading) return <Loading>Carregando os campos…</Loading>;

  const ativos = campos.filter((c) => !c.arquivado);
  const arquivados = campos.filter((c) => c.arquivado);

  return (
    <div className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}

      <Alert tone="indigo" titulo="Como estes campos funcionam.">
        Eles aparecem na ficha de toda negociação. <strong>Obrigatório sempre</strong> impede salvar a ficha sem
        preencher; <strong>obrigatório ao entrar numa etapa</strong> impede avançar até ela — é o que faz o funil ter
        disciplina. A criação rápida pela coluna do funil nunca é barrada: ela pede só o nome, para a negociação nascer
        antes de esfriar.
      </Alert>

      {!criando && (
        <button className="btn-primary" onClick={() => { setErro(null); setCriando(true); }}>
          <Plus className="h-4 w-4" aria-hidden /> Novo campo
        </button>
      )}

      {criando && (
        <SectionCard
          title="Novo campo"
          actions={<button type="button" className="btn-secondary !py-2 text-sm" onClick={limpar}>Cancelar</button>}
        >
          <form onSubmit={criar} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <Campo className="sm:col-span-3" label="Rótulo *">
                <input
                  className="field-input"
                  value={rotulo}
                  onChange={(e) => { edicao.marcarEditado(); setRotulo(e.target.value); }}
                  placeholder="Ex.: Potência (kVA)"
                />
              </Campo>
              <Campo
                className="sm:col-span-3"
                label="Tipo *"
                hint={<p className="hint mt-1">Não muda depois de criado — trocar transformaria o que já foi digitado em lixo.</p>}
              >
                <select className="field-input" value={tipo} onChange={(e) => { edicao.marcarEditado(); setTipo(e.target.value as TipoCampo); }}>
                  {TIPOS_CAMPO.map((t) => <option key={t} value={t}>{TIPO_CAMPO_LABEL[t]}</option>)}
                </select>
              </Campo>

              {precisaOpcoes && (
                <Campo className="sm:col-span-6" label="Opções * (uma por linha)">
                  <textarea
                    className="field-input min-h-[90px]"
                    value={opcoesTexto}
                    onChange={(e) => { edicao.marcarEditado(); setOpcoesTexto(e.target.value); }}
                    placeholder={"13,8 kV\n34,5 kV\n69 kV"}
                  />
                </Campo>
              )}

              <Campo className="sm:col-span-6" label="Texto de ajuda">
                <input
                  className="field-input"
                  value={ajuda}
                  onChange={(e) => { edicao.marcarEditado(); setAjuda(e.target.value); }}
                  placeholder="Aparece abaixo do campo, para quem preenche"
                />
              </Campo>

              <Campo className="sm:col-span-3" label="Obrigatório ao entrar na etapa">
                <select className="field-input" value={etapaId} onChange={(e) => { edicao.marcarEditado(); setEtapaId(e.target.value); }}>
                  <option value="">Não exigir por etapa</option>
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </Campo>
              <div className="flex items-end sm:col-span-3">
                <label className="toque flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={obrigatorio} onChange={(e) => { edicao.marcarEditado(); setObrigatorio(e.target.checked); }} />
                  Obrigatório sempre (não salva a ficha sem ele)
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={limpar}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? "Criando…" : "Criar campo"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      {ativos.length === 0 && !criando ? (
        <EmptyState>
          Nenhum campo personalizado ainda. Use-os para o que a negociação de engenharia precisa carregar: potência,
          distribuidora, classe de tensão, número da UC.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 card dark:divide-slate-700">
          {ativos.map((c) => (
            <li key={c.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gta-navy dark:text-slate-100">{c.rotulo}</span>
                    <Marca tone="slate" className="text-xs">{TIPO_CAMPO_LABEL[c.tipo]}</Marca>
                    {c.obrigatorio && <Badge tone="amber">Obrigatório sempre</Badge>}
                  </div>
                  {c.obrigatorioNaEtapaId && (
                    <p className="hint mt-1">Exigido para entrar em <strong>{nomeEtapa(c.obrigatorioNaEtapaId)}</strong></p>
                  )}
                  {c.opcoes.length > 0 && <p className="hint mt-1">{c.opcoes.join(" · ")}</p>}
                  {c.ajuda && <p className="hint mt-1">{c.ajuda}</p>}
                </div>
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  aria-label={`Arquivar ${c.rotulo}`}
                  onClick={() => void arquivar(c)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {/* Ajustes que NÃO destroem dado ficam à mão, sem abrir formulário. */}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="hint flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={c.obrigatorio} onChange={() => void alterar(c, { obrigatorio: !c.obrigatorio })} />
                  Obrigatório sempre
                </label>
                <label className="hint flex items-center gap-1.5">
                  Exigir ao entrar em:
                  <select
                    className="field-input !w-auto !py-0.5 text-xs"
                    value={c.obrigatorioNaEtapaId}
                    aria-label={`Etapa que exige ${c.rotulo}`}
                    onChange={(e) => void alterar(c, { obrigatorioNaEtapaId: e.target.value })}
                  >
                    <option value="">—</option>
                    {etapas.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {arquivados.length > 0 && (
        <SectionCard title={`Arquivados (${arquivados.length})`} subtitle="Somem do formulário; o que já foi preenchido continua guardado.">
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {arquivados.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
                  {c.rotulo} · {TIPO_CAMPO_LABEL[c.tipo]}
                </span>
                <button className="btn-link shrink-0 text-xs" onClick={() => void arquivar(c)}>Reativar</button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
