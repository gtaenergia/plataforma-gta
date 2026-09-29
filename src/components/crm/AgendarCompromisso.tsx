"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { useEdicaoPendente } from "@/components/useAvisoNaoSalvo";
import type { Cliente } from "@/lib/clientes/types";
import { negociacoesDoCliente } from "@/lib/crm/followups";
import { descreverRepeticao } from "@/lib/crm/repeticao";
import { TIPO_TAREFA_LABEL, TIPOS_TAREFA, type Negociacao, type TarefaCrm, type TipoTarefa } from "@/lib/crm/types";
import { responsavelPadrao, type OpcaoResponsavel } from "@/lib/users/equipe";
import { enviarJson } from "./buscar";
import { RepeticaoCampo, type Repeticao } from "./RepeticaoCampo";
import { hojeISO } from "./util";

/**
 * Agendar um compromisso com um cliente: o follow-up.
 *
 * O cliente vem primeiro, e a negociação é opcional — é o que separa o
 * follow-up de relacionamento (ligar a cada três meses, depois da obra) da
 * tarefa de uma venda em andamento. Escolhida a negociação, o compromisso
 * também entra no histórico dela.
 *
 * `clienteFixo` é a ficha do cliente: lá a pergunta "com quem?" já está
 * respondida. `negociacaoFixa` é o cartão do funil: a negociação já está
 * escolhida, e o cliente é o dela — o servidor completa.
 */
export function AgendarCompromisso({
  clientes,
  clienteFixo,
  negociacaoFixa,
  negociacoes,
  usuarios,
  usuarioAtual,
  onAgendado,
  onCancelar,
}: {
  clientes: Cliente[];
  clienteFixo?: Cliente;
  negociacaoFixa?: Negociacao;
  negociacoes: Negociacao[];
  usuarios: OpcaoResponsavel[];
  usuarioAtual: string;
  onAgendado: (t: TarefaCrm) => void;
  onCancelar: () => void;
}) {
  const [clienteId, setClienteId] = useState(clienteFixo?.id ?? "");
  const [negociacaoId, setNegociacaoId] = useState(negociacaoFixa?.id ?? "");
  const [tipo, setTipo] = useState<TipoTarefa>("ligacao");
  const [assunto, setAssunto] = useState("");
  const [data, setData] = useState(hojeISO());
  const [hora, setHora] = useState("");
  const [repeticao, setRepeticao] = useState<Repeticao>({ cada: 0, unidade: "" });
  const [responsavel, setResponsavel] = useState("");
  const [notas, setNotas] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const edicao = useEdicaoPendente();

  const editar = <T,>(setter: (v: T) => void) => (v: T) => {
    edicao.marcarEditado();
    setter(v);
  };

  const cliente = clienteFixo ?? clientes.find((c) => c.id === clienteId) ?? null;
  // Só as em andamento: o servidor recusa tarefa em negociação fechada.
  const doCliente = useMemo(
    () =>
      cliente
        ? negociacoesDoCliente(cliente, negociacoes).filter((n) => n.situacao === "aberta" || n.situacao === "pausada")
        : [],
    [cliente, negociacoes],
  );
  const responsavelEfetivo = responsavel || responsavelPadrao(usuarios, usuarioAtual);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente && !negociacaoFixa) { setErro("Escolha o cliente."); return; }
    if (!assunto.trim()) { setErro("Informe o assunto."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const d = await enviarJson<{ tarefa: TarefaCrm }>("/api/crm/tarefas", "POST", {
        // Com a negociação fixa, o cliente é o dela: o servidor completa, e
        // não há como mandar um diferente por engano.
        clienteId: negociacaoFixa ? "" : cliente?.id ?? "",
        negociacaoId,
        tipo,
        assunto,
        data,
        hora,
        notas,
        responsavel: responsavelEfetivo,
        responsavelNome: usuarios.find((u) => u.email === responsavelEfetivo)?.name ?? "",
        repetirCada: repeticao.cada,
        repetirUnidade: repeticao.cada ? repeticao.unidade : "",
      });
      edicao.marcarSalvo();
      onAgendado(d.tarefa);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao agendar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      {erro && <Alert tone="red">{erro}</Alert>}
      {negociacaoFixa && (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="hint">Negociação:</span> <strong>{negociacaoFixa.nome}</strong>
          {negociacaoFixa.empresaNome && (
            <>
              {" "}
              <span className="hint">· Cliente:</span> <strong>{negociacaoFixa.empresaNome}</strong>
            </>
          )}
          <span className="hint block">O compromisso também entra no histórico da negociação.</span>
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
        {!clienteFixo && !negociacaoFixa && (
          <Campo className="sm:col-span-3" label="Cliente *">
            <select
              className="field-input"
              value={clienteId}
              onChange={(e) => {
                editar(setClienteId)(e.target.value);
                // A negociação escolhida era do cliente anterior.
                setNegociacaoId("");
              }}
            >
              <option value="">Escolha…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        )}
        {!negociacaoFixa && (
          <Campo
            className={clienteFixo ? "sm:col-span-6" : "sm:col-span-3"}
            label="Negociação"
            hint={
              <p className="hint mt-1">
                {cliente && doCliente.length === 0
                  ? "Nenhuma negociação em andamento com este cliente — o compromisso fica só com o cliente."
                  : "Opcional. Com negociação, o compromisso também entra no histórico dela."}
              </p>
            }
          >
            <select
              className="field-input"
              value={negociacaoId}
              onChange={(e) => editar(setNegociacaoId)(e.target.value)}
              disabled={!cliente || doCliente.length === 0}
            >
              <option value="">— Só o cliente —</option>
              {doCliente.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo className="sm:col-span-4" label="Assunto *">
          <input
            className="field-input"
            value={assunto}
            onChange={(e) => editar(setAssunto)(e.target.value)}
            placeholder="Ex.: Retorno sobre a proposta de SPDA"
          />
        </Campo>
        <Campo className="sm:col-span-2" label="Tipo">
          <select className="field-input" value={tipo} onChange={(e) => editar(setTipo)(e.target.value as TipoTarefa)}>
            {TIPOS_TAREFA.map((t) => <option key={t} value={t}>{TIPO_TAREFA_LABEL[t]}</option>)}
          </select>
        </Campo>
        <Campo className="sm:col-span-2" label="Data *">
          <input type="date" className="field-input" value={data} onChange={(e) => editar(setData)(e.target.value)} required />
        </Campo>
        <Campo className="sm:col-span-1" label="Hora">
          <input type="time" className="field-input" value={hora} onChange={(e) => editar(setHora)(e.target.value)} />
        </Campo>
        <RepeticaoCampo className="sm:col-span-3" valor={repeticao} onChange={editar(setRepeticao)} />
        <Campo className="sm:col-span-3" label="Responsável">
          <select className="field-input" value={responsavelEfetivo} onChange={(e) => editar(setResponsavel)(e.target.value)}>
            {usuarios.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
          </select>
        </Campo>
      </div>
      <Campo label="Notas">
        <textarea
          className="field-input min-h-[60px]"
          value={notas}
          onChange={(e) => editar(setNotas)(e.target.value)}
          placeholder="O que falar, o que levar, o que ficou combinado da última vez…"
        />
      </Campo>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {repeticao.cada > 0 && (
          <span className="hint mr-auto">
            {descreverRepeticao(repeticao.cada, repeticao.unidade)} — a próxima data entra na agenda quando esta for concluída.
          </span>
        )}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            edicao.marcarSalvo();
            onCancelar();
          }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? "Agendando…" : "Agendar"}
        </button>
      </div>
    </form>
  );
}
