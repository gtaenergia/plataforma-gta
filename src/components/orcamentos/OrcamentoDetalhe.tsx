"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  estacaoLabel,
  type AcaoTransicao,
  type AnexoRef,
  type Orcamento,
  type RegistroValidacao,
} from "@/lib/orcamentos/types";
import type { PermissaoKey } from "@/lib/rbac/permissoes";
import { Alert, BackLink, Badge, Marca, type Tone } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { CustoInterno } from "@/components/orcamentos/CustoInterno";

const ESTACAO_TONE: Record<string, Tone> = {
  rascunho: "slate",
  em_revisao: "amber",
  aprovado: "green",
  cancelado: "slate",
};

const HIST: Record<RegistroValidacao["tipo"], { label: string; tone: Tone }> = {
  enviar: { label: "Enviado para revisão", tone: "indigo" },
  aprovar: { label: "Aprovado", tone: "green" },
  rejeitar: { label: "Devolvido para ajustes", tone: "red" },
  cancelar: { label: "Cancelado", tone: "slate" },
  reabrir: { label: "Reaberto para revisão", tone: "amber" },
  auto: { label: "Validação automática", tone: "amber" },
};

const PRECISA_PARECER: AcaoTransicao[] = ["aprovar", "rejeitar", "cancelar", "reabrir"];

/**
 * Rótulo do botão de confirmação. Separado do HIST porque lá os textos são
 * particípios para o histórico ("Aprovado", "Reaberto para revisão") e viravam
 * frases estranhas no botão ("Confirmar reaberto para revisão").
 */
