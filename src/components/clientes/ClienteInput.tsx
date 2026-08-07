"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@/components/Combobox";
import { cidadeUf as fmtCidadeUf, type Cliente } from "@/lib/clientes/types";

/**
 * Campo "Nome do cliente" com autocomplete a partir do cadastro (/clientes).
 * Ao escolher um cliente existente, pré-preenche a Cidade/UF. Compartilhado por
 * todos os configuradores — o cliente ainda é gravado como texto na proposta
 * (integração incremental, sem FK).
 *
 * Era `<input list=…>` com `<datalist>`; virou `Combobox` para os onze lugares
 * que o usam ganharem o mesmo controle do resto da plataforma de uma vez — a
 * lista com busca, o teclado e o item explícito de "novo cliente", em vez do
 * autocomplete que cada navegador desenha de um jeito.
 */
export function ClienteInput({
  value,
  onNome,
  onCidadeUf,
  id,
  placeholder,
}: {
  value: string;
  onNome: (v: string) => void;
  onCidadeUf?: (v: string) => void;
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
    <Combobox
      id={id}
      value={value}
      placeholder={placeholder ?? "Ex.: CPDF, Fazenda Rio Doce…"}
      options={clientes.map((c) => c.nome)}
      rotuloNovo="Novo cliente: “{v}”"
      onChange={(v) => {
        onNome(v);
        // Casou com um cliente cadastrado → pré-preenche a Cidade/UF.
        const c = clientes.find((x) => x.nome === v);
        if (c && onCidadeUf) {
          const cu = fmtCidadeUf(c);
          if (cu) onCidadeUf(cu);
        }
      }}
    />
  );
}
