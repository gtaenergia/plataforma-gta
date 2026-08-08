"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";
import { Alert } from "@/components/ui";

/**
 * Faixa que aparece na tarefa nascida de uma negociação do CRM.
 *
 * Existe para fechar o circuito: sem o botão daqui, o técnico abriria o
 * configurador pelo menu, a proposta nasceria solta, e o valor nunca voltaria
 * ao comercial — o pedido teria virado de novo um recado sem retorno.
 */
export function PedidoDoComercial({ tarefaId, negociacaoId, temServico }: {
  tarefaId: string;
  negociacaoId: string;
  temServico: boolean;
}) {
  const router = useRouter();
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function montar() {
    setIndo(true);
    setErro(null);
    try {
      const res = await fetch("/api/crm/montar-proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarefaId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falha ao abrir o configurador.");
      router.push(d.destino as string);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao abrir o configurador.");
      setIndo(false);
    }
  }

  return (
    <div className="alert alert-indigo">
      <Handshake className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <strong className="mr-1">Pedido do comercial.</strong>
        Esta tarefa nasceu de uma negociação do CRM. Monte a proposta pelo botão abaixo — assim o valor volta
        automaticamente para quem pediu.
        {erro && <Alert tone="red" className="mt-2">{erro}</Alert>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {temServico ? (
            <button type="button" className="btn-primary !py-1.5 text-sm" onClick={montar} disabled={indo}>
              {indo ? "Abrindo…" : "Montar proposta"}
            </button>
          ) : (
            <span className="hint">
              O pedido não indicou o serviço — abra o configurador por Nova proposta e avise quem pediu.
            </span>
          )}
          <Link href={`/crm/negociacoes/${negociacaoId}`} className="btn-link text-sm">
            Ver a negociação
          </Link>
        </div>
      </div>
    </div>
  );
}
