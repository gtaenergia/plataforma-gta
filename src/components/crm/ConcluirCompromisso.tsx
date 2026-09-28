"use client";

import { useState } from "react";
import { Alert } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import { descreverRepeticao, proximaOcorrencia } from "@/lib/crm/repeticao";
import {
  SITUACAO_LABEL,
  type Funil,
  type ItemCatalogo,
  type Negociacao,
  type TarefaCrm,
} from "@/lib/crm/types";
import type { OpcaoResponsavel } from "@/lib/users/equipe";
import { enviarJson } from "./buscar";
import { dataCurta, hojeISO } from "./util";

export interface Conclusao {
  tarefa: TarefaCrm;
  proxima: TarefaCrm | null;
  /** A negociação depois da mudança de etapa/situação, quando houve. */
  negociacao: Negociacao | null;
  aviso?: string;
}

const GANHAR = "__ganhar";
const PERDER = "__perder";

/**
 * O quadro de "concluir": registrar o contato que foi feito.
 *
 * Pergunta o que a agenda precisa saber para o próximo contato ser melhor que
 * este — quem falou com o cliente, o que ele disse, se a negociação andou — e
 * já traz a data do próximo, calculada pela repetição, para confirmar.
 *
 * A mudança de etapa passa pelas rotas da própria negociação, e ANTES da
 * conclusão: é lá que moram as regras (campo obrigatório para entrar na etapa,
 * motivo para perder). Se a negociação recusar, nada foi concluído e a pessoa
 * corrige sem ficar com metade feita.
 */
