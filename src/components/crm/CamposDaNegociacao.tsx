"use client";

import { useEffect, useState } from "react";
import { Badge, EmptyState } from "@/components/ui";
import { Campo } from "@/components/Campo";
import { preenchido, type CampoPersonalizado, type ValoresCampos } from "@/lib/crm/campos";

/**
 * Os campos personalizados dentro da ficha da negociação.
 *
 * Campos ARQUIVADOS não somem quando têm valor: a definição foi aposentada,
 * mas o dado foi digitado por alguém e continua sendo a resposta. Some só
 * quando está vazio — aí não há o que preservar.
 */
export function CamposDaNegociacao({ valores, aberta, onChange }: {
  valores: ValoresCampos;
  aberta: boolean;
  onChange: (v: ValoresCampos) => void;
}) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/crm/campos")
      .then((r) => r.json())
      .then((d) => setCampos(d.campos ?? []))
      .catch(() => setCampos([]))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <p className="hint">Carregando os campos…</p>;

  const visiveis = campos.filter((c) => !c.arquivado || preenchido(valores[c.id]));
  if (visiveis.length === 0) {
    return (
      <EmptyState className="!p-6">
        Nenhum campo personalizado configurado. Um administrador pode criá-los em Configurações → Campos
        personalizados.
      </EmptyState>
    );
  }

  const set = (id: string, v: string | string[]) => onChange({ ...valores, [id]: v });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      {visiveis.map((c) => {
        const valor = valores[c.id];
        const rotulo = (
          <>
            {c.rotulo}
            {c.obrigatorio && " *"}
            {c.arquivado && <Badge tone="slate" className="ml-2">Arquivado</Badge>}
          </>
        );
        const dica = (
          <>
            {c.ajuda && <p className="hint mt-1">{c.ajuda}</p>}
            {!c.obrigatorio && c.obrigatorioNaEtapaId && (
              <p className="hint mt-1">Exigido para avançar de etapa.</p>
            )}
          </>
        );

        // Arquivado é só leitura: reeditar um campo aposentado grava valor num
        // formulário que já não existe para ninguém mais.
        const travado = !aberta || c.arquivado;

        return (
          <Campo key={c.id} className="sm:col-span-3" label={rotulo} hint={dica}>
            {c.tipo === "opcao" ? (
              <select className="field-input" value={(valor as string) ?? ""} disabled={travado} onChange={(e) => set(c.id, e.target.value)}>
                <option value="">—</option>
                {c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.tipo === "multipla" ? (
              <div className="space-y-1 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                {c.opcoes.map((o) => {
                  const marcados = Array.isArray(valor) ? valor : [];
                  return (
                    <label key={o} className="toque flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={marcados.includes(o)}
                        disabled={travado}
                        onChange={() => set(c.id, marcados.includes(o) ? marcados.filter((x) => x !== o) : [...marcados, o])}
                      />
                      {o}
                    </label>
                  );
                })}
              </div>
            ) : (
              <input
                className="field-input"
                type={c.tipo === "data" ? "date" : "text"}
                inputMode={c.tipo === "numero" ? "decimal" : undefined}
                value={(valor as string) ?? ""}
                disabled={travado}
                onChange={(e) => set(c.id, e.target.value)}
              />
            )}
          </Campo>
        );
      })}
    </div>
  );
}
