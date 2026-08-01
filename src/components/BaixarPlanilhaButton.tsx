"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";

/**
 * Botão "Baixar planilha (.xlsx)" — envia os dados calculados do serviço para
 * /api/planilha e baixa a planilha com fórmulas vivas. `dados` é uma função para
 * capturar o estado no momento do clique.
 */
export function BaixarPlanilhaButton({ serviceKey, dados, nome, disabled }: {
  serviceKey: string;
  dados: () => Record<string, unknown>;
  nome?: string;
  disabled?: boolean;
}) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState(false);

  async function baixar() {
    setBaixando(true); setErro(false);
    try {
      const res = await fetch("/api/planilha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceKey, data: dados(), nome }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${nome ?? serviceKey}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro(true);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button type="button" className="btn-secondary inline-flex items-center gap-1.5" onClick={baixar} disabled={disabled || baixando} title="Planilha .xlsx com as fórmulas do cálculo">
      <FileSpreadsheet className="h-4 w-4" />
      {baixando ? "Gerando…" : erro ? "Erro — tentar de novo" : "Baixar planilha (.xlsx)"}
    </button>
  );
}
