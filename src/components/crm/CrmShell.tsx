import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import type { User } from "@/lib/users/types";

/**
 * Casca das páginas do CRM.
 *
 * É a mesma casca que as páginas de Operações montam à mão
 * (`<div className="min-h-screen"><AppHeader …/><main className="app-container py-8">`),
 * só que fatorada — são oito telas novas, e repetir o bloco oito vezes seria
 * repetir um defeito futuro oito vezes. As páginas existentes ficam como estão:
 * fatorá-las também exigiria mexer em 22 arquivos, e esta entrega não altera
 * Operações.
 *
 * Ela mesma chama `requirePageUser()`, então a página só descreve o conteúdo.
 * A página que TAMBÉM precisa do usuário (para passar ao conteúdo) o busca e
 * entrega aqui pela prop — assim a consulta continua sendo uma só por visita.
 */
export async function CrmShell({ titulo, subtitulo, children, user: userDaPagina }: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  user?: User;
}) {
  const user = userDaPagina ?? (await requirePageUser());

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} avatarUrl={user.avatarUrl} isAdmin={user.role === "admin"} />
      <main className="app-container py-8">
        <div className="mb-6">
          <PageHeader title={titulo} subtitle={subtitulo} />
        </div>
        {children}
      </main>
    </div>
  );
}
