import type { ReactNode } from "react";
import { Badge, SectionCard } from "@/components/ui";

/**
 * Tela do CRM ainda não implementada.
 *
 * Em vez de uma página em branco, lista o que a tela vai conter. O selo
 * "Em desenvolvimento" já é o vocabulário da plataforma para isto (ver o card
 * de serviço em src/app/page.tsx e o bloco do OneDrive na ficha do orçamento),
 * e a lista serve de especificação à vista de quem for implementar — e de
 * resposta a quem abrir a tela procurando a funcionalidade.
 */
export function EmBreve({ titulo, descricao, itens }: { titulo: ReactNode; descricao: ReactNode; itens: string[] }) {
  return (
    <SectionCard title={titulo} subtitle={descricao} actions={<Badge tone="amber" dot>Em desenvolvimento</Badge>}>
      <p className="hint mb-2">O que esta tela terá</p>
      <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        {itens.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden />
            <span className="min-w-0">{i}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
