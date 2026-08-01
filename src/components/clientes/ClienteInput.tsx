"use client";

import { useEffect, useState } from "react";
import { cidadeUf as fmtCidadeUf, type Cliente } from "@/lib/clientes/types";

/**
 * Campo "Nome do cliente" com autocomplete a partir do cadastro de clientes
 * (/clientes). Ao escolher um cliente existente, pré-preenche a Cidade/UF.
 * Compartilhado por todos os configuradores — o cliente ainda é gravado como
 * texto na proposta (integração incremental, sem FK).
 */
export function ClienteInput({
  value,
  onNome,
  onCidadeUf,
  className,
  listId = "clientes-datalist",
  id,
  placeholder,
}: {
  value: string;
  onNome: (v: string) => void;
  onCidadeUf?: (v: string) => void;
  className?: string;
  listId?: string;
  /** Permite associar um <label htmlFor> — sem isso o rótulo fica órfão. */
  id?: string;
  placeholder?: string;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => r.json())
      .then((d) => setClientes(d.clientes ?? []))
      .catch(() => {});
  }, []);

  return (
    <>
      <input
        id={id}
        placeholder={placeholder}
        className={className}
        list={listId}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          onNome(v);
          // Casou exatamente com um cliente cadastrado → pré-preenche a Cidade/UF.
          const c = clientes.find((x) => x.nome === v);
          if (c && onCidadeUf) {
            const cu = fmtCidadeUf(c);
            if (cu) onCidadeUf(cu);
          }
        }}
      />
      <datalist id={listId}>
        {clientes.map((c) => (
          <option key={c.id} value={c.nome}>
            {fmtCidadeUf(c) || c.documento || c.segmento || ""}
          </option>
        ))}
      </datalist>
    </>
  );
}
