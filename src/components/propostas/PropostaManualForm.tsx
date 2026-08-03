"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, SectionCard } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { ClienteInput } from "@/components/clientes/ClienteInput";
import { SERVICO_OUTRO, SERVICO_OUTRO_LABEL } from "@/lib/propostas/types";
import { ANEXO_MAX_BYTES } from "@/lib/orcamentos/types";

/**
 * Cadastro de uma proposta feita FORA da plataforma.
 *
 * A GTA tem propostas específicas demais para caber num configurador, e hoje
 * elas só existem no computador de quem fez. Aqui elas viram registro: entram
 * na mesma lista, no mesmo filtro por serviço e na mesma esteira de aprovação
 * das geradas.
 *
 * O PDF é opcional no cadastro porque o registro do histórico vale por si — e
 * porque nem sempre o arquivo está pronto na hora em que a proposta é lançada.
 */

interface ServiceMeta {
  key: string;
  label: string;
}

const MB = 1024 * 1024;

export function PropostaManualForm() {
  const router = useRouter();
  const [servicos, setServicos] = useState<ServiceMeta[]>([]);
  const [serviceKey, setServiceKey] = useState(SERVICO_OUTRO);
  const [cliente, setCliente] = useState("");
  const [cidadeUf, setCidadeUf] = useState("");
  const [referencia, setReferencia] = useState("");
  const [valor, setValor] = useState("");
  const [dataEmissao, setDataEmissao] = useState(() => new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((d) => setServicos(d.services ?? []))
      .catch(() => {});
  }, []);

  function escolherArquivo(f: File | null) {
    setErro(null);
    if (f && f.type !== "application/pdf") {
      setErro("O anexo precisa ser um PDF.");
      return;
    }
    if (f && f.size > ANEXO_MAX_BYTES) {
      setErro(`O PDF tem ${(f.size / MB).toFixed(1)} MB e o limite é ${ANEXO_MAX_BYTES / MB} MB.`);
      return;
    }
    setArquivo(f);
  }

  async function salvar() {
    if (!cliente.trim()) {
      setErro("Informe o cliente.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const numero = Number(valor.replace(/\./g, "").replace(",", "."));
      const res = await fetch("/api/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceKey,
          cliente: cliente.trim(),
          referencia: referencia.trim(),
          // "gerada" porque a proposta EXISTE — foi feita à mão, mas está pronta.
          // É também o status que libera o envio para a esteira de aprovação.
          status: "gerada",
          manual: true,
          dados: {
            cidadeUf: cidadeUf.trim() || undefined,
            valor: Number.isFinite(numero) && numero > 0 ? numero : undefined,
            dataEmissao,
            observacoes: observacoes.trim() || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao cadastrar a proposta.");

      // Sem PDF: o registro já cumpriu o papel de histórico.
      if (!arquivo) {
        router.refresh();
        router.push("/propostas");
        return;
      }

      // Com PDF: o arquivo só tem onde morar dentro de um orçamento, então a
      // proposta entra na esteira já com ele como Rev 00 — que é o mesmo lugar
      // onde os anexos das propostas geradas ficam.
      const ro = await fetch("/api/orcamentos/da-proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propostaId: data.proposta.id }),
      });
      const orc = await ro.json();
      if (!ro.ok) throw new Error(orc.error ?? "Proposta cadastrada, mas falhou ao abrir a aprovação.");

      const form = new FormData();
      form.append("file", arquivo);
      const ra = await fetch(`/api/orcamentos/${orc.orcamento.id}/anexos`, { method: "POST", body: form });
      const anexo = await ra.json();
      if (!ra.ok) throw new Error(anexo.error ?? "Proposta criada, mas o PDF não subiu. Anexe pela tela de aprovação.");

      router.refresh();
      router.push(`/aprovacoes/${orc.orcamento.id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao cadastrar.");
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      {erro && <Alert tone="red">{erro}</Alert>}

      <SectionCard title="Proposta">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Campo className="sm:col-span-3" label="Serviço *">
            <select className="field-input" value={serviceKey} onChange={(e) => setServiceKey(e.target.value)}>
              {servicos.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
              <option value={SERVICO_OUTRO}>{SERVICO_OUTRO_LABEL}</option>
            </select>
          </Campo>
          <Campo className="sm:col-span-3" label="Cliente *">
            <ClienteInput
              className="field-input"
              listId="manual-clientes"
              value={cliente}
              onNome={setCliente}
              onCidadeUf={setCidadeUf}
            />
          </Campo>
          <Campo
            className="sm:col-span-3"
            label="Referência"
            hint={<p className="mt-1 hint">Em branco, a plataforma gera a referência como nas propostas geradas.</p>}
          >
            <input className="field-input" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: GTA-SE-2026-014" />
          </Campo>
          <Campo className="sm:col-span-2" label="Valor (R$)">
            <input className="field-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 32.700,00" />
          </Campo>
          <Campo className="sm:col-span-1" label="Emissão">
            <input type="date" className="field-input" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} />
          </Campo>
          <Campo className="sm:col-span-6" label="Observações">
            <textarea
              className="field-input min-h-[70px]"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="O que esta proposta tem de específico, para quem for consultar o histórico depois."
            />
          </Campo>
        </div>
      </SectionCard>

      <SectionCard
        title="Documento"
        subtitle="O PDF da proposta, para anexar à aprovação. Opcional — sem ele o cadastro fica só como registro."
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputArquivo}
            type="file"
            accept="application/pdf"
            /* `sr-only` esconde da vista mas mantém no foco e no leitor de
               tela, então o campo precisa de nome próprio — o botão ao lado é
               só o gatilho estilizado. */
            aria-label="Arquivo PDF da proposta"
            className="sr-only"
            onChange={(e) => {
              escolherArquivo(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn-secondary" onClick={() => inputArquivo.current?.click()}>
            Escolher PDF
          </button>
          {arquivo ? (
            <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <span className="max-w-[18rem] truncate font-medium">{arquivo.name}</span>
              <span className="hint">{(arquivo.size / MB).toFixed(1)} MB</span>
              <button type="button" className="btn-link-danger text-xs" onClick={() => setArquivo(null)}>
                Remover
              </button>
            </span>
          ) : (
            <span className="sem-valor text-sm">Nenhum arquivo escolhido</span>
          )}
        </div>
        {arquivo && (
          <Alert tone="amber" className="mt-3">
            Com o PDF, a proposta já entra na esteira de aprovação. O anexo segue a retenção da
            esteira: é apagado 7 dias depois de aprovada. O registro da proposta permanece.
          </Alert>
        )}
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? "Salvando…" : arquivo ? "Cadastrar e abrir a aprovação" : "Cadastrar proposta"}
        </button>
        <button type="button" className="btn-ghost" disabled={salvando} onClick={() => router.push("/propostas")}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