const CONFIRMAR: Record<AcaoTransicao, string> = {
  enviar: "Confirmar envio",
  aprovar: "Confirmar aprovação",
  rejeitar: "Confirmar devolução",
  cancelar: "Confirmar cancelamento",
  reabrir: "Confirmar reabertura",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtData(yyyymmdd?: string) {
  if (!yyyymmdd) return null;
  const d = new Date(`${yyyymmdd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? yyyymmdd : d.toLocaleDateString("pt-BR");
}

function validadeTexto(meta?: Orcamento["meta"]) {
  if (!meta?.dataEmissao || !meta.validadeDias) return null;
  const d = new Date(`${meta.dataEmissao}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + meta.validadeDias);
  return `${d.toLocaleDateString("pt-BR")} (${meta.validadeDias} dias)`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const revLabel = (r: number) => `Revisão ${String(r).padStart(2, "0")}`;

export function OrcamentoDetalhe({
  inicial,
  perms,
  currentEmail,
  isAdmin,
  oneDriveAtivo,
}: {
  inicial: Orcamento;
  perms: PermissaoKey[];
  currentEmail: string;
  isAdmin: boolean;
  oneDriveAtivo: boolean;
}) {
  const router = useRouter();
  const pode = (k: PermissaoKey) => perms.includes(k);
  const [orc, setOrc] = useState<Orcamento>(inicial);
  const [erro, setErro] = useState<string | null>(null);

  const [comentario, setComentario] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [enviandoOneDrive, setEnviandoOneDrive] = useState(false);
  const [avisoOneDrive, setAvisoOneDrive] = useState(false);

  // painel de parecer
  const [acaoAberta, setAcaoAberta] = useState<AcaoTransicao | null>(null);
  const [parecer, setParecer] = useState("");
  const [processando, setProcessando] = useState(false);

  // menu de ajustes
  const [ajuste, setAjuste] = useState({
    cliente: inicial.cliente,
    descricao: inicial.descricao,
    dataEmissao: inicial.meta?.dataEmissao ?? "",
    validadeDias: inicial.meta?.validadeDias != null ? String(inicial.meta.validadeDias) : "",
    formaPagamento: inicial.meta?.formaPagamento ?? "",
  });
 const [salvandoAjuste, setSalvandoAjuste] = useState(false);
  /* Ajuste do orçamento: sair sem gravar perde a correção de cliente, prazo ou
     forma de pagamento, e a tela volta mostrando os valores antigos. */
  const edicao = useEdicaoPendente();
  const alterarAjuste = (patch: Partial<typeof ajuste>) => {
    edicao.marcarEditado();
    setAjuste((a) => ({ ...a, ...patch }));
  };

  const souDono = isAdmin || orc.criadoPor === currentEmail;
  const naoFinalizado = orc.estacao !== "aprovado" && orc.estacao !== "cancelado";
  const podeEditar = orc.estacao === "rascunho" && souDono;
  // Espelha o escopo do servidor (dono/revisor/admin) — não basta "orcamentos.criar".
  const podeAnexar = (souDono || pode("orcamentos.revisar")) && naoFinalizado;

  const podeEnviar = orc.estacao === "rascunho" && pode("orcamentos.criar");
  const podeDecidir = orc.estacao === "em_revisao" && pode("orcamentos.aprovar");
  const podeCancelar = naoFinalizado && pode("orcamentos.cancelar");
  // Desfazer uma decisão já tomada (aprovou por engano, cancelou errado):
  // volta para em_revisao, de onde as decisões normais valem de novo.
  const podeReabrir = !naoFinalizado && pode("orcamentos.aprovar");
  // `podeReabrir` fica de fora: reabrir mora no cartão de Revisão, junto do
  // parecer que justifica a decisão. Num orçamento finalizado ele era a ÚNICA
  // ação, e o cartão "Ações" existia só para segurar um botão.
  const semAcoes = !podeEnviar && !podeDecidir && !podeCancelar;

  /**
   * Formulário do parecer. Função, e não bloco fixo: a mesma caixa aparece no
   * cartão de Ações (enviar/aprovar/rejeitar/cancelar) e no de Revisão
   * (reabrir), sempre embaixo do botão que a pessoa acabou de apertar.
   */
  function painelParecer(acao: AcaoTransicao) {
    return (
      <Campo
        className="space-y-2"
        label={<>Parecer {acao === "cancelar" ? "(opcional)" : "*"}</>}
        hint={
          <div className="mt-2 flex gap-2">
            <button
              className="btn-primary"
              disabled={processando || (acao !== "cancelar" && !parecer.trim())}
              onClick={() => transicionar(acao, parecer.trim() || undefined)}
            >
              {processando ? "Processando…" : CONFIRMAR[acao]}
            </button>
            <button className="btn-secondary" onClick={() => setAcaoAberta(null)} disabled={processando}>
              Voltar
            </button>
          </div>
        }
      >
        <textarea
          className="field-input min-h-20"
          value={parecer}
          onChange={(e) => setParecer(e.target.value)}
          placeholder={
            acao === "rejeitar"
              ? "O que precisa ser ajustado?"
              : acao === "reabrir"
                ? "Por que a decisão está sendo desfeita?"
                : "Registre o parecer da revisão"
          }
        />
      </Campo>
    );
  }

  const revisoes = [...orc.anexos].sort((a, b) => a.revisao - b.revisao);
  const temRev0 = orc.anexos.some((a) => a.revisao === 0);
  const proximaRev = orc.anexos.reduce((m, a) => Math.max(m, a.revisao), -1) + 1;

  async function transicionar(acao: AcaoTransicao, comParecer?: string) {
    setErro(null);
    setProcessando(true);
    try {
      const res = await fetch(`/api/orcamentos/${orc.id}/transicao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, parecer: comParecer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha na ação.");
      setOrc(data.orcamento);
      setAcaoAberta(null);
      setParecer("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setProcessando(false);
    }
  }

  function acionar(acao: AcaoTransicao) {
    setErro(null);
    if (PRECISA_PARECER.includes(acao)) {
      setAcaoAberta(acao);
      setParecer("");
    } else {
      transicionar(acao);
    }
  }

  async function salvarAjustes(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvandoAjuste(true);
    try {
      const body = {
        cliente: ajuste.cliente.trim(),
        descricao: ajuste.descricao.trim(),
        meta: {
          dataEmissao: ajuste.dataEmissao || undefined,
          validadeDias: ajuste.validadeDias.trim() ? Number(ajuste.validadeDias) : undefined,
          formaPagamento: ajuste.formaPagamento.trim() || undefined,
        },
      };
      const res = await fetch(`/api/orcamentos/${orc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao salvar.");
      setOrc(data.orcamento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      edicao.marcarSalvo();
      setSalvandoAjuste(false);
    }
  }

  async function comentar(e: React.FormEvent) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    setErro(null);
    try {
      const res = await fetch(`/api/orcamentos/${orc.id}/comentarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: comentario.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao comentar.");
      setOrc(data.orcamento);
      setComentario("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setEnviandoComentario(false);
    }
  }

  async function uploadRevisao(file: File, revisao: number) {
    setErro(null);
    setAnexando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("revisao", String(revisao));
      const res = await fetch(`/api/orcamentos/${orc.id}/anexos`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao anexar.");
      setOrc(data.orcamento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setAnexando(false);
    }
  }

  async function gerarDocx() {
    setErro(null);
    setAnexando(true);
    try {
      const res = await fetch(`/api/orcamentos/${orc.id}/gerar-docx`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar o documento.");
      setOrc(data.orcamento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setAnexando(false);
    }
  }

  async function removerRevisao(anexoId: string) {
    if (!window.confirm("Remover esta revisão?")) return;
    setErro(null);
    const res = await fetch(`/api/orcamentos/${orc.id}/anexos/${anexoId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? "Falha ao remover.");
      return;
    }
    setOrc(data.orcamento);
  }

  async function excluirOrcamento() {
    if (!window.confirm("Excluir este orçamento e seus anexos? Esta ação não pode ser desfeita.")) return;
    setExcluindo(true);
    setErro(null);
    const res = await fetch(`/api/orcamentos/${orc.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/aprovacoes");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setErro(data.error ?? "Falha ao excluir.");
    setExcluindo(false);
  }

  async function enviarOneDrive() {
    setErro(null);
    setEnviandoOneDrive(true);
    try {
      const res = await fetch(`/api/orcamentos/${orc.id}/onedrive`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar ao OneDrive.");
      setOrc(data.orcamento);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setEnviandoOneDrive(false);
    }
  }

  // input de arquivo reutilizável
  function FileBtn({ revisao, children }: { revisao: number; children: React.ReactNode }) {
    return (
      <label className="btn-secondary cursor-pointer text-xs">
        {children}
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          disabled={anexando}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadRevisao(f, revisao);
            e.target.value = "";
          }}
        />
      </label>
    );
  }

  return (
    <div className="space-y-5">
      <BackLink href="/aprovacoes">Voltar para aprovações</BackLink>

      {/* Cabeçalho */}
      <div className="section-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gta-navy dark:text-slate-100">{orc.cliente}</h1>
            <p className="hint">{orc.referencia}</p>
          </div>
          {/* Mesmo marcador da lista: o estado tem de ser reconhecível como a
              mesma coisa nas duas telas. */}
          <Marca tone={ESTACAO_TONE[orc.estacao] ?? "slate"}>{estacaoLabel(orc.estacao)}</Marca>
        </div>
        {orc.descricao && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{orc.descricao}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 subtitle">
          {fmtData(orc.meta?.dataEmissao) && (
            <span>Emissão: <strong className="text-slate-700 dark:text-slate-200">{fmtData(orc.meta?.dataEmissao)}</strong></span>
          )}
          {validadeTexto(orc.meta) && (
            <span>Validade: <strong className="text-slate-700 dark:text-slate-200">{validadeTexto(orc.meta)}</strong></span>
          )}
          {orc.meta?.formaPagamento && (
            <span>Pagamento: <strong className="text-slate-700 dark:text-slate-200">{orc.meta.formaPagamento}</strong></span>
          )}
          <span>Criado por {orc.criadoPorNome ?? orc.criadoPor}</span>
        </div>

        {orc.decididoPor && (orc.estacao === "aprovado" || orc.estacao === "cancelado") && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
            <strong>{estacaoLabel(orc.estacao)}</strong> por {orc.decididoPor}
            {orc.decididoEm ? ` em ${fmt(orc.decididoEm)}` : ""}
            {orc.parecer ? ` — “${orc.parecer}”` : ""}
          </p>
        )}
        {orc.expiraEm && (orc.estacao === "aprovado" || orc.estacao === "cancelado") && (
          <p className="mt-2 hint">
            Arquivos disponíveis para download até {fmt(orc.expiraEm)}.
          </p>
        )}
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}

      {/* OneDrive — aparece quando aprovado. Enquanto a integração não estiver
          configurada (env vars), mostra o estado "Em desenvolvimento": botão
          visualmente desabilitado que, ao clicar, explica que ainda não está pronto. */}
      {orc.estacao === "aprovado" && (
        <div className="section-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="section-title">OneDrive</h2>
                {!oneDriveAtivo && <span className="badge badge-amber">Em desenvolvimento</span>}
              </div>
              {!oneDriveAtivo ? (
                <p className="mt-1 subtitle">
                  Em breve: as revisões e o .docx deste orçamento serão arquivados automaticamente numa pasta no OneDrive.
                </p>
              ) : orc.oneDrive?.url ? (
                <p className="mt-1 subtitle">
                  {orc.oneDrive.arquivos} arquivo(s) na pasta <strong>{orc.oneDrive.pasta}</strong>
                  {orc.oneDrive.enviadoEm ? ` · enviado em ${fmt(orc.oneDrive.enviadoEm)}` : ""}
                  {orc.oneDrive.erro ? ` · alguns falharam: ${orc.oneDrive.erro}` : ""}
                </p>
              ) : orc.oneDrive?.erro ? (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">Falha ao enviar: {orc.oneDrive.erro}</p>
              ) : (
                <p className="mt-1 subtitle">Envie as revisões e o .docx para a pasta deste orçamento no OneDrive.</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {oneDriveAtivo && orc.oneDrive?.url && (
                <a href={orc.oneDrive.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Abrir pasta</a>
              )}
              {oneDriveAtivo ? (
                <button className="btn-primary" onClick={enviarOneDrive} disabled={enviandoOneDrive}>
                  {enviandoOneDrive ? "Enviando…" : orc.oneDrive?.url ? "Reenviar" : "Enviar para o OneDrive"}
                </button>
              ) : (
                <button
                  className="btn-secondary cursor-not-allowed opacity-60"
                  aria-disabled="true"
                  onClick={() => setAvisoOneDrive(true)}
                >
                  Enviar para o OneDrive
                </button>
              )}
            </div>
          </div>
          {!oneDriveAtivo && avisoOneDrive && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Esta função está em desenvolvimento e ainda não está disponível.
            </p>
          )}
        </div>
      )}

      {/* Menu de ajustes (rascunho) */}
      {podeEditar && (
        <form onSubmit={salvarAjustes} className="section-card">
          <h2 className="section-title mb-4">Ajustes</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <Campo className="sm:col-span-3" label="Cliente *">
              <input className="field-input" value={ajuste.cliente} onChange={(e) => alterarAjuste({ cliente: e.target.value })} required />
            </Campo>
            <Campo className="sm:col-span-3" label="Forma de pagamento">
              <input className="field-input" value={ajuste.formaPagamento} onChange={(e) => alterarAjuste({ formaPagamento: e.target.value })} />
            </Campo>
            <Campo className="sm:col-span-3" label="Data de emissão">
              <input type="date" className="field-input" value={ajuste.dataEmissao} onChange={(e) => alterarAjuste({ dataEmissao: e.target.value })} />
            </Campo>
            <Campo className="sm:col-span-3" label="Prazo/validade (dias)">
              <input type="number" min={0} className="field-input" value={ajuste.validadeDias} onChange={(e) => alterarAjuste({ validadeDias: e.target.value })} />
            </Campo>
            <Campo className="sm:col-span-6" label="Descrição">
              <input className="field-input" value={ajuste.descricao} onChange={(e) => alterarAjuste({ descricao: e.target.value })} />
            </Campo>
          </div>
          <div className="mt-3">
            <button type="submit" className="btn-primary" disabled={salvandoAjuste || !ajuste.cliente.trim()}>
              {salvandoAjuste ? "Salvando…" : "Salvar ajustes"}
            </button>
          </div>
        </form>
      )}

      {/* Custo administrativo: só para quem pode ver a margem. A seção NÃO é
          renderizada sem a permissão, e a ficha nem chega do servidor — a
          redação acontece em `redigirOrcamento`. */}
      {pode("financeiro.ver") && <CustoInterno orcamento={orc} onAtualizado={setOrc} />}

      {/* Revisões */}
      <div className="section-card">
        <h2 className="section-title mb-4">Revisões da proposta</h2>

        {revisoes.length === 0 && !podeAnexar && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhuma revisão.</p>
        )}

        {revisoes.length > 0 && (
          <ul className="space-y-2">
            {revisoes.map((a: AnexoRef) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-gta-navy/10 px-1.5 py-0.5 text-xs font-semibold text-gta-navy dark:bg-white/10 dark:text-slate-200">
                      {revLabel(a.revisao)}
                    </span>
                    {/* `min-w-0` + o <span> interno: `.btn-link` é inline-flex, e
                        `truncate` só corta o texto se ele estiver num filho que
                        possa encolher. Direto no <a> as reticências sumiam. */}
                    <a href={`/api/orcamentos/${orc.id}/anexos/${a.id}/download`} className="btn-link min-w-0">
                      <span className="truncate">{a.nome}</span>
                    </a>
                  </div>
                  <div className="mt-0.5 hint">
                    {a.tipo === "docx" ? "Documento da plataforma (.docx)" : a.tipo === "pdf" ? "PDF" : "Planilha"} · {formatBytes(a.tamanho)} · {a.enviadoPor}
                  </div>
                </div>
                {podeAnexar && (
                  <button onClick={() => removerRevisao(a.id)} className="btn-link-danger shrink-0 text-xs">
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeAnexar && (
          <div className="mt-3 space-y-2">
            {!temRev0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
                <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
                  <strong>Revisão 00</strong>
                  {" — "}
                  {orc.propostaId && orc.meta?.regeneravel
                    ? "mantenha o documento gerado pela plataforma ou anexe o PDF que você alterou:"
                    : "anexe o PDF da proposta (exporte do .docx para PDF e envie aqui):"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {orc.propostaId && orc.meta?.regeneravel && (
                    <button className="btn-secondary text-xs" onClick={gerarDocx} disabled={anexando}>
                      {anexando ? "..." : "Usar documento da plataforma (.docx)"}
                    </button>
                  )}
                  <FileBtn revisao={0}>Anexar PDF{orc.meta?.regeneravel ? " (alterado)" : ""}</FileBtn>
                </div>
              </div>
            ) : (
              <FileBtn revisao={proximaRev}>+ Adicionar {revLabel(proximaRev)} (PDF)</FileBtn>
            )}
          </div>
        )}
      </div>

      {/* Ações */}
      {!semAcoes && (
        <div className="section-card">
          <h2 className="section-title mb-4">Ações</h2>
          {acaoAberta && acaoAberta !== "reabrir" ? (
            painelParecer(acaoAberta)
          ) : (
            <div className="flex flex-wrap gap-2">
              {podeEnviar && (
                <button className="btn-primary" onClick={() => acionar("enviar")} disabled={processando}>
                  Enviar para revisão
                </button>
              )}
              {podeDecidir && (
                <>
                  <button className="btn-primary" onClick={() => acionar("aprovar")} disabled={processando}>
                    Aprovar
                  </button>
                  <button className="btn-danger" onClick={() => acionar("rejeitar")} disabled={processando}>
                    Rejeitar
                  </button>
                </>
              )}
              {podeCancelar && (
                <button className="btn-secondary" onClick={() => acionar("cancelar")} disabled={processando}>
                  Cancelar orçamento
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Revisão / comentários */}
      <div className="section-card">
        <h2 className="section-title mb-4">Revisão</h2>

        {/* Reabrir mora aqui, e não num cartão "Ações": desfazer uma decisão é
            um ato de revisão, e o parecer que a justifica fica ao lado dos
            comentários que contam a mesma história. */}
        {podeReabrir && (
          <div className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-700">
            {acaoAberta === "reabrir" ? (
              painelParecer("reabrir")
            ) : (
              <>
                <button className="btn-secondary" onClick={() => acionar("reabrir")} disabled={processando}>
                  Reabrir para revisão
                </button>
                <p className="mt-2 hint">
                  Desfaz a decisão e devolve o orçamento para revisão — use se
                  {orc.estacao === "aprovado" ? " aprovou" : " cancelou"} por engano. Fica registrado no histórico.
                </p>
              </>
            )}
          </div>
        )}

        {orc.comentarios.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum comentário ainda.</p>
        ) : (
          <ul className="space-y-2">
            {orc.comentarios.map((c) => (
              <li key={c.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{c.autor}</span>
                  <span className="hint">{fmt(c.em)}</span>
                </div>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}
        {pode("orcamentos.revisar") && (
          <form onSubmit={comentar} className="mt-3 flex gap-2">
            <input
              className="field-input"
              /* Só o placeholder nomeava o campo, e placeholder some ao digitar. */
              aria-label="Comentário de revisão"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Escreva um comentário de revisão…"
            />
            <button className="btn-secondary shrink-0" disabled={enviandoComentario || !comentario.trim()}>
              {enviandoComentario ? "..." : "Comentar"}
            </button>
          </form>
        )}
      </div>

      {/* Histórico */}
      <div className="section-card">
        <h2 className="section-title mb-4">Histórico</h2>
        {orc.historico.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Sem movimentações.</p>
        ) : (
          <ul className="space-y-2">
            {[...orc.historico].reverse().map((h) => (
              <li key={h.id} className="flex items-start gap-3 text-sm">
                <Badge tone={HIST[h.tipo]?.tone ?? "slate"} className="mt-0.5 shrink-0">
                  {HIST[h.tipo]?.label ?? h.tipo}
                </Badge>
                <div className="min-w-0">
                  <p className="text-slate-600 dark:text-slate-300">{h.mensagem}</p>
                  <p className="hint">{h.autor} · {fmt(h.em)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Excluir */}
      {souDono && (
        <div className="flex justify-end">
          <button
            onClick={excluirOrcamento}
            disabled={excluindo}
            className="btn-link-danger text-xs"
          >
            {excluindo ? "Excluindo…" : "Excluir orçamento"}
          </button>
        </div>
      )}
    </div>
  );
}
