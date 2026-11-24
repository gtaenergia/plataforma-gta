import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
import { FinanceiroCasca } from "@/components/financeiro/FinanceiroCasca";
import { FinanceiroProvider } from "@/components/financeiro/FinanceiroProvider";
import { requirePageFinanceiro, situacaoCadeado } from "@/lib/financeiro/acesso";
import "./financeiro.css";

// As fontes do artefato: Archivo nos títulos e números grandes, IBM Plex no texto.
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700"], variable: "--fonte-archivo", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-plex", display: "swap" });

export const metadata: Metadata = { title: "Financeiro · Plataforma GTA" };

/**
 * Casca do Financeiro. Fica no layout (e não em cada página) para o estado —
 * os dados carregados, o cartão de conferir saldo — sobreviver à troca de aba.
 * O acesso é conferido aqui e de novo em cada rota de API.
 */
export default async function FinanceiroLayout({ children }: { children: ReactNode }) {
  const user = await requirePageFinanceiro();
  const cadeado = await situacaoCadeado(user);
  return (
    <div className={`min-h-screen ${archivo.variable} ${plex.variable}`}>
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <FinanceiroProvider cadeadoAberto={cadeado.aberto}>
        <FinanceiroCasca>{children}</FinanceiroCasca>
      </FinanceiroProvider>
    </div>
  );
}
