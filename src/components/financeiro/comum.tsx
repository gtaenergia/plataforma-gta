"use client";

import { useState } from "react";
import { mesAnterior, proximoMes, rotuloMes } from "@/lib/financeiro/datas";
import type { Evento } from "@/lib/financeiro/motor";
import { useFinanceiro } from "./FinanceiroProvider";

/** Botão "Pago"/"Recebido" (ou "Desfazer"), igual ao do artefato. */
export function BotaoPagar({ e, onErro }: { e: Evento; onErro?: (m: string) => void }) {
  const { pagar, desfazer } = useFinanceiro();
  const [ocupado, setOcupado] = useState(false);
  async function clicar() {
    setOcupado(true);
    const r = e.pago ? await desfazer(e) : await pagar(e);
    setOcupado(false);
    if (!r.ok) onErro?.(r.erro ?? "Não foi possível salvar.");
  }
  if (e.pago) {
    // Só o lançamento gravado pode voltar a "em aberto".
    if (e.virt) return null;
    return (
      <button className="btn sm" type="button" onClick={clicar} disabled={ocupado}>
        Desfazer
      </button>
    );
  }
  return (
    <button className="btn sm pri" type="button" onClick={clicar} disabled={ocupado}>
      {e.k === "r" ? "Recebido" : "Pago"}
    </button>
  );
}

/** ‹ [mês] › — navegação entre meses de uma lista. */
export function SeletorMes({ meses, valor, onChange, rotulo = "Mês" }: { meses: string[]; valor: string; onChange: (m: string) => void; rotulo?: string }) {
  const i = meses.indexOf(valor);
  const ir = (m: string | undefined) => m && onChange(m);
  return (
    <div className="row">
      <button className="btn sm" type="button" aria-label="Mês anterior" disabled={i <= 0} onClick={() => ir(meses[i - 1])}>
        ‹
      </button>
      <select aria-label={rotulo} value={valor} onChange={(e) => onChange(e.target.value)}>
        {meses.map((m) => (
          <option key={m} value={m}>
            {rotuloMes(m)}
          </option>
        ))}
      </select>
      <button className="btn sm" type="button" aria-label="Próximo mês" disabled={i < 0 || i >= meses.length - 1} onClick={() => ir(meses[i + 1])}>
        ›
      </button>
    </div>
  );
}

/** Meses contínuos entre o primeiro e o último (sem buracos no seletor). */
export function mesesEntre(ini: string, fim: string): string[] {
  const out: string[] = [];
  for (let m = ini, n = 0; m <= fim && n < 240; m = proximoMes(m), n++) out.push(m);
  return out;
}

export { mesAnterior, proximoMes };

/** Situação do lançamento: pago/recebido, atrasado ou previsto. */
export function PilulaSituacao({ e }: { e: Evento }) {
  if (e.pago) return <span className="pill good">{e.k === "r" ? "recebido" : "pago"}</span>;
  if (e.atras) return <span className="pill crit">atrasado</span>;
  return <span className="pill neu">previsto</span>;
}