export function ConcluirCompromisso({ tarefa, negociacao, funil, motivos, usuarios, usuarioAtual, onConcluido, onCancelar }: {
  tarefa: TarefaCrm;
  /** A negociação "de referência" — ver `negociacaoDeReferencia`. */
  negociacao: Negociacao | null;
  funil: Funil | null;
  motivos: ItemCatalogo[];
  usuarios: OpcaoResponsavel[];
  usuarioAtual: string;
  onConcluido: (c: Conclusao) => void;
  onCancelar: () => void;
}) {
  const repete = tarefa.repetirCada > 0 && !!tarefa.repetirUnidade;
  const doTime = (email: string) => usuarios.some((u) => u.email.toLowerCase() === email.toLowerCase());
  const [feitoPor, setFeitoPor] = useState(
    doTime(usuarioAtual) ? usuarioAtual : tarefa.responsavel || usuarios[0]?.email || usuarioAtual,
  );
  const [comentario, setComentario] = useState("");
  const [mudanca, setMudanca] = useState("");
  const [motivo, setMotivo] = useState("");
  const [proximaData, setProximaData] = useState(
    repete && tarefa.repetirUnidade ? proximaOcorrencia(tarefa.data, tarefa.repetirCada, tarefa.repetirUnidade, hojeISO()) : "",
  );
  const [encerrar, setEncerrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O comentário é o que se perde ao sair da página no meio: é ele que o
  // próximo contato vai ler.
  const edicao = useEdicaoPendente();
  const editar = <T,>(setter: (v: T) => void) => (v: T) => {
    edicao.marcarEditado();
    setter(v);
  };

  const negociacaoAberta = !!negociacao && (negociacao.situacao === "aberta" || negociacao.situacao === "pausada");
  const etapaAtual = funil?.etapas.find((e) => e.id === negociacao?.etapaId);
  // Quem fez pode não estar mais na lista (saiu do comercial); a opção
  // continua aparecendo para o select mostrar o que vai ser gravado.
  const opcoes = doTime(feitoPor) ? usuarios : [...usuarios, { email: feitoPor, name: tarefa.responsavelNome || feitoPor }];

  async function concluir(e: React.FormEvent) {
    e.preventDefault();
    if (mudanca === PERDER && !motivo) { setErro("Escolha o motivo da perda."); return; }
    setErro(null);
    setSalvando(true);
    let negociacaoFinal: Negociacao | null = null;
    try {
      if (negociacao && mudanca) {
        const r =
          mudanca === GANHAR
            ? await enviarJson<{ negociacao: Negociacao }>(`/api/crm/negociacoes/${negociacao.id}/transicao`, "POST", { acao: "ganhar" })
            : mudanca === PERDER
              ? await enviarJson<{ negociacao: Negociacao }>(`/api/crm/negociacoes/${negociacao.id}/transicao`, "POST", { acao: "perder", motivoPerdaId: motivo })
              : await enviarJson<{ negociacao: Negociacao }>(`/api/crm/negociacoes/${negociacao.id}`, "PATCH", { etapaId: mudanca });
        negociacaoFinal = r.negociacao;
      }
    } catch (err) {
      setErro(`A negociação não mudou: ${err instanceof Error ? err.message : "falha ao salvar"}. O contato ainda não foi concluído.`);
      setSalvando(false);
      return;
    }

    try {
      const d = await enviarJson<{ tarefa: TarefaCrm; proxima: TarefaCrm | null; aviso?: string }>(
        `/api/crm/tarefas/${tarefa.id}/concluir`,
        "POST",
        {
          concluida: true,
          feitoPor,
          comentario,
          proximaData: repete && encerrar ? "" : proximaData,
          encerrarRepeticao: repete && encerrar,
        },
      );
      edicao.marcarSalvo();
      onConcluido({ tarefa: d.tarefa, proxima: d.proxima, negociacao: negociacaoFinal, aviso: d.aviso });
    } catch (err) {
      const jaMudou = negociacaoFinal ? " A negociação já foi atualizada; tente concluir de novo." : "";
      setErro(`${err instanceof Error ? err.message : "Falha ao concluir."}${jaMudou}`);
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={concluir}
      className="mt-2 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"
    >
      {erro && <Alert tone="red">{erro}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Quem fez o contato">
          <select className="field-input" value={feitoPor} onChange={(e) => editar(setFeitoPor)(e.target.value)}>
            {opcoes.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
          </select>
        </Campo>

        {negociacaoAberta && negociacao ? (
          <Campo
            label={`Etapa de "${negociacao.nome}"`}
            hint={
              mudanca === GANHAR ? (
                <p className="hint mt-1">A negociação sai do funil e a ficha fica travada para edição.</p>
              ) : undefined
            }
          >
            <select className="field-input" value={mudanca} onChange={(e) => editar(setMudanca)(e.target.value)}>
              <option value="">Continua em {etapaAtual ? `"${etapaAtual.nome}"` : "—"}</option>
              {(funil?.etapas ?? [])
                .filter((et) => et.id !== negociacao.etapaId)
                .map((et) => <option key={et.id} value={et.id}>Mover para &quot;{et.nome}&quot;</option>)}
              <option value={GANHAR}>Fechou — marcar como ganha</option>
              <option value={PERDER}>Não fechou — marcar como perdida</option>
            </select>
          </Campo>
        ) : negociacao ? (
          <p className="hint self-end">
            Negociação &quot;{negociacao.nome}&quot;: {SITUACAO_LABEL[negociacao.situacao].toLowerCase()}.
          </p>
        ) : (
          <p className="hint self-end">Sem negociação em andamento com este cliente.</p>
        )}

        {mudanca === PERDER && (
          <Campo className="sm:col-span-2" label="Motivo da perda *">
            <select className="field-input" value={motivo} onChange={(e) => editar(setMotivo)(e.target.value)}>
              <option value="">Escolha…</option>
              {motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
        )}
      </div>

      <Campo label="Comentário">
        <textarea
          className="field-input min-h-[70px]"
          value={comentario}
          onChange={(e) => editar(setComentario)(e.target.value)}
          placeholder="O que o cliente disse, o que ficou combinado…"
          autoFocus
        />
      </Campo>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {repete ? (
          <>
            {!encerrar && (
              <Campo
                label="Próximo contato"
                hint={<p className="hint mt-1">{descreverRepeticao(tarefa.repetirCada, tarefa.repetirUnidade)} — a data já vem calculada.</p>}
              >
                <input type="date" className="field-input" value={proximaData} onChange={(e) => setProximaData(e.target.value)} />
              </Campo>
            )}
            <label className="toque flex items-center gap-2 self-end text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={encerrar} onChange={(e) => setEncerrar(e.target.checked)} />
              Encerrar a repetição — não agendar o próximo
            </label>
          </>
        ) : (
          <Campo
            label="Agendar o próximo contato"
            hint={<p className="hint mt-1">Opcional. Em branco, este compromisso se encerra aqui.</p>}
          >
            <input type="date" className="field-input" value={proximaData} onChange={(e) => setProximaData(e.target.value)} />
          </Campo>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {proximaData && !(repete && encerrar) && (
          <span className="hint mr-auto">O próximo entra na agenda em {dataCurta(proximaData)}.</span>
        )}
        <button
          type="button"
          className="btn-secondary !py-1.5 text-sm"
          onClick={() => {
            edicao.marcarSalvo();
            onCancelar();
          }}
          disabled={salvando}
        >
          Cancelar
        </button>
        <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={salvando}>
          {salvando ? "Concluindo…" : "Concluir"}
        </button>
      </div>
    </form>
  );
}
